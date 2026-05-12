// controllers/concertBooking.controller.js
import mongoose from "mongoose";
import ConcertBooking, { STATUS } from "../models/concertBooking.model.js";
import Concert from "../models/concert.model.js";
import { notifyConcertBookingCreated } from "../services/bookingNotifier.js";

const { isValidObjectId } = mongoose;

/* ------------------------- helpers ------------------------- */
const ALLOWED_STATUSES = Object.values(STATUS);

const canonStr = (v) => (v ?? "").toString().trim();
const canonUser = (u) => (u ?? "").toString().replace(/^@/, "").trim().toLowerCase();

function parseIntSafe(v, def = undefined) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}
function assertObjectIdOr400(res, id, msg = "Bad id") {
  if (!isValidObjectId(id)) {
    res.status(400).json({ message: msg });
    return false;
  }
  return true;
}
function buildSearchRx(q) {
  const esc = String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(esc, "i");
}
function pickUserId(req) {
  const raw = req.body?.userId ?? req.query?.userId;
  return raw && isValidObjectId(raw) ? String(raw) : null;
}

/** Атомарно уменьшить свободные места (если seatsLeft ведётся).
 *  Возвращает { ok: true, concert } если успешно; { ok:false, reason:'no_seats'|'no_concert' } если нет.
 */
async function tryReserveSeats(concertId, seats) {
  const concert = await Concert.findById(concertId).lean();
  if (!concert || concert.isDeleted) return { ok: false, reason: "no_concert" };
  if (concert.seatsLeft == null) return { ok: true, concert }; // не считаем места

  const updated = await Concert.findOneAndUpdate(
    { _id: concertId, seatsLeft: { $gte: seats } },
    { $inc: { seatsLeft: -seats } },
    { new: true }
  ).lean();

  if (!updated) return { ok: false, reason: "no_seats" };
  return { ok: true, concert: updated };
}

/** Вернуть места (если seatsLeft ведётся). Silent */
async function releaseSeats(concertId, seats) {
  const concert = await Concert.findById(concertId).lean();
  if (!concert || concert.isDeleted) return;
  if (concert.seatsLeft == null) return;
  await Concert.updateOne({ _id: concertId }, { $inc: { seatsLeft: seats } });
}

/* ------------------------- create (user) ------------------------- */
/** USER: создать заявку (резерв мест) — user обязателен */
export async function createConcertBooking(req, res) {
    try {
      const {
        concert,            // ObjectId
        telegramId,
        telegramUsername,
        name,
        phone,
        email,
        messenger,
        direction,
        seats,
        toAddress,
        toPlaceId,
        backToAddress,
        backToPlaceId,
        priceEurPerSeat,
        currency,
        comment,
        meta,
      } = req.body || {};
  
      if (!assertObjectIdOr400(res, concert, "Bad concert id")) return;
  
      const userId = pickUserId(req);
      if (!userId) return res.status(400).json({ message: "userId is required" });
  
      const seatsNum = Math.max(1, parseIntSafe(seats, 1));
  
      // 1) Резерв мест (атомарно)
      const reserve = await tryReserveSeats(concert, seatsNum);
      if (!reserve.ok) {
        if (reserve.reason === "no_concert") return res.status(404).json({ message: "Concert not found" });
        if (reserve.reason === "no_seats")  return res.status(409).json({ message: "Недостаточно свободных мест" });
        return res.status(400).json({ message: "Cannot reserve" });
      }
  
      // 2) Создаём бронь; при ошибке — компенсируем места
      const payload = {
        user: userId,
        concert,
        telegramId: telegramId ? String(telegramId) : undefined,
        telegramUsername: canonUser(telegramUsername) || undefined,
        name: canonStr(name) || undefined,
        phone: canonStr(phone) || undefined,
        email: canonStr(email) || undefined,
        messenger: canonStr(messenger) || undefined,
  
        direction: canonStr(direction),
        seats: seatsNum,
  
        toAddress: canonStr(toAddress),
        toPlaceId: canonStr(toPlaceId) || undefined,
  
        backToAddress: canonStr(backToAddress) || undefined,
        backToPlaceId: canonStr(backToPlaceId) || undefined,
  
        priceEurPerSeat: Number(priceEurPerSeat) || 0,
        currency: currency || "EUR",
  
        comment: canonStr(comment) || undefined,
        meta: {
          ip: canonStr(meta?.ip) || undefined,
          userAgent: canonStr(meta?.userAgent) || undefined,
        },
      };
  
      try {
        const created = await ConcertBooking.create(payload);
  
        // 🔔 Уведомление в Telegram (не влияет на ответ клиенту)
        try {
          await notifyConcertBookingCreated(created, reserve.concert);
        } catch (notifyErr) {
          console.error("createConcertBooking notify error:", notifyErr?.message || notifyErr);
        }
  
        return res.status(201).json({ booking: created });
      } catch (e) {
        // компенсируем
        await releaseSeats(concert, seatsNum);
        if (e?.name === "ValidationError") {
          return res.status(400).json({
            message: "Validation error",
            errors: Object.values(e.errors).map((er) => er?.message || er?.kind || er?.path),
          });
        }
        console.error("createConcertBooking", e);
        return res.status(500).json({ message: "Internal error" });
      }
    } catch (e) {
      console.error("createConcertBooking", e);
      res.status(500).json({ message: "Internal error" });
    }
  }
  

/* ------------------------- read one ------------------------- */
/** Получить одну заявку (опционально с проверкой владельца) */
export async function getConcertBooking(req, res) {
  try {
    const { id } = req.params;
    const { telegramId } = req.query;
    const userId = pickUserId(req);

    if (!assertObjectIdOr400(res, id)) return;

    const filter = { _id: id };
    if (userId) filter.user = userId;
    else if (telegramId) filter.telegramId = String(telegramId);

    const doc = await ConcertBooking.findOne(filter).lean();
    if (!doc) return res.status(404).json({ message: "Not found" });

    res.json({ booking: doc });
  } catch (e) {
    console.error("getConcertBooking", e);
    res.status(500).json({ message: "Internal error" });
  }
}

/* ------------------------- list (admin/user) ------------------------- */
/** ADMIN: список всех (или по конкретному юзеру/telegramId) с фильтрами */
export async function adminListConcertBookings(req, res) {
  try {
    const {
      page = "1",
      limit = "20",
      status,
      telegramId,
      direction,
      q,
      from,
      to,
    } = req.query;
    const userId = pickUserId(req);

    const p = Math.max(parseInt(page, 10) || 1, 1);
    const l = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 200);

    const filter = {};
    if (status && ALLOWED_STATUSES.includes(status)) filter.status = status;
    if (direction) filter.direction = direction;

    if (userId) filter.user = userId;
    else if (telegramId) filter.telegramId = String(telegramId);

    if (from || to) {
      const fromD = new Date(from);
      const toD = new Date(to);
      if (!Number.isNaN(+fromD) || !Number.isNaN(+toD)) {
        filter.createdAt = {};
        if (!Number.isNaN(+fromD)) filter.createdAt.$gte = fromD;
        if (!Number.isNaN(+toD)) filter.createdAt.$lte = toD;
      }
    }

    if (q) {
      const rx = buildSearchRx(q);
      filter.$or = [
        { name: rx },
        { phone: rx },
        { email: rx },
        { telegramUsername: rx },
        { telegramId: rx },
        { toAddress: rx },
        { backToAddress: rx },
        { comment: rx },
        { direction: rx },
        { concertName: rx },
      ];
    }

    const [items, total] = await Promise.all([
      ConcertBooking.find(filter).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l).lean(),
      ConcertBooking.countDocuments(filter),
    ]);

    res.json({ page: p, limit: l, total, items, filter });
  } catch (e) {
    console.error("adminListConcertBookings", e);
    res.status(500).json({ message: "Internal error" });
  }
}

/** USER: список заявок пользователя (по userId или telegramId) */
export async function userListConcertBookings(req, res) {
  try {
    const {
      page = "1",
      limit = "20",
      telegramId,
      status,
    } = req.query;
    const userId = pickUserId(req);

    if (!telegramId && !userId) {
      return res.status(400).json({ message: "Owner required (?telegramId= or ?userId=)" });
    }

    const p = Math.max(parseInt(page, 10) || 1, 1);
    const l = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 200);

    const filter = {};
    if (userId) filter.user = userId;
    else if (telegramId) filter.telegramId = String(telegramId);

    if (status && ALLOWED_STATUSES.includes(status)) filter.status = status;

    const [items, total] = await Promise.all([
      ConcertBooking.find(filter).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l).lean(),
      ConcertBooking.countDocuments(filter),
    ]);

    res.json({ page: p, limit: l, total, items, filter });
  } catch (e) {
    console.error("userListConcertBookings", e);
    res.status(500).json({ message: "Internal error" });
  }
}

/* ------------------------- update (user) ------------------------- */
/**
 * USER: изменить разрешённые поля своей заявки:
 * - seats (корректно двигаем seatsLeft концерта атомарно)
 * - toAddress/toPlaceId, backToAddress/backToPlaceId
 * - comment, messenger, phone/email/name
 */
export async function userUpdateConcertBooking(req, res) {
  try {
    const { id } = req.params;
    const { telegramId } = req.query;
    const userId = pickUserId(req);

    if (!assertObjectIdOr400(res, id)) return;
    if (!telegramId && !userId) {
      return res.status(400).json({ message: "Owner required (?telegramId= or ?userId=)" });
    }

    const ownerFilter = userId ? { user: userId } : { telegramId: String(telegramId) };

    const doc = await ConcertBooking.findOne({ _id: id, ...ownerFilter });
    if (!doc) return res.status(404).json({ message: "Not found or no access" });

    if (["canceled", "completed", "expired"].includes(doc.status)) {
      return res.status(409).json({ message: `Cannot update booking in status "${doc.status}"` });
    }

    const incoming = {
      seats: req.body?.seats,
      toAddress: req.body?.toAddress,
      toPlaceId: req.body?.toPlaceId,
      backToAddress: req.body?.backToAddress,
      backToPlaceId: req.body?.backToPlaceId,
      comment: req.body?.comment,
      messenger: req.body?.messenger,
      phone: req.body?.phone,
      email: req.body?.email,
      name: req.body?.name,
    };

    // seats
    if (incoming.seats != null && Number.isFinite(+incoming.seats)) {
      const newSeats = Math.max(1, +incoming.seats);
      const diff = newSeats - doc.seats;

      if (diff !== 0) {
        const c = await Concert.findById(doc.concert).lean();
        if (!c || c.isDeleted) return res.status(409).json({ message: "Concert not available" });

        if (c.seatsLeft != null) {
          if (diff > 0) {
            const ok = await Concert.findOneAndUpdate(
              { _id: c._id, seatsLeft: { $gte: diff } },
              { $inc: { seatsLeft: -diff } },
              { new: true }
            ).lean();
            if (!ok) return res.status(409).json({ message: "Недостаточно свободных мест" });
          } else {
            await Concert.updateOne({ _id: c._id }, { $inc: { seatsLeft: Math.abs(diff) } });
          }
        }

        doc.seats = newSeats;
      }
    }

    // Прочие поля
    const setIf = (k, v) => {
      if (v === undefined) return;
      const t = canonStr(v);
      doc[k] = t || undefined;
    };
    setIf("toAddress", incoming.toAddress);
    setIf("toPlaceId", incoming.toPlaceId);
    setIf("backToAddress", incoming.backToAddress);
    setIf("backToPlaceId", incoming.backToPlaceId);
    setIf("comment", incoming.comment);
    setIf("messenger", incoming.messenger);
    setIf("phone", incoming.phone);
    setIf("email", incoming.email);
    setIf("name", incoming.name);

    const updated = await doc.save();
    return res.json({ booking: updated });
  } catch (e) {
    const msg = e?.message || "Update error";
    console.error("userUpdateConcertBooking", e);
    res.status(400).json({ message: msg });
  }
}

/* ------------------------- cancel (user) ------------------------- */
/** USER: отменить свою заявку (с возвратом мест) */
export async function userCancelConcertBooking(req, res) {
  try {
    const { id } = req.params;
    const { telegramId } = req.query;
    const userId = pickUserId(req);

    if (!assertObjectIdOr400(res, id)) return;
    if (!telegramId && !userId) {
      return res.status(400).json({ message: "Owner required (?telegramId= or ?userId=)" });
    }

    const doc = await ConcertBooking.findOne({
      _id: id,
      ...(userId ? { user: userId } : { telegramId: String(telegramId) }),
    });
    if (!doc) return res.status(404).json({ message: "Not found or no access" });

    if (["canceled", "completed", "expired"].includes(doc.status)) {
      return res.status(409).json({ message: `Already ${doc.status}` });
    }

    // Возврат мест (если ведутся)
    await releaseSeats(doc.concert, doc.seats);

    doc.status = "canceled";
    const canceled = await doc.save();

    return res.json({ booking: canceled });
  } catch (e) {
    const msg = e?.message || "Internal error";
    console.error("userCancelConcertBooking", e);
    res.status(400).json({ message: msg });
  }
}

/* ------------------------- admin patch ------------------------- */
/**
 * ADMIN: частичное редактирование любой заявки.
 * Особые случаи:
 *  - изменение seats корректно двигает seatsLeft концерта (атомарно)
 */
export async function adminPatchConcertBooking(req, res) {
  try {
    const { id } = req.params;
    if (!assertObjectIdOr400(res, id)) return;

    const doc = await ConcertBooking.findById(id);
    if (!doc) return res.status(404).json({ message: "Not found" });

    // seats (правим остаток)
    if (req.body?.seats != null && Number.isFinite(+req.body.seats)) {
      const newSeats = Math.max(1, +req.body.seats);
      const diff = newSeats - doc.seats;

      if (diff !== 0) {
        const c = await Concert.findById(doc.concert).lean();
        if (!c || c.isDeleted) return res.status(409).json({ message: "Concert not available" });

        if (c.seatsLeft != null) {
          if (diff > 0) {
            const ok = await Concert.findOneAndUpdate(
              { _id: c._id, seatsLeft: { $gte: diff } },
              { $inc: { seatsLeft: -diff } },
              { new: true }
            ).lean();
            if (!ok) return res.status(409).json({ message: "Недостаточно свободных мест" });
          } else {
            await Concert.updateOne({ _id: c._id }, { $inc: { seatsLeft: Math.abs(diff) } });
          }
        }
        doc.seats = newSeats;
      }
    }

    // произвольные поля (кроме _id и concert)
    const allowSet = [
      "user", // админ может перевесить на другого владельца
      "telegramId", "telegramUsername", "name", "phone", "email", "messenger",
      "direction",
      "toAddress", "toPlaceId", "backToAddress", "backToPlaceId",
      "priceEurPerSeat", "currency",
      "comment", "meta",
      "isDeleted",
    ];
    const safeStr = (v) => (v === undefined ? v : (String(v).trim() || undefined));

    for (const k of allowSet) {
      if (!(k in req.body)) continue;
      let v = req.body[k];

      if (["telegramId","telegramUsername","name","phone","email","messenger",
           "direction","toAddress","toPlaceId","backToAddress","backToPlaceId",
           "currency","comment"].includes(k)) {
        v = safeStr(v);
      }
      if (k === "priceEurPerSeat" && v !== undefined) {
        const num = Number(v);
        if (!Number.isFinite(num) || num < 0) return res.status(400).json({ message: "priceEurPerSeat must be >= 0" });
        v = num;
      }
      if (k === "currency" && v && !["EUR","RSD"].includes(v)) {
        return res.status(400).json({ message: "Unsupported currency" });
      }
      if (k === "user" && v) {
        if (!isValidObjectId(v)) return res.status(400).json({ message: "Bad user id" });
        v = String(v);
      }

      doc[k] = v;
    }

    const saved = await doc.save();
    return res.json({ booking: saved });
  } catch (e) {
    const msg = e?.message || "Bad request";
    console.error("adminPatchConcertBooking", e);
    res.status(400).json({ message: msg });
  }
}

/* ------------------------- admin status ------------------------- */
/**
 * ADMIN: смена статуса.
 * Если статус меняется на "canceled" — освобождаем места.
 * Простейшая таблица переходов:
 *  - new -> pending|confirmed|canceled
 *  - pending -> confirmed|canceled|expired
 *  - confirmed -> completed|canceled
 *  - completed/expired/canceled -> (финальные, менять нельзя)
 */
function canAdminTransition(from, to) {
  if (from === to) return true;
  switch (from) {
    case "new":       return ["pending", "confirmed", "canceled"].includes(to);
    case "pending":   return ["confirmed", "canceled", "expired"].includes(to);
    case "confirmed": return ["completed", "canceled"].includes(to);
    case "completed":
    case "expired":
    case "canceled":
      return false;
    default:
      return false;
  }
}

export async function adminSetConcertBookingStatus(req, res) {
  try {
    const { id } = req.params;
    const next = String(req.body?.status || "");

    if (!assertObjectIdOr400(res, id)) return;
    if (!ALLOWED_STATUSES.includes(next)) {
      return res.status(400).json({ message: "Invalid status", allowed: ALLOWED_STATUSES });
    }

    const doc = await ConcertBooking.findById(id);
    if (!doc) return res.status(404).json({ message: "Not found" });

    if (!canAdminTransition(doc.status, next)) {
      return res.status(409).json({ message: `Forbidden transition: ${doc.status} → ${next}` });
    }

    // если ставим canceled из активного, возвращаем места
    if (next === "canceled" && !["canceled", "completed", "expired"].includes(doc.status)) {
      await releaseSeats(doc.concert, doc.seats);
    }

    doc.status = next;
    const result = await doc.save();

    return res.json({ booking: result });
  } catch (e) {
    const msg = e?.message || "Internal error";
    console.error("adminSetConcertBookingStatus", e);
    res.status(400).json({ message: msg });
  }
}

/* ------------------------- delete ------------------------- */
/**
 * ADMIN: удалить заявку.
 * Если заявка "живая" (не canceled/completed/expired) и seatsLeft учитывается — освободим места.
 */
export async function adminDeleteConcertBooking(req, res) {
  try {
    const { id } = req.params;
    if (!assertObjectIdOr400(res, id)) return;

    const doc = await ConcertBooking.findById(id);
    if (!doc) return res.status(404).json({ message: "Not found" });

    const active = !["canceled", "completed", "expired"].includes(doc.status);
    if (active) {
      await releaseSeats(doc.concert, doc.seats);
    }

    await ConcertBooking.findByIdAndDelete(id);
    res.json({ deleted: true, booking: doc });
  } catch (e) {
    console.error("adminDeleteConcertBooking", e);
    res.status(500).json({ message: "Internal error" });
  }
}

// controllers/booking.controller.js
import mongoose from 'mongoose';
import Booking, { VEHICLE_TYPES } from '../models/booking.model.js';
import User from '../models/user.model.js';
import { validateCreate } from '../utils/validate.js';
import { notifyBookingCreated } from '../services/bookingNotifier.js';
import { notifyBookingStatusChanged } from '../services/bookingNotifier.js';


const { isValidObjectId } = mongoose;

/* ------------------------- constants / helpers ------------------------- */
const ALLOWED_MESSENGERS = ['telegram', 'whatsapp', 'viber', 'phone', 'email'];
const ALLOWED_SERVICES   = ['visa-runs', 'transfers', 'relocation', 'concerts'];
const ALLOWED_STATUSES   = ['new', 'in_progress', 'done', 'canceledByUser', 'canceledByAdmin'];

const canon = (s = '') => String(s).trim().toLowerCase().replace(/[\s_]+/g, '-');
export async function deleteBooking(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Bad id' });
    }
    const doc = await Booking.findByIdAndDelete(id);
    if (!doc) return res.status(404).json({ message: 'Not found' });
    res.json({ deleted: true, booking: doc });
  } catch (e) {
    console.error('deleteBooking', e);
    res.status(500).json({ message: 'Internal error' });
  }
}

function normalizeMessenger(v) {
  const m = String(v ?? '').trim().toLowerCase();
  return ALLOWED_MESSENGERS.includes(m) ? m : 'telegram';
}
function normalizeService(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return ALLOWED_SERVICES.includes(s) ? s : 'transfers';
}
function normalizeVehicle(v) {
  return VEHICLE_TYPES.includes(v) ? v : 'Седан';
}
function normalizeUsername(u) {
  return (u ?? '').toString().replace(/^@/, '').trim().toLowerCase();
}
function parseDateOrUndef(v) {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(+d) ? undefined : d;
}

/** аккуратно собираем payload под схему модели */
function pickCreatePayload(b) {
  return {
    // контакты
    name: (b.name ?? '').trim() || undefined,
    phone: (b.phone ?? '').trim() || undefined,
    telegramUsername: normalizeUsername(b.telegramUsername),
    telegramId: b.telegramId ? String(b.telegramId) : undefined,

    // канал/сервис
    messenger: normalizeMessenger(b.messenger),
    service: normalizeService(b.service),

    // маршрут + время
    fromCity: (b.fromCity ?? '').trim() || undefined,
    toCity:   (b.toCity ?? '').trim() || undefined,
    dateTime: parseDateOrUndef(b.dateTime),
    comment:  (b.comment ?? '').trim() || undefined,

    // параметры поездки
    passengers: Number.isFinite(+b.passengers) ? +b.passengers : 1,
    bags: Number.isFinite(+b.bags) ? +b.bags : 0,
    vehicle: normalizeVehicle(b.vehicle),

    // вложенные опции по схеме OptionsSchema
    options: {
      needChildSeat: !!(b.options?.needChildSeat ?? b.needChildSeat),
      needBooster:   !!(b.options?.needBooster   ?? b.needBooster),
      hasPet:        !!(b.options?.hasPet        ?? b.hasPet),
    },
  };
}

/** формируем $set для PATCH (без статуса) */
function pickPatchPayload(b) {
  const patch = {};

  if ('name' in b)  patch.name  = (b.name ?? '').trim() || undefined;
  if ('phone' in b) patch.phone = (b.phone ?? '').trim() || undefined;

  if ('telegramUsername' in b) patch.telegramUsername = normalizeUsername(b.telegramUsername);
  if ('messenger' in b)        patch.messenger = normalizeMessenger(b.messenger);
  if ('service' in b)          patch.service   = normalizeService(b.service);

  if ('fromCity' in b) patch.fromCity = (b.fromCity ?? '').trim() || undefined;
  if ('toCity' in b)   patch.toCity   = (b.toCity ?? '').trim() || undefined;
  if ('dateTime' in b) patch.dateTime = parseDateOrUndef(b.dateTime);
  if ('comment' in b)  patch.comment  = (b.comment ?? '').trim() || undefined;

  if ('passengers' in b && Number.isFinite(+b.passengers)) patch.passengers = +b.passengers;
  if ('bags' in b && Number.isFinite(+b.bags))             patch.bags       = +b.bags;
  if ('vehicle' in b)                                      patch.vehicle    = normalizeVehicle(b.vehicle);

  // options: принимаем либо вложенный объект, либо плоские флаги
  const hasOptKey = ['options', 'needChildSeat', 'needBooster', 'hasPet'].some(k => k in b);
  if (hasOptKey) {
    patch.options = {
      needChildSeat: !!(b.options?.needChildSeat ?? b.needChildSeat),
      needBooster:   !!(b.options?.needBooster   ?? b.needBooster),
      hasPet:        !!(b.options?.hasPet        ?? b.hasPet),
    };
  }

  return patch;
}

/** безопасные переходы статуса */
function canTransition(from, to, { by = 'admin' } = {}) {
  if (from === to) return true;
  if (by === 'user') {
    return to === 'canceledByUser' && !['done', 'canceledByUser', 'canceledByAdmin'].includes(from);
  }
  switch (from) {
    case 'new':         return ['in_progress', 'done', 'canceledByAdmin'].includes(to);
    case 'in_progress': return ['done', 'canceledByAdmin'].includes(to);
    case 'done':        return false;
    case 'canceledByUser':
    case 'canceledByAdmin':
      return false;
    default:
      return false;
  }
}
function assertStatusOr400(res, status) {
  if (!ALLOWED_STATUSES.includes(status)) {
    res.status(400).json({ message: 'Invalid status', allowed: ALLOWED_STATUSES });
    return false;
  }
  return true;
}

/** мягкий автолинк пользователя по telegram, работает и без кастомного метода модели */
async function ensureUserByTelegram({ telegramId, username, firstName, lastName, phone }) {
  if (!telegramId) return null;

  // если есть кастомный метод — используем его
  if (typeof User.findOrCreateByTelegram === 'function') {
    return User.findOrCreateByTelegram({ telegramId, username, firstName, lastName, phone });
  }

  // иначе — upsert по telegramId
  const update = {
    $setOnInsert: { telegramId: String(telegramId) },
    $set: {
      username: normalizeUsername(username),
      firstName: (firstName ?? '').trim() || undefined,
      lastName: (lastName ?? '').trim() || undefined,
      phone: (phone ?? '').trim() || undefined,
    },
  };
  const opts = { new: true, upsert: true };
  return User.findOneAndUpdate({ telegramId: String(telegramId) }, update, opts);
}

/* ------------------------------- controllers ------------------------------- */

/** Создать заявку + автолинк к User по telegramId */
export async function createBooking(req, res) {
  try {
    const errors = validateCreate(req.body);
    if (errors?.length) return res.status(400).json({ errors });

    const telegramId = req.body.telegramId ? String(req.body.telegramId) : undefined;
    const telegramUsername = normalizeUsername(req.body.telegramUsername);

    let user = null;
    if (telegramId) {
      user = await ensureUserByTelegram({
        telegramId,
        username: telegramUsername,
        firstName: req.body.firstName,
        lastName:  req.body.lastName,
        phone:     req.body.phone,
      });
    }

    const payload = pickCreatePayload(req.body);
    if (user?._id) payload.user = user._id;

    const created = await Booking.create(payload);

    // 🔔 не блокируем основной ответ: шлём в фоне
    notifyBookingCreated(created).catch(() => { /* уже залогировано внутри */ });

    return res.status(201).json({ booking: created });
  } catch (e) {
    if (e?.name === 'ValidationError') {
      return res.status(400).json({
        message: 'Validation error',
        errors: Object.values(e.errors).map(er => er?.message || er?.kind || er?.path),
      });
    }
    console.error('createBooking', e);
    return res.status(500).json({ message: 'Internal error' });
  }
}


/** Получить одну заявку (с опц. фильтром по владельцу) */
export async function getBooking(req, res) {
  try {
    const { id } = req.params;
    const { userId, telegramId } = req.query;

    if (!isValidObjectId(id)) return res.status(400).json({ message: 'Bad id' });

    const filter = { _id: id };
    if (userId && isValidObjectId(userId)) filter.user = userId;
    else if (telegramId) filter.telegramId = String(telegramId);

    const item = await Booking.findOne(filter);
    if (!item) return res.status(404).json({ message: 'Not found' });

    res.json({ booking: item });
  } catch (e) {
    console.error('getBooking', e);
    res.status(400).json({ message: 'Bad id' });
  }
}

/** Список заявок (пагинация/фильтры/поиск) */
export async function listBookings(req, res) {
  try {
    const {
      page = '1',
      limit = '20',
      status,
      service,
      q,
      telegramId,
      userId,
      from, // ISO: фильтр по дате создания
      to,   // ISO
    } = req.query;

    const p = Math.max(parseInt(page, 10) || 1, 1);
    const l = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 200);

    const filter = {};
    if (status && ALLOWED_STATUSES.includes(status)) filter.status = status;
    if (service && ALLOWED_SERVICES.includes(service)) filter.service = service;

    if (userId && isValidObjectId(userId)) filter.user = userId;
    else if (telegramId) filter.telegramId = String(telegramId);

    if (from || to) {
      filter.createdAt = {};
      const fromD = parseDateOrUndef(from);
      const toD   = parseDateOrUndef(to);
      if (fromD) filter.createdAt.$gte = fromD;
      if (toD)   filter.createdAt.$lte = toD;
      if (!Object.keys(filter.createdAt).length) delete filter.createdAt;
    }

    if (q) {
      const esc = String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(esc, 'i');
      filter.$or = [
        { name: rx },
        { phone: rx },
        { telegramUsername: rx },
        { fromCity: rx },
        { toCity: rx },
        { vehicle: rx },
        { telegramId: rx },
        { comment: rx },
      ];
    }

    const [items, total] = await Promise.all([
      Booking.find(filter).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l).lean(),
      Booking.countDocuments(filter),
    ]);

    res.json({ page: p, limit: l, total, items });
  } catch (e) {
    console.error('listBookings', e);
    res.status(500).json({ message: 'Internal error' });
  }
}

/** PATCH произвольных полей (без статуса) — админская ручка */
export async function patchBooking(req, res) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: 'Bad id' });

    // защита: статус меняется только спец. ручками
    if (typeof req.body?.status === 'string') {
      return res.status(400).json({ message: 'Use /status endpoint to change status' });
    }

    const patch = pickPatchPayload(req.body);
    const updated = await Booking.findByIdAndUpdate(id, { $set: patch }, { new: true });
    if (!updated) return res.status(404).json({ message: 'Not found' });

    res.json({ booking: updated });
  } catch (e) {
    console.error('patchBooking', e);
    res.status(400).json({ message: 'Bad request' });
  }
}

/** Поменять статус (админская ручка) */


/** USER: обновить разрешённые поля своей заявки */
export async function updateBooking(req, res) {
  try {
    const { id } = req.params;
    const { telegramId, userId } = req.query;

    if (!isValidObjectId(id)) return res.status(400).json({ message: 'Bad id' });
    if (!telegramId && !userId) {
      return res.status(400).json({ message: 'Owner required (?telegramId= or ?userId=)' });
    }

    const ownerFilter = telegramId ? { telegramId: String(telegramId) } : { user: userId };

    // Белый список полей, доступных пользователю
    const allowedKeys = [
      'fromCity', 'toCity', 'dateTime', 'comment', 'passengers', 'bags', 'vehicle',
      'needChildSeat', 'needBooster', 'hasPet', 'options',
    ];
    const incoming = {};
    for (const k of allowedKeys) if (k in req.body) incoming[k] = req.body[k];

    const patch = pickPatchPayload(incoming);

    // Статус пользователь менять не может (кроме отмены ниже)
    if (typeof req.body?.status === 'string' && req.body.status !== 'canceledByUser') {
      return res.status(400).json({ message: 'User cannot change status directly' });
    }

    // Быстрая отмена — отдельно валидируем переход
    if (req.body?.status === 'canceledByUser') {
      const doc = await Booking.findOne({ _id: id, ...ownerFilter });
      if (!doc) return res.status(404).json({ message: 'Not found or no access' });
    
      const next = 'canceledByUser';
      if (!canTransition(doc.status, next, { by: 'user' })) {
        return res.status(409).json({ message: `Cannot cancel: current status is "${doc.status}"` });
      }
      const prev = doc.status;        // ← фиксируем предыдущее
      Object.assign(doc, patch);
      doc.status = next;
      await doc.save();
    
      // 🔔 уведомление
      notifyBookingStatusChanged(doc, prev, 'user').catch(() => {});
    
      return res.json({ booking: doc });
    }
    

    const updated = await Booking.findOneAndUpdate(
      { _id: id, ...ownerFilter },
      { $set: patch },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: 'Not found or no access' });

    res.json({ booking: updated });
  } catch (e) {
    console.error('updateBooking', e);
    res.status(500).json({ message: 'Update error' });
  }
}

/** USER: отменить свою заявку (шорткат) */
export async function userCancelBooking(req, res) {
  try {
    const { id } = req.params;
    const { telegramId, userId } = req.query;

    if (!isValidObjectId(id)) return res.status(400).json({ message: 'Bad id' });
    if (!telegramId && !userId) {
      return res.status(400).json({ message: 'Owner required (?telegramId= or ?userId=)' });
    }

    const ownerFilter = telegramId ? { telegramId: String(telegramId) } : { user: userId };

    const doc = await Booking.findOne({ _id: id, ...ownerFilter });
    if (!doc) return res.status(404).json({ message: 'Not found or no access' });

    const next = 'canceledByUser';
    if (!canTransition(doc.status, next, { by: 'user' })) {
      return res.status(409).json({ message: `Cannot cancel: current status is "${doc.status}"` });
    }

    const prev = doc.status;
    doc.status = next;
    await doc.save();

    // 🔔 уведомление: статус изменён пользователем
    notifyBookingStatusChanged(doc, prev, 'user').catch(() => {});

    res.json({ booking: doc });
  } catch (e) {
    console.error('userCancelBooking', e);
    res.status(500).json({ message: 'Internal error' });
  }
}

/* ------------------------- admin shortcuts (sugar) ------------------------- */
export async function adminSetStatus(req, res) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: 'Bad id' });

    const next = String(req.body?.status ?? '');
    if (!assertStatusOr400(res, next)) return;

    const doc = await Booking.findById(id);
    if (!doc) return res.status(404).json({ message: 'Not found' });

    if (!canTransition(doc.status, next, { by: 'admin' })) {
      return res.status(409).json({ message: `Forbidden transition: ${doc.status} → ${next}` });
    }

    const prev = doc.status;         // ← сохраним старый статус
    doc.status = next;
    await doc.save();

    // 🔔 уведомление об изменении статуса (не блокируем ответ)
    notifyBookingStatusChanged(doc, prev, 'admin').catch(() => {});

    res.json({ booking: doc });
  } catch (e) {
    console.error('adminSetStatus', e);
    res.status(500).json({ message: 'Internal error' });
  }
}


export async function adminStartProgress(req, res) { return adminSetTo(req, res, 'in_progress'); }
export async function adminMarkDone(req, res)       { return adminSetTo(req, res, 'done'); }
export async function adminCancelByAdmin(req, res)  { return adminSetTo(req, res, 'canceledByAdmin'); }

async function adminSetTo(req, res, targetStatus) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: 'Bad id' });

    if (!assertStatusOr400(res, targetStatus)) return;

    const doc = await Booking.findById(id);
    if (!doc) return res.status(404).json({ message: 'Not found' });

    if (!canTransition(doc.status, targetStatus, { by: 'admin' })) {
      return res.status(409).json({ message: `Forbidden transition: ${doc.status} → ${targetStatus}` });
    }

    const prev = doc.status;     // ← до изменения
    doc.status = targetStatus;
    await doc.save();

    // 🔔 уведомление
    notifyBookingStatusChanged(doc, prev, 'admin').catch(() => {});

    res.json({ booking: doc });
  } catch (e) {
    console.error('adminSetTo', e);
    res.status(500).json({ message: 'Internal error' });
  }
}

/** ADMIN: удалить сразу много заявок (по фильтрам) */
export async function adminDeleteAllBookings(req, res) {
  try {
    const {
      confirm,        // "yes" — реальное удаление, иначе 400
      dryRun,         // "1" — только посчитать, не удалять
      service,        // 'transfers' | 'visa-runs' | ...
      status,         // 'new' | 'in_progress' | ...
      telegramId,     // строка
      userId,         // ObjectId
      from,           // ISO дата для фильтра createdAt >= from
      to,             // ISO дата для фильтра createdAt <= to
      q,              // поисковая строка
    } = req.query;

    // фильтр как в listBookings
    const filter = {};
    if (service && ['visa-runs','transfers','relocation','concerts'].includes(service)) {
      filter.service = service;
    }
    if (status && ['new','in_progress','done','canceledByUser','canceledByAdmin'].includes(status)) {
      filter.status = status;
    }
    if (userId && isValidObjectId(userId)) {
      filter.user = userId;
    } else if (telegramId) {
      filter.telegramId = String(telegramId);
    }

    if (from || to) {
      const fromD = parseDateOrUndef(from);
      const toD   = parseDateOrUndef(to);
      if (fromD || toD) {
        filter.createdAt = {};
        if (fromD) filter.createdAt.$gte = fromD;
        if (toD)   filter.createdAt.$lte = toD;
      }
    }

    if (q) {
      const esc = String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(esc, 'i');
      filter.$or = [
        { name: rx },
        { phone: rx },
        { telegramUsername: rx },
        { fromCity: rx },
        { toCity: rx },
        { vehicle: rx },
        { telegramId: rx },
        { comment: rx },
      ];
    }

    // только посчитать?
    if (String(dryRun) === '1') {
      const total = await Booking.countDocuments(filter);
      return res.json({ dryRun: true, total, filter });
    }

    // реальное удаление — только с подтверждением
    if (confirm !== 'yes') {
      const total = await Booking.countDocuments(filter);
      return res.status(400).json({
        message: 'Add confirm=yes to really delete',
        hint: 'You can pass dryRun=1 to preview the count',
        total,
        filter,
      });
    }

    const result = await Booking.deleteMany(filter);
    return res.json({ deletedCount: result?.deletedCount ?? 0, filter });
  } catch (e) {
    console.error('adminDeleteAllBookings', e);
    res.status(500).json({ message: 'Internal error' });
  }
}

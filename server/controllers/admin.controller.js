// controllers/admin.controller.js
import Booking from '../models/booking.model.js';
import User from '../models/user.model.js';
import GiveawayParticipant from '../models/giveawayParticipant.model.js';

// НОВОЕ:
import Concert from '../models/concert.model.js';
import TransferRide from '../models/transferRide.model.js';    // проверь путь/имя файла
import TransferRoute from '../models/transferRoute.model.js';  // проверь путь/имя файла
import { withFullImageUrls } from '../utils/publicUrl.js';

/* ---------------------------- helpers ---------------------------- */
const pick = (src, allow) => {
  const out = {};
  allow.forEach((k) => { if (src?.[k] !== undefined) out[k] = src[k]; });
  return out;
};
const parseLimit = (v, max = 500, def = 100) =>
  Math.min(parseInt(v ?? def, 10) || def, max);

const asBool = (v) => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return ['1','true','yes','on'].includes(v.toLowerCase());
  return undefined;
};

// 🔐 Жёсткая админ-проверка (роль задаётся auth-middleware через req.actor)
const isAdmin = (req) =>
  req?.actor?.role === 'admin' || req?.actor?.isPrivileged === true;

// Унифицированный отказ
const forbid = (res) => res.status(403).json({ ok: false, error: 'forbidden' });

// Удобный хелпер для начала каждого контроллера
const ensureAdmin = (req, res) => {
  if (!req?.actor) {
    // нет закреплённого актора — не прошли подпись initData / авторизацию
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return false;
  }
  if (!isAdmin(req)) {
    forbid(res);
    return false;
  }
  return true;
};

/* ========================== WHOAMI / BOOKING / USERS ========================== */
// whoami теперь чётко сигнализирует о правах:
//  - admin → 200 { ok:true, isAdmin:true, telegramId, role }
//  - не админ → 403 { ok:false, isAdmin:false }
export function whoami(req, res) {
  const actor = req.actor || {};
  const { telegramId, role, isPrivileged } = actor;
  // для сырого варианта просто возвращаем флаг без 403
  return res.json({
    ok: true,
    isAdmin: isAdmin(req),
    telegramId: telegramId || null,
    role: role || 'client',
    isPrivileged: !!isPrivileged,
  });
}

export async function listBookings(req, res) {
  if (!ensureAdmin(req, res)) return;

  const { status, limit = '100', from, to, service } = req.query;

  const q = {};
  if (status) q.status = status;
  if (service) q.service = service;
  if (from || to) {
    q.whenAt = {};
    if (from) q.whenAt.$gte = new Date(from);
    if (to) q.whenAt.$lte = new Date(to);
  }

  const items = await Booking.find(q)
    .sort({ createdAt: -1 })
    .limit(parseLimit(limit));

  res.json({ items });
}

export async function updateBooking(req, res) {
  if (!ensureAdmin(req, res)) return;

  const { id } = req.params;
  const allowed = [
    'status',
    'driverName',
    'driverPhone',
    'internalNote',
    'priceRsd',
    'priceEur',
    'whenAt',
    'vehicle',
    'passengers',
  ];
  const patch = pick(req.body || {}, allowed);
  const updated = await Booking.findByIdAndUpdate(id, { $set: patch }, { new: true });
  if (!updated) return res.status(404).json({ message: 'Booking not found' });
  res.json(updated);
}

export async function deleteBooking(req, res) {
  if (!ensureAdmin(req, res)) return;

  const { id } = req.params;
  const removed = await Booking.findByIdAndDelete(id);
  if (!removed) return res.status(404).json({ message: 'Booking not found' });
  res.json({ ok: true, id });
}

export async function stats(req, res) {
  if (!ensureAdmin(req, res)) return;

  const [total, byStatus, last24h, giveawayTotal, giveawayLast24h, giveawayByDay] = await Promise.all([
    Booking.countDocuments({}),
    Booking.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $project: { _id: 0, status: '$_id', count: 1 } },
    ]),
    Booking.countDocuments({ createdAt: { $gte: new Date(Date.now() - 24 * 3600_000) } }),
    GiveawayParticipant.countDocuments({}),
    GiveawayParticipant.countDocuments({ createdAt: { $gte: new Date(Date.now() - 24 * 3600_000) } }),
    GiveawayParticipant.aggregate([
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt',
              timezone: 'Europe/Belgrade',
            },
          },
          count: { $sum: 1 },
        },
      },
      { $project: { _id: 0, date: '$_id', count: 1 } },
      { $sort: { date: -1 } },
      { $limit: 60 },
    ]),
  ]);

  res.json({
    total,
    last24h,
    byStatus,
    giveaway: {
      total: giveawayTotal,
      last24h: giveawayLast24h,
      byDay: giveawayByDay,
    },
  });
}

export async function listUsers(req, res) {
  if (!ensureAdmin(req, res)) return;

  try {
    const limit = parseLimit(req.query.limit);
    const items = await User.find({}).sort({ createdAt: -1 }).limit(limit);
    res.json({ items });
  } catch (e) {
    res.status(500).json({ message: e?.message || 'Error' });
  }
}

export async function listGiveawayParticipants(req, res) {
  if (!ensureAdmin(req, res)) return;

  try {
    const limit = parseLimit(req.query.limit, 500, 100);
    const page = Math.max(parseInt(req.query.page ?? '1', 10) || 1, 1);
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      GiveawayParticipant.find({})
        .sort({ startedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'telegramId username firstName lastName')
        .lean(),
      GiveawayParticipant.countDocuments({}),
    ]);

    const normalizedItems = items.map((item) => {
      const user = item?.userId && typeof item.userId === 'object' ? item.userId : null;
      return {
        ...item,
        userId: user?._id ? String(user._id) : item.userId ? String(item.userId) : null,
        telegramId: item.telegramId || user?.telegramId || '',
        username: item.username || user?.username || '',
        firstName: item.firstName || user?.firstName || '',
        lastName: item.lastName || user?.lastName || '',
      };
    });

    res.json({ page, limit, total, items: normalizedItems });
  } catch (e) {
    res.status(500).json({ message: e?.message || 'Error' });
  }
}

/* =============================== CONCERTS (CRUD + фильтры) =============================== */
/**
 * query:
 * - q: текстовый поиск (name/description/location)
 * - from, to: границы по startAt (ISO)
 * - status: 'upcoming' | 'past'
 * - withDeleted: true/false (по умолчанию скрываем удалённые)
 * - limit
 * - sort: 'startAt:asc' | 'startAt:desc' (по умолчанию asc для актуальных)
 */
export async function listConcerts(req, res) {
  if (!ensureAdmin(req, res)) return;

  const { q: qText, from, to, status, withDeleted, limit, sort } = req.query;

  const q = {};
  const includeDeleted = asBool(withDeleted) === true;
  if (!includeDeleted) q.isDeleted = { $ne: true };

  if (qText) {
    q.$text = { $search: qText };
  }

  if (from || to) {
    q.startAt = {};
    if (from) q.startAt.$gte = new Date(from);
    if (to) q.startAt.$lte = new Date(to);
  }

  if (status === 'upcoming') {
    q.startAt = { ...(q.startAt || {}), $gte: new Date() };
  } else if (status === 'past') {
    q.startAt = { ...(q.startAt || {}), $lt: new Date() };
  }

  let sortObj = { startAt: 1 };
  if (sort) {
    const [field, dir] = String(sort).split(':');
    sortObj = { [field]: (dir === 'desc' ? -1 : 1) };
  } else if (status === 'past') {
    sortObj = { startAt: -1 };
  }

  const items = await Concert.find(q)
    .sort(sortObj)
    .limit(parseLimit(limit, 500, 100));

  res.json({ items: withFullImageUrls(items.map((d) => (d.toJSON ? d.toJSON() : d))) });
}

export async function getConcert(req, res) {
  if (!ensureAdmin(req, res)) return;

  const { id } = req.params;
  const includeDeleted = asBool(req.query.withDeleted) === true;
  const doc = await Concert.findById(id).select(includeDeleted ? undefined : { imageUrl: 0 });
  if (!doc) return res.status(404).json({ message: 'Concert not found' });
  if (!includeDeleted && doc.isDeleted) return res.status(404).json({ message: 'Concert not found' });
  res.json(withFullImageUrls(doc.toJSON ? doc.toJSON() : doc));
}

export async function createConcert(req, res) {
  if (!ensureAdmin(req, res)) return;

  const allowed = [
    'name', 'location', 'capacityLabel', 'description',
    'images', 'startAt', 'seatsLeft'
  ];
  const data = pick(req.body || {}, allowed);

  if (!data?.name) return res.status(400).json({ message: 'name is required' });
  if (!data?.startAt) return res.status(400).json({ message: 'startAt is required' });

  // нормализуем images (если пришёл массив)
  if (Array.isArray(data.images)) {
    data.images = data.images.map((i) => ({
      url: i.url,
      alt: i.alt,
      isCover: !!i.isCover,
      sortOrder: i.sortOrder ?? 0,
    }));
  }

  const created = await Concert.create(data);
  res.status(201).json(withFullImageUrls(created.toJSON ? created.toJSON() : created));
}

export async function updateConcert(req, res) {
  if (!ensureAdmin(req, res)) return;

  const { id } = req.params;
  const allowed = [
    'name', 'location', 'capacityLabel', 'description',
    'images', 'startAt', 'seatsLeft', 'isDeleted'
  ];
  const patch = pick(req.body || {}, allowed);

  if (patch.images && Array.isArray(patch.images)) {
    patch.images = patch.images.map((i) => ({
      url: i.url,
      alt: i.alt,
      isCover: !!i.isCover,
      sortOrder: i.sortOrder ?? 0,
      _id: i._id, // позволит обновлять/сохранять существующие сабдоки
    }));
  }

  const updated = await Concert.findByIdAndUpdate(id, { $set: patch }, { new: true });
  if (!updated) return res.status(404).json({ message: 'Concert not found' });
  res.json(withFullImageUrls(updated.toJSON ? updated.toJSON() : updated));
}

/** Мягкое удаление (isDeleted = true) */
export async function deleteConcert(req, res) {
  if (!ensureAdmin(req, res)) return;

  const { id } = req.params;
  const updated = await Concert.findByIdAndUpdate(id, { $set: { isDeleted: true } }, { new: true });
  if (!updated) return res.status(404).json({ message: 'Concert not found' });
  res.json({ ok: true, id, isDeleted: true });
}

/** Восстановление (isDeleted = false) */
export async function restoreConcert(req, res) {
  if (!ensureAdmin(req, res)) return;

  const { id } = req.params;
  const updated = await Concert.findByIdAndUpdate(id, { $set: { isDeleted: false } }, { new: true });
  if (!updated) return res.status(404).json({ message: 'Concert not found' });
  res.json(withFullImageUrls(updated.toJSON ? updated.toJSON() : updated));
}

/** Полное удаление (purge) — осторожно */
export async function purgeConcert(req, res) {
  if (!ensureAdmin(req, res)) return;

  const { id } = req.params;
  const removed = await Concert.findByIdAndDelete(id);
  if (!removed) return res.status(404).json({ message: 'Concert not found' });
  res.json({ ok: true, id });
}

/* ============================ TRANSFER RIDES (попутные) ============================ */
/**
 * query:
 * - dateISO, fromCity, toCity, status
 * - minSeats (число)
 * - limit
 */
export async function listTransferRides(req, res) {
  if (!ensureAdmin(req, res)) return;

  const { dateISO, fromCity, toCity, status, minSeats, limit } = req.query;
  const q = {};
  if (dateISO) q.dateISO = dateISO;
  if (fromCity) q.fromCity = fromCity;
  if (toCity) q.toCity = toCity;
  if (status) q.status = status;
  if (minSeats !== undefined) q.seatsLeft = { $gte: Number(minSeats) || 0 };

  const items = await TransferRide.find(q)
    .sort({ dateISO: 1, time: 1 })
    .limit(parseLimit(limit, 500, 100));
  res.json({ items });
}

export async function getTransferRide(req, res) {
  if (!ensureAdmin(req, res)) return;

  const { id } = req.params;
  const doc = await TransferRide.findById(id);
  if (!doc) return res.status(404).json({ message: 'Ride not found' });
  res.json(doc);
}

export async function createTransferRide(req, res) {
  if (!ensureAdmin(req, res)) return;

  const allowed = ['dateISO', 'time', 'fromCity', 'toCity', 'pricePerSeat', 'seatsLeft', 'note', 'status'];
  const data = pick(req.body || {}, allowed);

  // минимальная валидация
  for (const f of ['dateISO', 'time', 'fromCity', 'toCity', 'pricePerSeat']) {
    if (!data[f]) return res.status(400).json({ message: `${f} is required` });
  }
  if (data.seatsLeft == null) data.seatsLeft = 0;

  const created = await TransferRide.create(data);
  res.status(201).json(created);
}

export async function updateTransferRide(req, res) {
  if (!ensureAdmin(req, res)) return;

  const { id } = req.params;
  const allowed = ['dateISO', 'time', 'fromCity', 'toCity', 'pricePerSeat', 'seatsLeft', 'note', 'status'];
  const patch = pick(req.body || {}, allowed);

  const updated = await TransferRide.findByIdAndUpdate(id, { $set: patch }, { new: true });
  if (!updated) return res.status(404).json({ message: 'Ride not found' });
  res.json(updated);
}

export async function deleteTransferRide(req, res) {
  if (!ensureAdmin(req, res)) return;

  const { id } = req.params;
  const removed = await TransferRide.findByIdAndDelete(id);
  if (!removed) return res.status(404).json({ message: 'Ride not found' });
  res.json({ ok: true, id });
}

/* ============================ TRANSFER ROUTES (стандартные) ============================ */
/**
 * query:
 * - fromCity, toCity, status
 * - limit
 */
export async function listTransferRoutes(req, res) {
  if (!ensureAdmin(req, res)) return;

  const { fromCity, toCity, status, limit } = req.query;
  const q = {};
  if (fromCity) q.fromCity = fromCity;
  if (toCity) q.toCity = toCity;
  if (status) q.status = status;

  const items = await TransferRoute.find(q)
    .sort({ fromCity: 1, toCity: 1 })
    .limit(parseLimit(limit, 500, 100));
  res.json({ items });
}

export async function getTransferRoute(req, res) {
  if (!ensureAdmin(req, res)) return;

  const { id } = req.params;
  const doc = await TransferRoute.findById(id);
  if (!doc) return res.status(404).json({ message: 'Route not found' });
  res.json(doc);
}

export async function createTransferRoute(req, res) {
  if (!ensureAdmin(req, res)) return;

  const allowed = ['fromCity', 'toCity', 'dayPrice', 'nightPrice', 'groupPrice', 'duration', 'status'];
  const data = pick(req.body || {}, allowed);

  for (const f of ['fromCity', 'toCity', 'dayPrice', 'nightPrice']) {
    if (!data[f]) return res.status(400).json({ message: `${f} is required` });
  }

  const created = await TransferRoute.create(data);
  res.status(201).json(created);
}

export async function updateTransferRoute(req, res) {
  if (!ensureAdmin(req, res)) return;

  const { id } = req.params;
  const allowed = ['fromCity', 'toCity', 'dayPrice', 'nightPrice', 'groupPrice', 'duration', 'status'];
  const patch = pick(req.body || {}, allowed);

  const updated = await TransferRoute.findByIdAndUpdate(id, { $set: patch }, { new: true });
  if (!updated) return res.status(404).json({ message: 'Route not found' });
  res.json(updated);
}

export async function deleteTransferRoute(req, res) {
  if (!ensureAdmin(req, res)) return;

  const { id } = req.params;
  const removed = await TransferRoute.findByIdAndDelete(id);
  if (!removed) return res.status(404).json({ message: 'Route not found' });
  res.json({ ok: true, id });
}

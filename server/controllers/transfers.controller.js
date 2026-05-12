import mongoose from 'mongoose';
import TransferRoute from '../models/transferRoute.model.js';
import TransferRide from '../models/transferRide.model.js';
import TransferBooking from '../models/transferBooking.model.js';
import User from '../models/user.model.js';

const { isValidObjectId } = mongoose;
const canon = (s='') => String(s).trim();
const bad = (res, code, msg) => res.status(code).json({ error: msg });

// ===== Admin helpers =====
export const requireAdmin = (req, res, next) => {
  // Заглушка. Подключите свою auth/role систему.
  // Например, req.user?.role === 'admin' или токен в заголовке:
  const token = req.headers['x-admin-token'];
  if (token && token === process.env.ADMIN_TOKEN) return next();
  return bad(res, 403, 'admin only');
};

// ===== ROUTES (templates) =====
export async function listRoutes(req, res) {
  const q = {};
  if (req.query.status) q.status = req.query.status;
  const items = await TransferRoute.find(q).sort({ fromCity: 1, toCity: 1 }).lean();
  res.json({ items });
}

export async function createRoute(req, res) {
  const payload = {
    fromCity:  canon(req.body.fromCity),
    toCity:    canon(req.body.toCity),
    dayPrice:  canon(req.body.dayPrice),
    nightPrice:canon(req.body.nightPrice),
    groupPrice: req.body.groupPrice ? canon(req.body.groupPrice) : undefined,
    duration:   req.body.duration ? canon(req.body.duration) : undefined,
    status:     req.body.status || 'published',
  };
  if (!payload.fromCity || !payload.toCity || !payload.dayPrice || !payload.nightPrice) {
    return bad(res, 400, 'fromCity, toCity, dayPrice, nightPrice required');
  }
  const created = await TransferRoute.create(payload);
  res.status(201).json({ route: created });
}

export async function updateRoute(req, res) {
  const { id } = req.params;
  if (!isValidObjectId(id)) return bad(res, 400, 'invalid id');

  const patch = {};
  ['fromCity','toCity','dayPrice','nightPrice','groupPrice','duration','status']
    .forEach(k => { if (req.body[k] != null) patch[k] = canon(req.body[k]); });

  const updated = await TransferRoute.findByIdAndUpdate(id, { $set: patch }, { new: true });
  if (!updated) return bad(res, 404, 'not found');
  res.json({ route: updated });
}

export async function deleteRoute(req, res) {
  const { id } = req.params;
  if (!isValidObjectId(id)) return bad(res, 400, 'invalid id');
  const doc = await TransferRoute.findByIdAndDelete(id);
  if (!doc) return bad(res, 404, 'not found');
  res.json({ ok: true });
}

// ===== RIDES (shared) =====
export async function listRides(req, res) {
  const q = {};
  if (req.query.dateISO) q.dateISO = req.query.dateISO;
  if (req.query.status) q.status = req.query.status;
  if (req.query.fromCity) q.fromCity = req.query.fromCity;
  if (req.query.toCity) q.toCity = req.query.toCity;

  const items = await TransferRide.find(q).sort({ dateISO: 1, time: 1 }).lean();
  res.json({ items });
}

export async function createRide(req, res) {
  const payload = {
    dateISO:     canon(req.body.dateISO),
    time:        canon(req.body.time),
    fromCity:    canon(req.body.fromCity),
    toCity:      canon(req.body.toCity),
    pricePerSeat:canon(req.body.pricePerSeat),
    seatsLeft:   Number(req.body.seatsLeft ?? 0),
    note:        req.body.note ? canon(req.body.note) : undefined,
    status:      req.body.status || 'published',
  };
  if (!payload.dateISO || !payload.time || !payload.fromCity || !payload.toCity || !payload.pricePerSeat) {
    return bad(res, 400, 'dateISO, time, fromCity, toCity, pricePerSeat required');
  }
  if (!(payload.seatsLeft >= 0)) return bad(res, 400, 'seatsLeft must be >= 0');

  const created = await TransferRide.create(payload);
  res.status(201).json({ ride: created });
}

export async function updateRide(req, res) {
  const { id } = req.params;
  if (!isValidObjectId(id)) return bad(res, 400, 'invalid id');

  const patch = {};
  ['dateISO','time','fromCity','toCity','pricePerSeat','note','status'].forEach(k => {
    if (req.body[k] != null) patch[k] = canon(req.body[k]);
  });
  if (req.body.seatsLeft != null) patch.seatsLeft = Number(req.body.seatsLeft);

  const updated = await TransferRide.findByIdAndUpdate(id, { $set: patch }, { new: true });
  if (!updated) return bad(res, 404, 'not found');
  res.json({ ride: updated });
}

export async function deleteRide(req, res) {
  const { id } = req.params;
  if (!isValidObjectId(id)) return bad(res, 400, 'invalid id');
  const doc = await TransferRide.findByIdAndDelete(id);
  if (!doc) return bad(res, 404, 'not found');
  res.json({ ok: true });
}

// ===== BOOKINGS (client/admin) =====
export async function createBooking(req, res) {
  // Клиент может прислать:
  // type='fixed'  + fromCity,toCity,dateTime
  // type='shared' + rideId
  // + общие: name, phone, comment, passengers, messenger, telegramId/username
  const type = req.body.type;
  if (!['fixed','shared'].includes(type)) return bad(res, 400, 'type must be fixed/shared');

  const base = {
    type,
    name: canon(req.body.name || ''),
    phone: canon(req.body.phone || ''),
    messenger: canon(req.body.messenger || 'telegram'),
    comment: req.body.comment ? canon(req.body.comment) : undefined,
    passengers: Number(req.body.passengers ?? 1),
  };

  if (base.passengers < 1) return bad(res, 400, 'passengers must be >= 1');

  if (type === 'fixed') {
    base.fromCity = canon(req.body.fromCity || '');
    base.toCity   = canon(req.body.toCity || '');
    base.dateTime = req.body.dateTime ? new Date(req.body.dateTime) : undefined;
    if (!base.fromCity || !base.toCity || !base.dateTime) {
      return bad(res, 400, 'fromCity, toCity, dateTime are required for fixed');
    }
  } else {
    const rideId = req.body.rideId;
    if (!isValidObjectId(rideId)) return bad(res, 400, 'rideId required for shared');
    base.rideId = rideId;

    // опционально проверим места
    const ride = await TransferRide.findById(rideId);
    if (!ride || ride.status !== 'published') return bad(res, 404, 'ride not available');
    if (ride.seatsLeft < base.passengers) return bad(res, 409, 'not enough seats');

    // уменьшим места атомарно
    await TransferRide.updateOne(
      { _id: rideId, seatsLeft: { $gte: base.passengers } },
      { $inc: { seatsLeft: -base.passengers } }
    );
  }

  // Автолинк к User по telegramId (если пришёл)
  if (req.body.telegramId) {
    try {
      const user = await User.findOrCreateByTelegram({
        telegramId: String(req.body.telegramId),
        username: req.body.telegramUsername,
        firstName: req.body.firstName,
        lastName:  req.body.lastName,
        phone:     req.body.phone,
      });
      base.userId = user._id;
    } catch (e) {
      // не блокируем бронирование, просто логируем
      console.warn('link user failed', e?.message || e);
    }
  }

  const created = await TransferBooking.create(base);
  res.status(201).json({ booking: created });
}

export async function listBookings(req, res) {
  // Админский список с фильтрами и пагинацией
  const q = {};
  if (req.query.type) q.type = req.query.type;
  if (req.query.status) q.status = req.query.status;
  if (req.query.rideId && isValidObjectId(req.query.rideId)) q.rideId = req.query.rideId;

  const page  = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 20)));
  const skip  = (page - 1) * limit;

  const [items, total] = await Promise.all([
    TransferBooking.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit)
      .populate('rideId')
      .populate('userId', 'telegramId username firstName lastName phone') // минимум полей
      .lean(),
    TransferBooking.countDocuments(q),
  ]);

  res.json({ page, limit, total, items });
}

export async function updateBookingStatus(req, res) {
  const { id } = req.params;
  if (!isValidObjectId(id)) return bad(res, 400, 'invalid id');

  const status = req.body.status;
  if (!['new','confirmed','cancelled','done'].includes(status)) {
    return bad(res, 400, 'invalid status');
  }

  const updated = await TransferBooking.findByIdAndUpdate(id, { $set: { status } }, { new: true });
  if (!updated) return bad(res, 404, 'not found');
  res.json({ booking: updated });
}

export async function deleteBooking(req, res) {
  const { id } = req.params;
  if (!isValidObjectId(id)) return bad(res, 400, 'invalid id');
  const doc = await TransferBooking.findByIdAndDelete(id);
  if (!doc) return bad(res, 404, 'not found');
  res.json({ ok: true });
}

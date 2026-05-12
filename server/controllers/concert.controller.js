// controllers/concert.controller.js
import mongoose from 'mongoose';
import Concert from '../models/concert.model.js';
import { withFullImageUrls } from '../utils/publicUrl.js';

const toInt = (v, def) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : def;
};

const toDateOrNull = (v) => {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

export const listConcerts = async (req, res, next) => {
  try {
    // ВАЖНО: сортировка по умолчанию отключена
    const { status = 'upcoming', q, from, to, sort } = req.query;
    const limit = toInt(req.query.limit, 20);
    const page  = toInt(req.query.page, 1);

    const filter = { isDeleted: { $ne: true } };
    const now = new Date();

    // Фильтр по статусу: upcoming / past / all (все без фильтра по дате)
    if (status === 'upcoming') {
      filter.startAt = { $gte: now };
    } else if (status === 'past') {
      filter.startAt = { $lt: now };
    }
    // Диапазон дат (если передан) накладывается поверх статуса
    const fromDate = toDateOrNull(from);
    const toDate = toDateOrNull(to);
    if (fromDate || toDate) {
      filter.startAt = filter.startAt || {};
      if (fromDate) filter.startAt.$gte = fromDate;
      if (toDate)   filter.startAt.$lte = toDate;
    }

    // Поиск/сортировка
    let projection = {};
    let sortObj; // undefined => .sort() не вызываем (никакой сортировки)
    if (q && q.trim()) {
      filter.$text = { $search: q.trim() };
      projection = { score: { $meta: 'textScore' } };
      sortObj = { score: { $meta: 'textScore' } }; // сортируем только по релевантности при тексте
    } else if (sort && sort !== 'none') {
      const key = sort.replace(/^-/, '');
      const dir = sort.startsWith('-') ? -1 : 1;
      sortObj = { [key]: dir };
    }
    // ВАЖНО: нет сортировки по городу/дате по умолчанию

    // Запрос
    let query = Concert.find(filter, projection);
    if (sortObj) query = query.sort(sortObj);

    const [items, total] = await Promise.all([
      query
        .skip((page - 1) * limit)
        .limit(limit)
        .lean({ virtuals: true }),
      Concert.countDocuments(filter),
    ]);

    res.json({ statusFilter: status, page, limit, total, items: withFullImageUrls(items) });
  } catch (err) { next(err); }
};

export const getConcertById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ error: 'Invalid id' });

    const item = await Concert.findOne({ _id: id, isDeleted: { $ne: true } })
      .lean({ virtuals: true });
    if (!item) return res.status(404).json({ error: 'Not found' });

    res.json(withFullImageUrls(item));
  } catch (err) { next(err); }
};

function normalizeImages(input) {
  if (!input) return [];
  if (typeof input === 'string' && input.trim()) {
    return [{ url: input.trim(), isCover: true, sortOrder: 0 }];
  }
  if (Array.isArray(input)) {
    return input
      .filter(x => x && typeof x.url === 'string' && x.url.trim())
      .map((x, idx) => ({
        url: x.url.trim(),
        alt: x.alt?.trim(),
        isCover: Boolean(x.isCover),
        sortOrder: Number.isFinite(x.sortOrder) ? x.sortOrder : idx,
      }));
  }
  if (input && typeof input === 'object' && typeof input.imageUrl === 'string') {
    const u = input.imageUrl.trim();
    return u ? [{ url: u, isCover: true, sortOrder: 0 }] : [];
  }
  return [];
}

export const createConcert = async (req, res, next) => {
  try {
    const {
      name, location, capacityLabel, description,
      imageUrl, images, seatsLeft, startAtISO, startAt,
    } = req.body;

    if (!name || !(startAtISO || startAt))
      return res.status(400).json({ error: 'name and startAt are required' });

    const imgs = normalizeImages(images?.length ? images : imageUrl);

    if (imgs.length > 0 && !imgs.some(i => i.isCover)) imgs[0].isCover = true;
    if (imgs.filter(i => i.isCover).length > 1) {
      let seen = false;
      for (const i of imgs) {
        if (i.isCover) {
          if (!seen) seen = true;
          else i.isCover = false;
        }
      }
    }

    const doc = await Concert.create({
      name: String(name).trim(),
      location: location?.trim(),
      capacityLabel: capacityLabel?.trim(),
      description: description?.trim(),
      images: imgs,
      seatsLeft: typeof seatsLeft === 'number' ? Math.max(0, seatsLeft) : null,
      startAt: startAt ? new Date(startAt) : new Date(startAtISO),
    });

    res.status(201).json(withFullImageUrls(doc.toJSON({ virtuals: true })));
  } catch (err) { next(err); }
};

export const updateConcert = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ error: 'Invalid id' });

    const payload = {};
    const {
      name, location, capacityLabel, description,
      imageUrl, images, seatsLeft, startAtISO, startAt, isDeleted,
    } = req.body;

    if (name !== undefined) payload.name = name?.toString().trim();
    if (location !== undefined) payload.location = location?.toString().trim();
    if (capacityLabel !== undefined) payload.capacityLabel = capacityLabel?.toString().trim();
    if (description !== undefined) payload.description = description?.toString().trim();

    if (seatsLeft !== undefined) {
      const n = Number(seatsLeft);
      payload.seatsLeft = Number.isFinite(n) ? Math.max(0, n) : null;
    }
    if (startAtISO !== undefined || startAt !== undefined) {
      const d = new Date(startAt ?? startAtISO);
      if (!Number.isNaN(d.getTime())) payload.startAt = d;
    }
    if (isDeleted !== undefined) payload.isDeleted = Boolean(isDeleted);

    if (images !== undefined || imageUrl !== undefined) {
      const imgs = normalizeImages(images?.length ? images : imageUrl);
      if (imgs.length > 0 && !imgs.some(i => i.isCover)) imgs[0].isCover = true;
      if (imgs.filter(i => i.isCover).length > 1) {
        let seen = false;
        for (const i of imgs) {
          if (i.isCover) {
            if (!seen) seen = true;
            else i.isCover = false;
          }
        }
      }
      payload.images = imgs;
    }

    const updated = await Concert.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      { $set: payload },
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(withFullImageUrls(updated.toJSON({ virtuals: true })));
  } catch (err) { next(err); }
};

export const deleteConcert = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ error: 'Invalid id' });

    const removed = await Concert.findOneAndDelete({ _id: id });
    if (!removed) return res.status(404).json({ error: 'Not found' });

    res.json({ ok: true, id });
  } catch (err) { next(err); }
};

// ===== картинки =====
export const addImages = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ error: 'Invalid id' });

    const imgs = normalizeImages(req.body.images ?? req.body.imageUrl);
    if (imgs.length === 0) return res.status(400).json({ error: 'No images provided' });

    const doc = await Concert.findOne({ _id: id, isDeleted: { $ne: true } });
    if (!doc) return res.status(404).json({ error: 'Not found' });

    const hasCover = doc.images.some(i => i.isCover) || imgs.some(i => i.isCover);
    if (!hasCover && imgs.length > 0) imgs[0].isCover = true;

    if (imgs.filter(i => i.isCover).length > 1) {
      let seen = false;
      for (const i of imgs) {
        if (i.isCover) {
          if (!seen) seen = true;
          else i.isCover = false;
        }
      }
    }

    doc.images.push(...imgs);
    await doc.save();
    res.json(withFullImageUrls(doc.toJSON({ virtuals: true })));
  } catch (err) { next(err); }
};

export const reorderImages = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { orders } = req.body; // [{ _id, sortOrder }]
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ error: 'Invalid id' });
    if (!Array.isArray(orders))
      return res.status(400).json({ error: 'orders must be array' });

    const doc = await Concert.findOne({ _id: id, isDeleted: { $ne: true } });
    if (!doc) return res.status(404).json({ error: 'Not found' });

    const map = new Map(orders.map(o => [String(o._id), Number(o.sortOrder) || 0]));
    doc.images.forEach(img => {
      const v = map.get(String(img._id));
      if (Number.isFinite(v)) img.sortOrder = v;
    });

    await doc.save();
    res.json(withFullImageUrls(doc.toJSON({ virtuals: true })));
  } catch (err) { next(err); }
};

export const setCoverImage = async (req, res, next) => {
  try {
    const { id, imageId } = req.params;
    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(imageId))
      return res.status(400).json({ error: 'Invalid id' });

    const doc = await Concert.findOne({ _id: id, isDeleted: { $ne: true } });
    if (!doc) return res.status(404).json({ error: 'Not found' });

    let found = false;
    doc.images.forEach(img => {
      if (String(img._id) === imageId) {
        img.isCover = true;
        found = true;
      } else {
        img.isCover = false;
      }
    });
    if (!found) return res.status(404).json({ error: 'Image not found' });

    await doc.save();
    res.json(withFullImageUrls(doc.toJSON({ virtuals: true })));
  } catch (err) { next(err); }
};

export const removeImage = async (req, res, next) => {
  try {
    const { id, imageId } = req.params;
    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(imageId))
      return res.status(400).json({ error: 'Invalid id' });

    const doc = await Concert.findOne({ _id: id, isDeleted: { $ne: true } });
    if (!doc) return res.status(404).json({ error: 'Not found' });

    const before = doc.images.length;
    doc.images = doc.images.filter(img => String(img._id) !== imageId);
    if (doc.images.length === before) return res.status(404).json({ error: 'Image not found' });

    if (!doc.images.some(i => i.isCover) && doc.images.length > 0) {
      const sorted = [...doc.images].sort(
        (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
      );
      sorted[0].isCover = true;
      doc.images = sorted;
    }

    await doc.save();
    res.json(withFullImageUrls(doc.toJSON({ virtuals: true })));
  } catch (err) { next(err); }
};


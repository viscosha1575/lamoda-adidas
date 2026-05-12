// controllers/user.controller.js
import mongoose from 'mongoose';
import User from '../models/user.model.js';

const { isValidObjectId } = mongoose;

const norm = (u) => (u ? String(u).replace(/^@/, '').trim().toLowerCase() : undefined);
const normReferralCode = (value) => {
  const normalized = (value ?? '').toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return normalized || undefined;
};
const parseDate = (v) => {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(+d) ? undefined : d;
};
const PUBLIC_URL = (process.env.PUBLIC_URL || 'https://visarun-srb.online').replace(/\/+$/, '');
const TELEGRAM_MINI_APP_URL =
  (process.env.TELEGRAM_MINI_APP_URL || 'https://t.me/lamoda_games_bot/search').replace(/\/+$/, '');

function readTelegramId(req) {
  return (
    (req.headers['x-telegram-id'] && String(req.headers['x-telegram-id']).trim()) ||
    (req.query?.telegramId && String(req.query.telegramId).trim()) ||
    null
  );
}

function readReferralCode(req) {
  return normReferralCode(
    req.body?.referralCode ||
    req.body?.refCode ||
    req.body?.ref ||
    req.body?.startParam ||
    req.query?.referralCode ||
    req.query?.refCode ||
    req.query?.ref ||
    req.query?.startParam ||
    req.headers['x-referral-code']
  );
}

function buildReferralLink(referralCode) {
  if (!referralCode) return undefined;
  if (TELEGRAM_MINI_APP_URL) {
    const separator = TELEGRAM_MINI_APP_URL.includes('?') ? '&' : '?';
    return `${TELEGRAM_MINI_APP_URL}${separator}startapp=${encodeURIComponent(referralCode)}`;
  }
  return `${PUBLIC_URL}?ref=${encodeURIComponent(referralCode)}`;
}

function mapReferrer(user) {
  if (!user) return null;
  return {
    userId: String(user._id),
    telegramId: user.telegramId || undefined,
    telegramUsername: user.username || user.usernameNorm || undefined,
    referralCode: user.referralCode || undefined,
  };
}

async function buildUserProfile(userDoc) {
  if (!userDoc) return {};

  const user = await User.ensureReferralCode(userDoc);
  const [referredBy, referralsCount] = await Promise.all([
    user.referredByUserId
      ? User.findById(user.referredByUserId)
          .select('_id telegramId username usernameNorm referralCode')
          .lean()
      : null,
    User.countDocuments({ referredByUserId: user._id }),
  ]);

  const fullName =
    [user.firstName, user.lastName].filter(Boolean).join(' ') ||
    user.name ||
    undefined;

  return {
    userId: String(user._id),
    telegramId: user.telegramId || undefined,
    telegramUsername: user.username || user.usernameNorm || undefined,
    name: fullName,
    phone: user.phone || undefined,
    email: user.email || undefined,
    messenger: user.messenger || 'telegram',
    referralCode: user.referralCode || undefined,
    referralLink: buildReferralLink(user.referralCode),
    hasReferral: Boolean(user.hasReferral),
    referredBy: mapReferrer(referredBy),
    referralsCount,
    referralLinkedAt: user.referralLinkedAt || undefined,
  };
}

/** GET /users/me — вернуть текущего пользователя
 * Источники идентификации:
 *  1) req.user?._id (сессия/JWT мидлварь)
 *  2) заголовок x-telegram-id
 *  3) ?telegramId= в query (запасной вариант)
 *
 * Формат ответа (если не найден — {}):
 *  {
 *    userId, telegramId?, telegramUsername?, name?, phone?, email?, messenger?
 *  }
 */
/** GET /users/me — вернуть пользователя строго по telegramId
 * Источники:
 *  - заголовок x-telegram-id
 *  - query ?telegramId=
 * Если не найден или не передан — вернёт {} (200 OK).
 */
export async function getMe(req, res) {
  try {
    const tgId = readTelegramId(req);

    if (!tgId) return res.json({}); // не передан tg id

    const user = await User.findOne({ telegramId: tgId });
    if (!user) return res.json({}); // пользователя с таким tgId нет

    return res.json(await buildUserProfile(user));
  } catch (e) {
    console.error('getMe', e);
    res.status(500).json({ message: 'Internal error' });
  }
}


/** POST /users — создать или бережно обновить юзера по telegramId */
export async function saveUser(req, res) {
  try {
    const { telegramId } = req.body || {};
    if (!telegramId) {
      return res.status(400).json({ message: 'telegramId is required' });
    }

    const payload = {
      telegramId: String(telegramId),
      username: req.body?.username,
      firstName: req.body?.firstName,
      lastName: req.body?.lastName,
      phone: req.body?.phone,
    };

    let user = await User.findOrCreateByTelegram(payload);

    const referralCode = readReferralCode(req);
    if (referralCode) {
      user = await User.applyReferralByCode({ userId: user._id, referralCode });
    }

    return res.status(201).json({ user: await buildUserProfile(user) });
  } catch (e) {
    // возможный конфликт по уникальному usernameNorm
    if (e?.statusCode) {
      return res.status(e.statusCode).json({ message: e.message });
    }
    if (e?.code === 11000) {
      return res.status(409).json({ message: 'Duplicate key', key: e.keyPattern, value: e.keyValue });
    }
    console.error('saveUser', e);
    return res.status(500).json({ message: 'Internal error' });
  }
}

export async function listMyReferrals(req, res) {
  try {
    const telegramId = readTelegramId(req);
    if (!telegramId) {
      return res.status(400).json({ message: 'telegramId is required' });
    }

    const page = Math.max(parseInt(req.query.page ?? '1', 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit ?? '50', 10) || 50, 1), 200);
    const skip = (page - 1) * limit;

    const user = await User.findOne({ telegramId });
    if (!user) {
      return res.json({ page, limit, total: 0, items: [] });
    }

    const owner = await User.ensureReferralCode(user);
    const [items, total] = await Promise.all([
      User.find({ referredByUserId: owner._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments({ referredByUserId: owner._id }),
    ]);

    return res.json({
      page,
      limit,
      total,
      referralCode: owner.referralCode,
      referralLink: buildReferralLink(owner.referralCode),
      items: items.map((item) => ({
        userId: String(item._id),
        telegramId: item.telegramId || undefined,
        telegramUsername: item.username || item.usernameNorm || undefined,
        firstName: item.firstName || undefined,
        lastName: item.lastName || undefined,
        createdAt: item.createdAt,
        referralLinkedAt: item.referralLinkedAt || undefined,
      })),
    });
  } catch (e) {
    console.error('listMyReferrals', e);
    return res.status(500).json({ message: 'Internal error' });
  }
}

/** GET /users — список пользователей (админ) */
export async function listUsers(req, res) {
  try {
    const {
      page = '1',
      limit,           // 👈 больше по умолчанию не ставим '20'
      q,
      telegramId,
      username,
      referralCode,
      referredByCode,
      from,
      to,
      sort = '-createdAt',
    } = req.query;

    const p = Math.max(parseInt(page, 10) || 1, 1);

    // --- разбор лимита ---
    // Если limit не передан, пустой или "0" — считаем, что лимита нет.
    let useLimit = true;
    let l = null;

    if (limit == null || limit === '' || limit === '0') {
      useLimit = false;
    } else {
      const parsed = parseInt(limit, 10);
      if (Number.isNaN(parsed)) {
        useLimit = false;
      } else {
        // как и раньше: от 1 до 200
        l = Math.min(Math.max(parsed || 20, 1), 200);
      }
    }

    const filter = {};
    if (telegramId) filter.telegramId = String(telegramId);
    if (referralCode) filter.referralCode = normReferralCode(referralCode);

    if (referredByCode) {
      const referrer = await User.findOne({ referralCode: normReferralCode(referredByCode) }).select('_id').lean();
      if (!referrer) {
        return res.json({
          page: p,
          limit: useLimit && l != null ? l : null,
          total: 0,
          items: [],
        });
      }
      filter.referredByUserId = referrer._id;
    }

    if (username) {
      const rx = new RegExp(String(username).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        ...(filter.$or || []),
        { username: rx },
        { usernameNorm: rx },
      ];
    }

    if (q) {
      const esc = String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(esc, 'i');
      filter.$or = [
        ...(filter.$or || []),
        { username: rx },
        { usernameNorm: rx },
        { firstName: rx },
        { lastName: rx },
        { phone: rx },
        { telegramId: rx },
      ];
    }

    if (from || to) {
      const fromD = parseDate(from);
      const toD = parseDate(to);
      if (fromD || toD) {
        filter.createdAt = {};
        if (fromD) filter.createdAt.$gte = fromD;
        if (toD) filter.createdAt.$lte = toD;
      }
    }

    const sortObj = {};
    if (sort) {
      const parts = String(sort).split(',').map(s => s.trim()).filter(Boolean);
      for (const part of parts) {
        if (part.startsWith('-')) sortObj[part.slice(1)] = -1;
        else sortObj[part] = 1;
      }
    } else {
      sortObj.createdAt = -1;
    }

    // --- формируем запрос ---
    let query = User.find(filter).sort(sortObj);
    if (useLimit && l != null) {
      query = query.skip((p - 1) * l).limit(l);
    }

    const [items, total] = await Promise.all([
      query.lean(),
      User.countDocuments(filter),
    ]);

    // Если лимита нет — можно вернуть null или total, как тебе удобнее
    res.json({
      page: p,
      limit: useLimit && l != null ? l : null,
      total,
      items,
    });
  } catch (e) {
    console.error('listUsers', e);
    res.status(500).json({ message: 'Internal error' });
  }
}

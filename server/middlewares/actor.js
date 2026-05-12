// middlewares/actor.js

// 1) Белый список админов — из .env или хардкод
const ADMIN_TG_IDS = new Set(
  (process.env.ADMIN_IDS || '6171772224,612078835')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
);

/**
 * СЫРОЙ вариант:
 * - Берём telegramId из query (?telegramId=) или заголовка x-telegram-id
 * - Роль = 'admin' ТОЛЬКО если ID в ADMIN_TG_IDS
 * - Никаких ?as=admin — нельзя поднять права параметром
 */
export function resolveActor(req, _res, next) {
  const tg = (req.query.telegramId || req.headers['x-telegram-id'] || '').toString();

  const isPrivileged = tg && ADMIN_TG_IDS.has(tg);
  const role = isPrivileged ? 'admin' : 'client';

  req.actor = { telegramId: tg || null, role, isPrivileged };
  next();
}

export function requireAdmin(req, res, next) {
  if (req.actor?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin only' });
  }
  next();
}

/** Доступ владельцу (по совпадению telegramId) или админу */
export function requireOwnerOrAdmin(req, res, next) {
  if (req.actor?.role === 'admin') return next();
  const qTg = (req.query.telegramId || '').toString();
  if (qTg && req.actor?.telegramId && qTg === req.actor.telegramId) return next();
  return res.status(403).json({ message: 'Forbidden' });
}

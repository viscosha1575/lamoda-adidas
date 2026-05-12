import GiveawayParticipant from '../models/giveawayParticipant.model.js';
import User from '../models/user.model.js';

const normTelegramId = (value) => {
  const v = value == null ? '' : String(value).trim();
  return v || null;
};

const normUsername = (u) => (u ? String(u).replace(/^@/, '').trim().toLowerCase() : undefined);
const normReferralCode = (value) => {
  const normalized = (value ?? '').toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return normalized || undefined;
};

function readTelegramId(req, { allowActor = true } = {}) {
  return (
    (allowActor ? normTelegramId(req.actor?.telegramId) : null) ||
    normTelegramId(req.headers['x-telegram-id']) ||
    normTelegramId(req.query?.telegramId) ||
    normTelegramId(req.body?.telegramId)
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

function mapParticipant(doc) {
  if (!doc) return null;
  const raw = doc.toJSON ? doc.toJSON() : doc;
  return {
    _id: String(raw._id),
    userId: raw.userId ? String(raw.userId) : null,
    telegramId: raw.telegramId,
    username: raw.username || undefined,
    firstName: raw.firstName || undefined,
    lastName: raw.lastName || undefined,
    startedAt: raw.startedAt,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

async function saveGiveawayParticipation(payload) {
  let user = await User.findOrCreateByTelegram(payload);
  if (payload.referralCode) {
    user = await User.applyReferralByCode({ userId: user._id, referralCode: payload.referralCode });
  }
  const existing = await GiveawayParticipant.findOne({ telegramId: payload.telegramId });

  if (existing) {
    const patch = {};
    if (user?._id && String(existing.userId || '') !== String(user._id)) patch.userId = user._id;
    if (payload.username && payload.username !== existing.username) {
      patch.username = payload.username;
      patch.usernameNorm = normUsername(payload.username);
    }
    if (payload.firstName && payload.firstName !== existing.firstName) patch.firstName = payload.firstName;
    if (payload.lastName && payload.lastName !== existing.lastName) patch.lastName = payload.lastName;

    let participant = existing;
    if (Object.keys(patch).length) {
      participant = await GiveawayParticipant.findByIdAndUpdate(
        existing._id,
        { $set: patch },
        { new: true }
      );
    }

    return {
      statusCode: 200,
      body: {
        ok: true,
        alreadyParticipating: true,
        participant: mapParticipant(participant),
      },
    };
  }

  const participant = await GiveawayParticipant.create({
    userId: user?._id,
    telegramId: payload.telegramId,
    username: payload.username,
    usernameNorm: normUsername(payload.username),
    firstName: payload.firstName,
    lastName: payload.lastName,
    startedAt: new Date(),
  });

  return {
    statusCode: 201,
    body: {
      ok: true,
      alreadyParticipating: false,
      participant: mapParticipant(participant),
    },
  };
}

async function handleGiveawayEntry(req, res, { allowActor = true } = {}) {
  const telegramId = readTelegramId(req, { allowActor });
  if (!telegramId) {
    return res.status(400).json({ message: 'telegramId is required' });
  }

  const payload = {
    telegramId,
    username: req.body?.username,
    firstName: req.body?.firstName,
    lastName: req.body?.lastName,
    phone: req.body?.phone,
    referralCode: readReferralCode(req),
  };

  try {
    const result = await saveGiveawayParticipation(payload);
    return res.status(result.statusCode).json(result.body);
  } catch (e) {
    if (e?.statusCode) {
      return res.status(e.statusCode).json({ message: e.message });
    }
    if (e?.code === 11000) {
      try {
        const participant = await GiveawayParticipant.findOne({ telegramId }).lean();
        return res.json({
          ok: true,
          alreadyParticipating: true,
          participant: participant ? mapParticipant(participant) : null,
        });
      } catch (inner) {
        console.error('handleGiveawayEntry duplicate fallback', inner);
      }
    }
    throw e;
  }
}

export async function getMyGiveawayParticipation(req, res) {
  try {
    const telegramId = readTelegramId(req);
    if (!telegramId) return res.json({ participating: false });

    const participant = await GiveawayParticipant.findOne({ telegramId }).lean();
    return res.json({
      participating: !!participant,
      participant: participant ? mapParticipant(participant) : null,
    });
  } catch (e) {
    console.error('getMyGiveawayParticipation', e);
    return res.status(500).json({ message: 'Internal error' });
  }
}

export async function getGiveawayStats(req, res) {
  try {
    const total = await GiveawayParticipant.countDocuments({});
    return res.json({ total });
  } catch (e) {
    console.error('getGiveawayStats', e);
    return res.status(500).json({ message: 'Internal error' });
  }
}

export async function enterGiveaway(req, res) {
  try {
    return await handleGiveawayEntry(req, res);
  } catch (e) {
    console.error('enterGiveaway', e);
    return res.status(500).json({ message: 'Internal error' });
  }
}

export async function enterGiveawayPublic(req, res) {
  try {
    return await handleGiveawayEntry(req, res, { allowActor: false });
  } catch (e) {
    console.error('enterGiveawayPublic', e);
    return res.status(500).json({ message: 'Internal error' });
  }
}

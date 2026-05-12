// models/user.model.js
import crypto from 'node:crypto';
import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  platform: { type: String, enum: ['telegram'], default: 'telegram' },
  telegramId: { type: String, required: true },         // ← главный идентификатор
  username:   { type: String },                         // может меняться со временем
  usernameNorm: { type: String, index: true, sparse: true }, // нормализованный @username
  referralCode: { type: String, index: true, unique: true, sparse: true },
  hasReferral: { type: Boolean, default: false, index: true },
  referredByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },
  referralLinkedAt: { type: Date, default: null },
  firstName:  String,
  lastName:   String,
  phone:      String,
}, { timestamps: true });

// индексы
UserSchema.index({ telegramId: 1 }, { unique: true });
UserSchema.index({ usernameNorm: 1 }, { unique: true, sparse: true });
UserSchema.index({ referralCode: 1 }, { unique: true, sparse: true });

// нормализация username
const normUsername = (u) => (u ? String(u).replace(/^@/, '').trim().toLowerCase() : undefined);
const normReferralCode = (value) => {
  const normalized = (value ?? '').toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return normalized || undefined;
};
const REFERRAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const REFERRAL_CODE_LENGTH = 8;

function createReferralError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function buildReferralCode() {
  const bytes = crypto.randomBytes(REFERRAL_CODE_LENGTH);
  let code = '';

  for (let index = 0; index < REFERRAL_CODE_LENGTH; index += 1) {
    code += REFERRAL_ALPHABET[bytes[index] % REFERRAL_ALPHABET.length];
  }

  return code;
}

async function createUserWithUniqueReferralCode(Model, payload) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      return await Model.create({
        ...payload,
        referralCode: buildReferralCode(),
      });
    } catch (error) {
      if (error?.code === 11000 && error?.keyPattern?.referralCode) {
        continue;
      }
      throw error;
    }
  }

  throw createReferralError('Could not generate referral code', 500);
}

UserSchema.pre('save', function(next) {
  if (this.isModified('username')) {
    this.usernameNorm = normUsername(this.username);
  }
  if (this.isModified('referralCode')) {
    this.referralCode = normReferralCode(this.referralCode);
  }
  next();
});

UserSchema.statics.ensureReferralCode = async function (userOrId) {
  let user = userOrId;
  if (!userOrId?._id) {
    user = await this.findById(userOrId);
  }

  if (!user) return null;
  if (user.referralCode) return user;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const referralCode = buildReferralCode();

    try {
      const updated = await this.findOneAndUpdate(
        {
          _id: user._id,
          $or: [
            { referralCode: { $exists: false } },
            { referralCode: null },
            { referralCode: '' },
          ],
        },
        { $set: { referralCode } },
        { new: true }
      );

      if (updated) {
        return updated;
      }

      const fresh = await this.findById(user._id);
      if (!fresh) return null;
      if (fresh.referralCode) return fresh;
      user = fresh;
    } catch (error) {
      if (error?.code === 11000 && error?.keyPattern?.referralCode) {
        continue;
      }
      throw error;
    }
  }

  throw createReferralError('Could not assign referral code', 500);
};

// find-or-create по Telegram
UserSchema.statics.findOrCreateByTelegram = async function (payload = {}) {
  const { telegramId, username, firstName, lastName, phone } = payload;
  if (!telegramId) throw new Error('telegramId is required');

  let user = await this.findOne({ telegramId });
  if (!user) {
    user = await createUserWithUniqueReferralCode(this, {
      telegramId,
      username,
      firstName,
      lastName,
      phone,
      usernameNorm: normUsername(username),
    });
    return user;
  }

  // бережно обновим то, что пришло (если пусто — не затираем)
  const patch = {};
  if (username && normUsername(username) !== user.usernameNorm) patch.username = username, patch.usernameNorm = normUsername(username);
  if (firstName && !user.firstName) patch.firstName = firstName;
  if (lastName  && !user.lastName)  patch.lastName  = lastName;
  if (phone     && !user.phone)     patch.phone     = phone;

  if (Object.keys(patch).length) {
    await this.updateOne({ _id: user._id }, { $set: patch });
    Object.assign(user, patch);
  }
  return this.ensureReferralCode(user);
};

UserSchema.statics.applyReferralByCode = async function ({ userId, referralCode }) {
  const normalizedCode = normReferralCode(referralCode);
  if (!normalizedCode) {
    return this.ensureReferralCode(userId);
  }

  let user = await this.ensureReferralCode(userId);
  if (!user) {
    throw createReferralError('User not found', 404);
  }

  if (user.referredByUserId) {
    const currentReferrer = await this.findById(user.referredByUserId).select('referralCode');
    if (currentReferrer?.referralCode === normalizedCode) {
      return user;
    }

    throw createReferralError('Referral already linked', 409);
  }

  if (user.referralCode === normalizedCode) {
    throw createReferralError('Cannot use your own referral code', 400);
  }

  const referrer = await this.findOne({ referralCode: normalizedCode });
  if (!referrer) {
    throw createReferralError('Referral code not found', 404);
  }

  if (String(referrer._id) === String(user._id)) {
    throw createReferralError('Cannot use your own referral code', 400);
  }

  user = await this.findByIdAndUpdate(
    user._id,
    {
      $set: {
        hasReferral: true,
        referredByUserId: referrer._id,
        referralLinkedAt: new Date(),
      },
    },
    { new: true }
  );

  return user;
};

export default mongoose.model('User', UserSchema);

import mongoose from 'mongoose';

const { Schema } = mongoose;

const GiveawayParticipantSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    telegramId: { type: String, required: true, index: true },
    username: { type: String },
    usernameNorm: { type: String, index: true, sparse: true },
    firstName: { type: String },
    lastName: { type: String },
    startedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

GiveawayParticipantSchema.index({ telegramId: 1 }, { unique: true });

const normUsername = (u) => (u ? String(u).replace(/^@/, '').trim().toLowerCase() : undefined);

GiveawayParticipantSchema.pre('save', function saveHook(next) {
  if (this.isModified('username')) {
    this.usernameNorm = normUsername(this.username);
  }
  next();
});

export default mongoose.models.GiveawayParticipant ||
  mongoose.model('GiveawayParticipant', GiveawayParticipantSchema);

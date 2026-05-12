import mongoose from 'mongoose';

const { Schema } = mongoose;

const HouseholdMemberSchema = new Schema(
  {
    ownerTelegramId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    sortOrder: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    createdByTelegramId: { type: String },
    lastUpdatedByTelegramId: { type: String },
  },
  { timestamps: true },
);

HouseholdMemberSchema.index({ ownerTelegramId: 1, name: 1 });

export default mongoose.models.HouseholdMember ||
  mongoose.model('HouseholdMember', HouseholdMemberSchema);

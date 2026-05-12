import mongoose from 'mongoose';

const { Schema } = mongoose;

const HouseholdTaskSchema = new Schema(
  {
    ownerTelegramId: { type: String, required: true, index: true },
    date: { type: Date, required: true, index: true },
    dateKey: { type: String, required: true, index: true },
    year: { type: Number, required: true, index: true },
    month: { type: Number, required: true, index: true },
    choreId: { type: String, required: true },
    title: { type: String, required: true },
    detail: { type: String, default: '' },
    tag: { type: String, default: '' },
    assignedMemberId: { type: Schema.Types.ObjectId, ref: 'HouseholdMember', required: true },
    status: {
      type: String,
      enum: ['pending', 'done'],
      default: 'pending',
      index: true,
    },
    completedAt: { type: Date, default: null },
    completedByMemberId: { type: Schema.Types.ObjectId, ref: 'HouseholdMember', default: null },
    updatedByTelegramId: { type: String, default: null },
  },
  { timestamps: true },
);

HouseholdTaskSchema.index(
  { ownerTelegramId: 1, dateKey: 1, choreId: 1 },
  { unique: true, name: 'household_owner_day_chore_unique' },
);

export default mongoose.models.HouseholdTask ||
  mongoose.model('HouseholdTask', HouseholdTaskSchema);

import mongoose from 'mongoose';

const TransferRouteSchema = new mongoose.Schema({
  fromCity: { type: String, required: true, trim: true },
  toCity:   { type: String, required: true, trim: true },
  dayPrice:   { type: String, required: true, trim: true },  // "7 000 RSD" — строкой, как в UI
  nightPrice: { type: String, required: true, trim: true },
  groupPrice: { type: String, trim: true },                   // опционально
  duration:   { type: String, trim: true },                   // "1.5 часа"
  status: {
    type: String,
    enum: ["active", "inactive"],
    default: "active",
  },
}, { timestamps: true });

TransferRouteSchema.index({ fromCity: 1, toCity: 1 });

export default mongoose.model('TransferRoute', TransferRouteSchema);

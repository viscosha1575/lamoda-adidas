import mongoose from 'mongoose';

const TransferRideSchema = new mongoose.Schema({
  dateISO:     { type: String, required: true },   // YYYY-MM-DD
  time:        { type: String, required: true },   // HH:MM
  fromCity:    { type: String, required: true },
  toCity:      { type: String, required: true },
  pricePerSeat:{ type: String, required: true },   // "3 000 RSD/место"
  seatsLeft:   { type: Number, required: true, min: 0 },
  note:        { type: String },
  status: {
    type: String,
    enum: ["active", "inactive"],
    default: "active",
  },
}, { timestamps: true });

TransferRideSchema.index({ dateISO: 1, time: 1, fromCity: 1, toCity: 1 });

export default mongoose.model('TransferRide', TransferRideSchema);

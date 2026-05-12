import mongoose from 'mongoose';

const TransferBookingSchema = new mongoose.Schema({
  type: { type: String, enum: ['fixed','shared'], required: true },

  // общие поля
  name:     { type: String, trim: true },
  phone:    { type: String, trim: true },
  messenger:{ type: String, trim: true, default: 'telegram' },
  comment:  { type: String, trim: true },

  // связь с User (если телеграм есть)
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // FIXED (стандартный): заданы маршрут и время
  fromCity: { type: String, trim: true },
  toCity:   { type: String, trim: true },
  dateTime: { type: Date },

  // SHARED (попутка) — ссылка на конкретный рейс
  rideId:   { type: mongoose.Schema.Types.ObjectId, ref: 'TransferRide' },

  passengers: { type: Number, default: 1, min: 1 },

  status: { type: String, enum: ['new','confirmed','cancelled','done'], default: 'new' },
}, { timestamps: true });

TransferBookingSchema.index({ type: 1, status: 1, createdAt: -1 });

export default mongoose.model('TransferBooking', TransferBookingSchema);

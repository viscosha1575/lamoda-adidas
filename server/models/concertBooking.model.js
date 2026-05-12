// models/concertBooking.model.js
import mongoose, { Schema, model } from "mongoose";

const DIRECTION = {
  NS_TO_BG: "ns_to_bg",          // из Нови-Сада до Белграда
  ROUND_TRIP: "ns_bg_round",     // из Нови-Сада до Белграда и обратно
  BG_TO_NS: "bg_to_ns",          // из Белграда до Нови-Сада
};

const MESSENGER = ["telegram", "whatsapp", "viber", "phone", "email"];

const STATUS = {
  NEW: "new",
  PENDING: "pending",
  CONFIRMED: "confirmed",
  CANCELED: "canceled",
  COMPLETED: "completed",
  EXPIRED: "expired",
};

const ConcertBookingSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // связь
    concert: { type: Schema.Types.ObjectId, ref: "Concert", required: true, index: true },

    // слепок концерта
    concertName: { type: String, trim: true },
    concertStartAt: { type: Date },

    // клиент
    telegramId: { type: String, trim: true, index: true, required: true },
    telegramUsername: { type: String, trim: true },
    name: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true },
    messenger: { type: String, enum: MESSENGER, default: "telegram" },

    // направление и места
    direction: { type: String, enum: Object.values(DIRECTION), required: true },
    seats: { type: Number, required: true, min: 1, max: 50, default: 1 },

    // адреса (куда везём)
    // Один адрес всегда нужен для выбранного направления (конечная точка туда).
    toAddress: { type: String, trim: true },         // адрес назначения по пути «туда»
    toPlaceId: { type: String, trim: true },

    // Для "туда-обратно" нужен ещё адрес, куда вернуть обратно.
    backToAddress: { type: String, trim: true },     // адрес назначения по пути «обратно»
    backToPlaceId: { type: String, trim: true },

    // цены на момент создания
    priceEurPerSeat: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ["EUR", "RSD"], default: "EUR" },

    // статус
    status: { type: String, enum: Object.values(STATUS), default: STATUS.NEW },

    // прочее
    comment: { type: String, trim: true },
    meta: {
      ip: { type: String, trim: true },
      userAgent: { type: String, trim: true },
    },

    isDeleted: { type: Boolean, default: false, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/* ------------------------- ВИРТУАЛЫ ------------------------- */
ConcertBookingSchema.virtual("totalEur").get(function () {
  const unit = Number(this.priceEurPerSeat || 0);
  const seats = Number(this.seats || 0);
  return Math.round((unit * seats + Number.EPSILON) * 10) / 10;
});

ConcertBookingSchema.virtual("needsBackAddress").get(function () {
  return this.direction === DIRECTION.ROUND_TRIP;
});

ConcertBookingSchema.virtual("directionLabel").get(function () {
  switch (this.direction) {
    case DIRECTION.NS_TO_BG: return "Из Нови-Сада → Белград";
    case DIRECTION.ROUND_TRIP: return "Нови-Сад ⇄ Белград (туда-обратно)";
    case DIRECTION.BG_TO_NS: return "Из Белграда → Нови-Сад";
    default: return "";
  }
});

/* ------------------------- ИНДЕКСЫ ------------------------- */
ConcertBookingSchema.index({ concert: 1, status: 1, createdAt: -1 });
ConcertBookingSchema.index({ telegramId: 1, createdAt: -1 });
ConcertBookingSchema.index({ direction: 1 });

/* ------------------------- ХУКИ ------------------------- */
// Валидация адресов под выбранное направление
ConcertBookingSchema.pre("validate", function (next) {
  if (this.seats <= 0) return next(new Error("Количество мест должно быть больше 0"));

  // Всегда нужен адрес назначения "туда"
  if (!this.toAddress?.trim()) {
    return next(new Error("Укажите адрес, куда везти (toAddress)."));
  }

  // Если туда-обратно — обязателен адрес для обратной поездки
  if (this.direction === DIRECTION.ROUND_TRIP && !this.backToAddress?.trim()) {
    return next(new Error("Для маршрута туда-обратно укажите адрес, куда отвезти обратно (backToAddress)."));
  }

  next();
});

/* ------------------------- СТАТИКИ ------------------------- */
ConcertBookingSchema.statics.reserve = async function (payload, { session } = {}) {
  const Concert = mongoose.model("Concert");
  const { concert: concertId, seats } = payload;

  const concert = await Concert.findById(concertId).session(session).exec();
  if (!concert || concert.isDeleted) throw new Error("Концерт не найден или недоступен");

  if (concert.seatsLeft != null) {
    if (concert.seatsLeft < seats) throw new Error("Недостаточно свободных мест");
    concert.seatsLeft -= seats;
    await concert.save({ session });
  }

  const doc = await this.create(
    { ...payload, concertName: concert.name, concertStartAt: concert.startAt },
    { session }
  );

  return doc;
};

ConcertBookingSchema.statics.cancelWithRelease = async function (bookingId, { session } = {}) {
  const Concert = mongoose.model("Concert");
  const booking = await this.findById(bookingId).session(session).exec();
  if (!booking) throw new Error("Бронь не найдена");

  if (booking.status === STATUS.CANCELED) return booking;

  booking.status = STATUS.CANCELED;
  await booking.save({ session });

  const concert = await Concert.findById(booking.concert).session(session).exec();
  if (concert && concert.seatsLeft != null) {
    concert.seatsLeft += booking.seats;
    await concert.save({ session });
  }
  return booking;
};

const ConcertBooking = model("ConcertBooking", ConcertBookingSchema);
export default ConcertBooking;
export { DIRECTION, STATUS, MESSENGER };

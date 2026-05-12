// models/booking.model.js
import mongoose from 'mongoose';
const { Schema } = mongoose;

/** ВАЖНО: те же значения, что и на фронте */
export const VEHICLE_TYPES = ['Седан', 'Минивэн', 'Микроавтобус'];

const VEHICLE_CAPACITY = {
  'Седан': 4,
  'Минивэн': 8,
  'Микроавтобус': 8,
};

/** Поддокумент для опций поездки */
const OptionsSchema = new Schema(
  {
    needChildSeat: { type: Boolean, default: false },
    needBooster:   { type: Boolean, default: false },
    hasPet:        { type: Boolean, default: false },
  },
  { _id: false }
);

const BookingSchema = new Schema(
  {
    // Контакты
    name:             { type: String, trim: true },
    phone:            { type: String, trim: true }, // опционально, сохраняем если придёт
    telegramUsername: { type: String, trim: true, lowercase: true }, // '@' убираем в pre-save
    telegramId:       { type: String, index: true },

    // Канал / сервис
    messenger: { type: String, enum: ['telegram', 'whatsapp', 'viber', 'phone', 'email'], default: 'telegram' },
    service:   { type: String, enum: ['visa-runs', 'transfers', 'relocation', 'concerts'], default: 'transfers', index: true },

    // Маршрут + время
    fromCity:        { type: String, trim: true, required: true },
    toCity:          { type: String, trim: true, required: true },
    dateTime:        { type: Date }, // Mongoose сам приведёт строку ISO/`datetime-local` к Date
    comment:         { type: String, trim: true },

    // Параметры поездки
    passengers: {
      type: Number,
      min: [1, 'Минимум 1 пассажир'],
      max: [8, 'Максимум 8 пассажиров'],
      default: 1,
    },
    bags: {
      type: Number,
      min: [0, 'Не может быть меньше 0'],
      max: [12, 'Слишком много багажа'],
      default: 0,
    },
    vehicle: {
      type: String,
      enum: VEHICLE_TYPES,
      default: 'Седан',
    },

    options: { type: OptionsSchema, default: () => ({}) },

    // Статус
    status: {
      type: String,
      enum: ['new', 'in_progress', 'done', 'canceledByUser', 'canceledByAdmin'],
      default: 'new',
      index: true,
    },

    // связь с пользователем (если есть авторизованный пользователь)
    user: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  },
  {
    timestamps: true,
    strict: true,
    versionKey: false,
  }
);

/** Нормализации */
BookingSchema.pre('save', function normalizeUsername(next) {
  if (this.telegramUsername) {
    this.telegramUsername = this.telegramUsername.replace(/^@/, '').trim().toLowerCase();
  }
  next();
});

/** Валидация вместимости vs выбранный тип авто (дополнительно к фронту) */
BookingSchema.path('passengers').validate(function (value) {
  const cap = VEHICLE_CAPACITY[this.vehicle] ?? 8;
  return value <= cap;
}, function () {
  const cap = VEHICLE_CAPACITY[this.vehicle] ?? 8;
  return `Для ${this.passengers} пассажиров выбранный тип "${this.vehicle}" не подходит (макс. ${cap}).`;
});

/** Удобный индекс по созданию + сервису, чтобы быстрее смотреть свежие заявки */
BookingSchema.index({ createdAt: -1, service: 1 });

export default mongoose.models.Booking || mongoose.model('Booking', BookingSchema);

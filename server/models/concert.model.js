// models/concert.model.js
import { Schema, model } from 'mongoose';

const ImageSchema = new Schema(
  {
    url: { type: String, required: true, trim: true },
    alt: { type: String, trim: true },
    isCover: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  { _id: true, id: true }
);

const ConcertSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    location: { type: String, trim: true },
    capacityLabel: { type: String, trim: true },
    description: { type: String, trim: true },
    images: { type: [ImageSchema], default: [] },
    // старое поле оставляем скрытым на всякий случай
    imageUrl: { type: String, trim: true, select: false },

    seatsLeft: { type: Number, default: null, min: 0 },
    startAt: { type: Date, required: true },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// виртуалы
ConcertSchema.virtual('status').get(function () {
  const now = new Date();
  return this.startAt < now ? 'past' : 'upcoming';
});

ConcertSchema.virtual('coverImage').get(function () {
  if (!Array.isArray(this.images) || this.images.length === 0) return null;
  const cover = this.images.find(i => i.isCover);
  if (cover) return cover;
  const sorted = [...this.images].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
  );
  return sorted[0] || this.images[0];
});

// индексы
ConcertSchema.index({ startAt: 1 });
ConcertSchema.index({ name: 'text', description: 'text', location: 'text' });

const Concert = model('Concert', ConcertSchema);
export default Concert;

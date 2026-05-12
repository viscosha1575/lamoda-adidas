// src/app.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// trust proxy
const tp = process.env.TRUST_PROXY ?? '';
if (tp) {
  const n = Number(tp);
  app.set('trust proxy', Number.isFinite(n) ? n : tp);
} else {
  app.set('trust proxy', false);
}

// лимитер ОБЪЯВЛЯЕМ до использования
const limiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// базовые миддлы
app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('tiny'));

// Разрешить всех и все методы/заголовки по умолчанию
app.use(cors());
// (рекомендую) обрабатывать preflight
app.options('*', cors());
// health для локального хелсчека контейнера
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// лимитер только на /api/*
app.use('/api', limiter);

// health под /api — чтобы Traefik-/пользовательские проверки не ловили 404
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// Статика: загруженные картинки концертов (uploads/ относительно корня сервера)
const uploadsDir = path.join(path.dirname(__dirname), 'uploads');
app.use('/uploads', express.static(uploadsDir));

// Пример API-роутов
import bookingsRouter from '../routes/booking.router.js';
app.use('/api/bookings', bookingsRouter);

import transfersRouter from '../routes/transfers.router.js';
app.use('/api/transfers', transfersRouter);

import concertRouter from '../routes/concert.routes.js';
app.use('/api/concerts', concertRouter);

import userRouter from '../routes/users.routes.js';
app.use('/api/users', userRouter);

import giveawayPublicRouter from '../routes/giveawayPublic.routes.js';
app.use('/api/public/giveaway', giveawayPublicRouter);

import giveawayRouter from '../routes/giveaway.routes.js';
app.use('/api/giveaway', giveawayRouter);

import householdRouter from '../routes/household.routes.js';
app.use('/api/household', householdRouter);

import adminRouter from '../routes/admin.router.js';
app.use('/api/admin', adminRouter);

import concertBookingRouter from '../routes/concertBooking.router.js';
app.use('/api/concert-bookings', concertBookingRouter);

export default app;

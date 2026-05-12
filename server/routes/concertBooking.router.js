// routes/concertBooking.router.js
import express from "express";
import {
  createConcertBooking,
  getConcertBooking,
  adminListConcertBookings,
  userListConcertBookings,
  userUpdateConcertBooking,
  userCancelConcertBooking,
  adminPatchConcertBooking,
  adminSetConcertBookingStatus,
  adminDeleteConcertBooking,
} from "../controllers/concertBooking.controller.js";

import { resolveActor, requireAdmin, requireOwnerOrAdmin } from "../middlewares/actor.js";

const router = express.Router();

/**
 * resolveActor должен проставлять req.actor, req.isAdmin и, при возможности, req.userId.
 * requireOwnerOrAdmin ожидает один из признаков владения:
 *  - ?userId=<ObjectId> ИЛИ ?telegramId=<string>
 *  - либо сам определит из req.actor (если так реализовано).
 */
router.use(resolveActor);

/* -------- База -------- */

/**
 * Создать заявку (user)
 * POST /api/concert-bookings
 * body: { userId: ObjectId, concert: ObjectId, direction, seats, toAddress, ... }
 *  — userId обязателен (смотри контроллер)
 */
router.post("/", createConcertBooking);

/**
 * Админский список
 * GET /api/concert-bookings?status=confirmed&userId=<id>&telegramId=123&from=2025-10-01&to=2025-10-31&q=...
 */
router.get("/", requireAdmin, adminListConcertBookings);

/**
 * Список заявок пользователя
 * GET /api/concert-bookings/user?userId=<id> | ?telegramId=123
 */
router.get("/user", userListConcertBookings);

/**
 * Получить одну (опционально с проверкой владельца)
 * GET /api/concert-bookings/:id?userId=<id> | ?telegramId=123
 */
router.get("/:id", getConcertBooking);

/* -------- Владелец -------- */

/**
 * Обновить разрешённые поля своей заявки
 * PATCH /api/concert-bookings/:id/owner?userId=<id> | ?telegramId=123
 * body: { seats?, toAddress?, backToAddress?, ... }
 */
router.patch("/:id/owner", requireOwnerOrAdmin, userUpdateConcertBooking);

/**
 * Отменить свою заявку
 * PATCH /api/concert-bookings/:id/cancel-by-user?userId=<id> | ?telegramId=123
 */
router.patch("/:id/cancel-by-user", requireOwnerOrAdmin, userCancelConcertBooking);

/* -------- Админ -------- */

/**
 * Частичный патч любой заявки
 * PATCH /api/concert-bookings/:id
 */
router.patch("/:id", requireAdmin, adminPatchConcertBooking);

/**
 * Сменить статус
 * PATCH /api/concert-bookings/:id/status
 * body: { status: "pending"|"confirmed"|"canceled"|"completed"|"expired" }
 */
router.patch("/:id/status", requireAdmin, adminSetConcertBookingStatus);

/**
 * Удалить заявку (активную — с возвратом мест)
 * DELETE /api/concert-bookings/:id
 */
router.delete("/:id", requireAdmin, adminDeleteConcertBooking);

export default router;

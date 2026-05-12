// routes/booking.router.js
import express from 'express';
import {
  createBooking,
  listBookings,
  getBooking,

  updateBooking,
  userCancelBooking,

  patchBooking,
  adminSetStatus,
  adminStartProgress,
  adminMarkDone,
  adminCancelByAdmin,

  // удаления
  adminDeleteAllBookings,
  deleteBooking, // ← если у тебя не было — см. примечание ниже
} from '../controllers/booking.controller.js';

import { resolveActor, requireAdmin, requireOwnerOrAdmin } from '../middlewares/actor.js';

const router = express.Router();

router.use(resolveActor);

/* -------- База -------- */
router.post('/', createBooking);
router.get('/', listBookings);
router.get('/:id', getBooking);

/* -------- Владелец -------- */
router.patch('/:id/owner', requireOwnerOrAdmin, updateBooking);
router.patch('/:id/cancel-by-user', requireOwnerOrAdmin, userCancelBooking);

/* -------- Админ -------- */
router.patch('/:id', requireAdmin, patchBooking);
router.patch('/:id/status', requireAdmin, adminSetStatus);
router.patch('/:id/start', requireAdmin, adminStartProgress);
router.patch('/:id/done', requireAdmin, adminMarkDone);
router.patch('/:id/cancel-by-admin', requireAdmin, adminCancelByAdmin);

// Удалить одну
router.delete('/:id', requireAdmin, deleteBooking);

// Удалить много (по фильтрам) — см. контроллер adminDeleteAllBookings
// Примеры:
//   DELETE /api/bookings?dryRun=1&service=transfers
//   DELETE /api/bookings?service=transfers&status=new&confirm=yes
router.delete('/', requireAdmin, adminDeleteAllBookings);

export default router;

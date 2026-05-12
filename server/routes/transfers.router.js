// transfers.router.js
import { Router } from 'express';
import {
  listRoutes, createRoute, updateRoute, deleteRoute,
  listRides, createRide, updateRide, deleteRide,
  createBooking, listBookings, updateBookingStatus, deleteBooking
} from '../controllers/transfers.controller.js';
import { resolveActor, requireAdmin } from '../middlewares/actor.js';

const r = Router();

// ВОТ ЭТОГО НЕ ХВАТАЛО:
r.use(resolveActor);

// Публичные
r.get('/routes', listRoutes);
r.get('/rides', listRides);
r.post('/bookings', createBooking);

// Админские
r.post('/admin/routes', requireAdmin, createRoute);
r.patch('/admin/routes/:id', requireAdmin, updateRoute);
r.delete('/admin/routes/:id', requireAdmin, deleteRoute);

r.post('/admin/rides', requireAdmin, createRide);
r.patch('/admin/rides/:id', requireAdmin, updateRide);
r.delete('/admin/rides/:id', requireAdmin, deleteRide);

r.get('/admin/bookings', requireAdmin, listBookings);
r.patch('/admin/bookings/:id/status', requireAdmin, updateBookingStatus);
r.delete('/admin/bookings/:id', requireAdmin, deleteBooking);

export default r;

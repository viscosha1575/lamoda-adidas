// routes/admin.routes.js
import { Router } from 'express';
import {
  whoami, listBookings, updateBooking, deleteBooking, stats, listUsers,
  listGiveawayParticipants,
  listConcerts, getConcert, createConcert, updateConcert, deleteConcert, restoreConcert, purgeConcert,
  listTransferRides, getTransferRide, createTransferRide, updateTransferRide, deleteTransferRide,
  listTransferRoutes, getTransferRoute, createTransferRoute, updateTransferRoute, deleteTransferRoute,
} from '../controllers/admin.controller.js';
import { uploadConcertImage as uploadConcertImageCtrl } from '../controllers/upload.controller.js';

// ⬇️ не забудь импортнуть свои миддлвары
import { resolveActor, requireAdmin } from '../middlewares/actor.js';
import { uploadConcertImage as uploadConcertImageMw } from '../middlewares/upload.js';

const r = Router();

// 1) всегда сначала определяем актёра (actor)
r.use(resolveActor);

// 2) PUBLIC: whoami — без requireAdmin, чтобы фронт мог узнать флаг isAdmin
r.get('/whoami', whoami);

// 3) всё ниже — только для админов
r.use(requireAdmin);

/* bookings & users */
r.get('/bookings', listBookings);
r.patch('/bookings/:id', updateBooking);
r.delete('/bookings/:id', deleteBooking);
r.get('/stats', stats);
r.get('/users', listUsers);
r.get('/giveaway-participants', listGiveawayParticipants);

/* concerts */
r.get('/concerts', listConcerts);
r.get('/concerts/:id', getConcert);
r.post('/concerts', createConcert);
r.patch('/concerts/:id', updateConcert);
r.delete('/concerts/:id', deleteConcert);
r.post('/concerts/:id/restore', restoreConcert);
r.delete('/concerts/:id/purge', purgeConcert);
r.post('/upload/concert-image', uploadConcertImageMw, (err, req, res, next) => {
  if (err) {
    return res.status(400).json({ message: err.message || 'Ошибка загрузки файла' });
  }
  next();
}, uploadConcertImageCtrl);

/* transfer rides (попутные) */
r.get('/transfer-rides', listTransferRides);
r.get('/transfer-rides/:id', getTransferRide);
r.post('/transfer-rides', createTransferRide);
r.patch('/transfer-rides/:id', updateTransferRide);
r.delete('/transfer-rides/:id', deleteTransferRide);

/* transfer routes (стандартные) */
r.get('/transfer-routes', listTransferRoutes);
r.get('/transfer-routes/:id', getTransferRoute);
r.post('/transfer-routes', createTransferRoute);
r.patch('/transfer-routes/:id', updateTransferRoute);
r.delete('/transfer-routes/:id', deleteTransferRoute);

export default r;

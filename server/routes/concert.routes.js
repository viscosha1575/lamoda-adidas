// routes/concert.routes.js
import express from 'express';
import * as ctrl from '../controllers/concert.controller.js'; // CJS контроллер ок

const router = express.Router();

// CRUD
router.get('/',       ctrl.listConcerts);
router.get('/:id',    ctrl.getConcertById);
router.post('/',      ctrl.createConcert);
router.patch('/:id',  ctrl.updateConcert);
router.delete('/:id', ctrl.deleteConcert);

// Картинки
router.post('/:id/images',                 ctrl.addImages);
router.patch('/:id/images/reorder',        ctrl.reorderImages);
router.patch('/:id/images/:imageId/cover', ctrl.setCoverImage);
router.delete('/:id/images/:imageId',      ctrl.removeImage);

export default router; // <-- ключевое

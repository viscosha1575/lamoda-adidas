// controllers/upload.controller.js
// Загрузка картинок для концертов на сервер (только для админов).

import { toFullImageUrl } from '../utils/publicUrl.js';

export function uploadConcertImage(req, res) {
  if (!req.file) {
    return res.status(400).json({ message: 'Файл не передан' });
  }
  const path = `/uploads/concerts/${req.file.filename}`;
  res.status(201).json({ url: toFullImageUrl(path) });
}

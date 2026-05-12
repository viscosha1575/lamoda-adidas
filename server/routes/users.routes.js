// routes/users.routes.js
import express from 'express';
import { saveUser, listUsers, getMe, listMyReferrals } from '../controllers/user.controller.js';
import { resolveActor, requireAdmin } from '../middlewares/actor.js';

const router = express.Router();

router.use(resolveActor);

// Создать/сохранить юзера (find-or-create по telegramId)
router.post('/', saveUser);
router.get('/me', getMe);
router.get('/referrals', listMyReferrals);

// Получить всех юзеров (только админ)
router.get('/', requireAdmin, listUsers);

export default router;

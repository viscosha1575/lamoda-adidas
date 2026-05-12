import { Router } from 'express';
import { enterGiveawayPublic, getGiveawayStats } from '../controllers/giveaway.controller.js';

const router = Router();

router.get('/stats', getGiveawayStats);
router.post('/enter', enterGiveawayPublic);

export default router;

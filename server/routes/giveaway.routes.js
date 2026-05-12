import { Router } from 'express';
import { enterGiveaway, getGiveawayStats, getMyGiveawayParticipation } from '../controllers/giveaway.controller.js';
import { resolveActor } from '../middlewares/actor.js';

const router = Router();

router.use(resolveActor);

router.get('/stats', getGiveawayStats);
router.get('/me', getMyGiveawayParticipation);
router.post('/enter', enterGiveaway);

export default router;

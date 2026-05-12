import { Router } from 'express';
import { resolveActor } from '../middlewares/actor.js';
import {
  createHouseholdMember,
  getHouseholdActivity,
  getHouseholdSnapshot,
  getHouseholdYearSummary,
  updateHouseholdMember,
  updateHouseholdTaskStatus,
} from '../controllers/household.controller.js';

const router = Router();

router.use(resolveActor);

router.get('/snapshot', getHouseholdSnapshot);
router.get('/year-summary', getHouseholdYearSummary);
router.get('/activity', getHouseholdActivity);
router.post('/members', createHouseholdMember);
router.patch('/members/:id', updateHouseholdMember);
router.patch('/tasks/:id/status', updateHouseholdTaskStatus);

export default router;

import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getRuntimeConfigService } from '../config/systemSettings';

const router = Router();

/** Role-safe runtime configuration for authenticated clients (web portal + mobile). */
router.get('/runtime', requireAuth, async (_req, res) => {
  return res.json(await getRuntimeConfigService());
});

export default router;

import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireAuth } from '../middleware/auth';
import { getRuntimeConfigService } from '../config/systemSettings';

const router = new Hono<AppEnv>();

/** Role-safe runtime configuration for authenticated clients (web portal + mobile). */
router.get('/runtime', requireAuth, async (c) => {
  return c.json(await getRuntimeConfigService());
});

export default router;

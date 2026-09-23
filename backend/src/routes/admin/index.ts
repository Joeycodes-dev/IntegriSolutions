import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import usersRoutes from './users';
import auditRoutes from './audit';
import settingsRoutes from './settings';

const router = new Hono<AppEnv>();

router.route('/users', usersRoutes);
router.route('/audit-logs', auditRoutes);
router.route('/settings', settingsRoutes);

export default router;

import { Router } from 'express';
import usersRoutes from './users';
import auditRoutes from './audit';
import settingsRoutes from './settings';

const router = Router();

router.use('/users', usersRoutes);
router.use('/audit-logs', auditRoutes);
router.use('/settings', settingsRoutes);

export default router;

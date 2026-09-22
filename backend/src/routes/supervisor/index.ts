import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import officersRoutes from './officers';
import annotationsRoutes from './annotations';
import casesRoutes from './cases';
import shiftsRoutes from './shifts';
import verificationTokensRoutes from './verificationTokens';
import alertsRoutes from './alerts';

const router = new Hono<AppEnv>();

router.route('/officers', officersRoutes);
router.route('/tests', annotationsRoutes);
router.route('/cases', casesRoutes);
router.route('/shifts', shiftsRoutes);
router.route('/verification-tokens', verificationTokensRoutes);
router.route('/alerts', alertsRoutes);

export default router;

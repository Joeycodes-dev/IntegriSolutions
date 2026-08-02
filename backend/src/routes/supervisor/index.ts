import { Router } from 'express';
import officersRoutes from './officers';
import annotationsRoutes from './annotations';
import casesRoutes from './cases';
import shiftsRoutes from './shifts';
import verificationTokensRoutes from './verificationTokens';

const router = Router();

router.use('/officers', officersRoutes);
router.use('/tests', annotationsRoutes);
router.use('/cases', casesRoutes);
router.use('/shifts', shiftsRoutes);
router.use('/verification-tokens', verificationTokensRoutes);

export default router;

import { Router } from 'express';
import officersRoutes from './officers';
import annotationsRoutes from './annotations';

const router = Router();

router.use('/officers', officersRoutes);
router.use('/tests', annotationsRoutes);

export default router;

import { Router } from 'express';
import officersRoutes from './officers';

const router = Router();

router.use('/officers', officersRoutes);

export default router;

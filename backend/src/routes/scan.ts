import { Router } from 'express';
import { scanDriverLicense } from '../geminiService';

const router = Router();

router.post('/', async (req, res) => {
  const { base64Image } = req.body;

  if (!base64Image) {
    return res.status(400).json({ error: 'base64Image is required' });
  }

  try {
    const data = await scanDriverLicense(base64Image);
    return res.json(data);
  } catch (error) {
    console.error('Scan error', error);
    return res.status(500).json({ error: 'Failed to scan driver license' });
  }
});

export default router;

import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { resolveProfileByEmail } from '../utilities/resolveProfile';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;

  if (!authReq.userEmail) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  let resolved;
  try {
    resolved = await resolveProfileByEmail(authReq.userEmail, authReq.userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Profile lookup failed';
    return res.status(500).json({ error: message });
  }

  if (!resolved) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  return res.json(resolved.profile);
});

export default router;

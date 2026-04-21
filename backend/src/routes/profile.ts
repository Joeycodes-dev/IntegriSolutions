import { Router } from 'express';
import { supabase } from '../supabase';
import { requireAuth, AuthRequest } from '../middleware/auth';
import type { UserProfile } from '../types';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('uid', authReq.userId)
    .single();

  const profile = data as UserProfile | null;

  if (error || !profile) {
    return res.status(404).json({ error: error?.message ?? 'Profile not found' });
  }

  return res.json(profile);
});

export default router;

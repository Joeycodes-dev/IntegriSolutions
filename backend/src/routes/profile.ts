import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { requireAuth, AuthRequest } from '../middleware/auth';
import type { UserProfile } from '../types';

const serviceSupabase = createClient(
  process.env.SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  {
    auth: {
      persistSession: false,
      detectSessionInUrl: false
    }
  }
);

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;

  const queryByUid = await serviceSupabase
    .from('users')
    .select('*')
    .eq('uid', authReq.userId)
    .limit(1);

  if (queryByUid.error) {
    return res.status(404).json({ error: queryByUid.error.message });
  }

  const uidRows = Array.isArray(queryByUid.data) ? queryByUid.data : [];
  if (uidRows.length > 0) {
    return res.json(uidRows[0] as UserProfile);
  }

  if (authReq.userEmail) {
    const queryByEmail = await serviceSupabase
      .from('users')
      .select('*')
      .eq('email', authReq.userEmail)
      .limit(1);

    if (queryByEmail.error) {
      return res.status(404).json({ error: queryByEmail.error.message });
    }

    const emailRows = Array.isArray(queryByEmail.data) ? queryByEmail.data : [];
    if (emailRows.length > 0) {
      return res.json(emailRows[0] as UserProfile);
    }
  }

  return res.status(404).json({ error: 'Profile not found' });
});

export default router;

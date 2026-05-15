import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
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

  const { data: officerRows, error: officerError } = await serviceSupabase
    .from('officer_users')
    .select('*')
    .eq('officer_email_address', authReq.userEmail)
    .limit(1);

  if (officerError) {
    return res.status(500).json({ error: officerError.message });
  }

  const officerData = Array.isArray(officerRows) ? officerRows[0] : null;

  if (!officerData) {
    return res.status(404).json({ error: 'Officer profile not found' });
  }

  const profile: UserProfile = {
    uid: authReq.userId,
    officerId: officerData.officer_id,
    email: officerData.officer_email_address,
    name: officerData.officer_name,
    surname: officerData.officer_surname,
    badgeNumber: officerData.badge_number,
    idNumber: String(officerData.officer_id_number),
    employmentStatus: officerData.officer_employment_status,
    province: officerData.province,
    region: officerData.region,
    officerTypeId: officerData.officer_type_id,
    roleId: officerData.role_id,
    createdAt: officerData.created_at
  };

  return res.json(profile);
});

export default router;

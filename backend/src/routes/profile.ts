import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { requireAuth, AuthRequest } from '../middleware/auth';
import type { UserProfile } from '../types';
import { isDutyStatus, normalizeDutyStatus } from '../constants/dutyStatus';
import { writeAuditLog } from '../utilities/auditLog';
import { asyncHandler } from '../asyncHandler';

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

function toProfile(uid: string, officerData: Record<string, any>): UserProfile {
  return {
    uid,
    officerId: officerData.officer_id,
    email: officerData.officer_email_address,
    name: officerData.officer_name,
    surname: officerData.officer_surname,
    badgeNumber: officerData.badge_number,
    idNumber: String(officerData.officer_id_number),
    employmentStatus: officerData.officer_employment_status,
    dutyStatus: normalizeDutyStatus(officerData.duty_status),
    province: officerData.province,
    region: officerData.region,
    officerTypeId: officerData.officer_type_id,
    roleId: officerData.role_id,
    createdAt: officerData.created_at
  };
}

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

  return res.json(toProfile(authReq.userId, officerData));
});

router.patch(
  '/duty-status',
  requireAuth,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const dutyStatus = (req.body ?? {}).dutyStatus;

    if (!isDutyStatus(dutyStatus)) {
      return res.status(400).json({
        error: 'dutyStatus must be one of: On Patrol, Checkpoint, Break, Off Duty'
      });
    }

    const { data: updatedRows, error } = await serviceSupabase
      .from('officer_users')
      .update({ duty_status: dutyStatus })
      .eq('officer_email_address', authReq.userEmail)
      .select('*')
      .limit(1);

    if (error) {
      if (error.message.includes('duty_status') || error.code === '42703') {
        return res.status(503).json({
          error: 'duty_status column is missing. Run backend/sql/duty_status.sql in Supabase.'
        });
      }
      return res.status(500).json({ error: error.message });
    }

    const officerData = updatedRows?.[0];
    if (!officerData) {
      return res.status(404).json({ error: 'Officer profile not found' });
    }

    await writeAuditLog(
      authReq.userEmail ?? 'unknown',
      `Updated duty status to ${dutyStatus}`,
      String(officerData.officer_id)
    );

    return res.json(toProfile(authReq.userId, officerData));
  })
);

export default router;

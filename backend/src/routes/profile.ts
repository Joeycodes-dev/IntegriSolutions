import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { resolveProfileByEmail } from '../utilities/resolveProfile';
import { DUTY_STATUSES, isDutyStatus } from '../constants/dutyStatus';
import { writeAuditLog } from '../utilities/auditLog';
import { createClient } from '@supabase/supabase-js';

const router = Router();

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

router.patch('/duty-status', requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const status = typeof body.status === 'string' ? body.status.trim() : '';

  if (!isDutyStatus(status)) {
    return res.status(400).json({ error: `Status must be one of: ${DUTY_STATUSES.join(', ')}` });
  }

  if (!authReq.userEmail) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  let resolved;
  try {
    resolved = await resolveProfileByEmail(authReq.userEmail, authReq.userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Profile lookup failed';
    return res.status(500).json({ error: message });
  }

  if (!resolved || resolved.source !== 'officer_users') {
    return res.status(403).json({ error: 'Only officer accounts can update duty status' });
  }

  const { error: updateError } = await serviceSupabase
    .from('officer_users')
    .update({ duty_status: status })
    .eq('officer_email_address', authReq.userEmail);

  if (updateError) {
    if (updateError.code === '42P01' || /duty_status/i.test(updateError.message ?? '')) {
      return res.status(503).json({ error: 'Duty status column not set up. Run backend/migrations/20260801_officer_duty_status.sql.' });
    }
    return res.status(500).json({ error: updateError.message });
  }

  await writeAuditLog(
    authReq.userEmail,
    `Officer duty status changed to ${status}`,
    `officer_${resolved.dbId}`
  );

  return res.json({ dutyStatus: status });
});

export default router;

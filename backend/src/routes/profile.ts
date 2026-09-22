import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireAuth } from '../middleware/auth';
import { resolveProfileByEmail } from '../utilities/resolveProfile';
import { DUTY_STATUSES, isDutyStatus } from '../constants/dutyStatus';
import { writeAuditLog } from '../utilities/auditLog';
import { serviceSupabase } from '../serviceSupabase';
import { readJson } from '../utilities/jsonBody';

const router = new Hono<AppEnv>();

router.get('/', requireAuth, async (c) => {
  const userEmail = c.get('userEmail');
  const userId = c.get('userId');

  if (!userEmail) {
    return c.json({ error: 'Profile not found' }, 404);
  }

  let resolved;
  try {
    resolved = await resolveProfileByEmail(userEmail, userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Profile lookup failed';
    return c.json({ error: message }, 500);
  }

  if (!resolved) {
    return c.json({ error: 'Profile not found' }, 404);
  }

  return c.json(resolved.profile);
});

router.patch('/duty-status', requireAuth, async (c) => {
  const userId = c.get('userId');
  const userEmail = c.get('userEmail');
  const body = await readJson(c);
  const status = typeof body.status === 'string' ? body.status.trim() : '';

  if (!isDutyStatus(status)) {
    return c.json({ error: `Status must be one of: ${DUTY_STATUSES.join(', ')}` }, 400);
  }

  if (!userEmail) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  let resolved;
  try {
    resolved = await resolveProfileByEmail(userEmail, userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Profile lookup failed';
    return c.json({ error: message }, 500);
  }

  if (!resolved || resolved.source !== 'officer_users') {
    return c.json({ error: 'Only officer accounts can update duty status' }, 403);
  }

  const { error: updateError } = await serviceSupabase
    .from('officer_users')
    .update({ duty_status: status })
    .eq('officer_email_address', userEmail);

  if (updateError) {
    if (updateError.code === '42P01' || /duty_status/i.test(updateError.message ?? '')) {
      return c.json(
        {
          error:
            'Duty status column not set up. Run backend/migrations/20260801_officer_duty_status.sql.'
        },
        503
      );
    }
    return c.json({ error: updateError.message }, 500);
  }

  await writeAuditLog(userEmail, `Officer duty status changed to ${status}`, `officer_${resolved.dbId}`);

  return c.json({ dutyStatus: status });
});

export default router;

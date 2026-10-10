import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireAuth } from '../middleware/auth';
import { requireSupervisor } from '../middleware/requireSupervisor';
import { resolveProfileByEmail } from '../utilities/resolveProfile';
import { serviceSupabase } from '../serviceSupabase';
import { readJson } from '../utilities/jsonBody';

// See migrations/20261010_test_session_interruptions.sql for the model.
const INTERRUPTION_KINDS = new Set(['cancelled', 'navigated_away', 'app_closed']);
const SESSION_STEPS = new Set(['scan', 'reading']);

const router = new Hono<AppEnv>();

function isMissingTable(error: { message?: string; code?: string } | null | undefined): boolean {
  return !!error && (error.code === '42P01' || /test_session_interruptions/i.test(error.message ?? ''));
}

function toSessionInterruption(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    officerId: Number(row.officer_id),
    officerName: String(row.officer_name ?? ''),
    badgeNumber: String(row.badge_number ?? ''),
    draftId: String(row.draft_id ?? ''),
    plannedTestId: row.planned_test_id == null ? null : String(row.planned_test_id),
    step: String(row.step ?? 'scan'),
    kind: String(row.kind ?? ''),
    reason: row.reason == null ? null : String(row.reason),
    occurredAt: String(row.occurred_at ?? ''),
    createdAt: String(row.created_at ?? '')
  };
}

// Mobile outbox upload. Offline-first: the device queues interruptions locally
// and retries, so the client-generated id makes re-posts idempotent.
router.post('/officers/session-interruptions', requireAuth, async (c) => {
  const body = await readJson(c);
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  const draftId = typeof body.draftId === 'string' ? body.draftId.trim() : '';
  const kind = typeof body.kind === 'string' ? body.kind.trim() : '';
  const step = typeof body.step === 'string' ? body.step.trim() : '';
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  const occurredAtRaw = typeof body.occurredAt === 'string' ? body.occurredAt.trim() : '';
  const plannedTestId = typeof body.plannedTestId === 'string' && body.plannedTestId.trim()
    ? body.plannedTestId.trim()
    : null;

  if (!id || !draftId || !INTERRUPTION_KINDS.has(kind) || !SESSION_STEPS.has(step)) {
    return c.json({ error: 'Missing or invalid session interruption payload' }, 400);
  }
  if (kind !== 'app_closed' && !reason) {
    return c.json({ error: 'A reason is required when cancelling or leaving a test session' }, 400);
  }
  const occurredAt = new Date(occurredAtRaw);
  if (Number.isNaN(occurredAt.getTime())) {
    return c.json({ error: 'Invalid occurredAt timestamp' }, 400);
  }

  const actor = await resolveProfileByEmail(c.get('userEmail') ?? '', c.get('userId'), serviceSupabase, c.get('preferredRoleId'));
  if (!actor || actor.source !== 'officer_users') {
    return c.json({ error: 'Only officer accounts can report session interruptions' }, 403);
  }

  const { data: existing, error: lookupError } = await serviceSupabase
    .from('test_session_interruptions')
    .select('id')
    .eq('id', id)
    .maybeSingle();

  if (lookupError) {
    if (isMissingTable(lookupError)) {
      return c.json({ error: 'Session interruption tables are not set up. Run backend/migrations/20261010_test_session_interruptions.sql.' }, 503);
    }
    return c.json({ error: lookupError.message }, 500);
  }
  if (existing) return c.json({ ok: true, deduplicated: true });

  const { error } = await serviceSupabase.from('test_session_interruptions').insert([{
    id,
    officer_id: actor.dbId,
    officer_name: `${actor.profile.name} ${actor.profile.surname}`.trim(),
    badge_number: actor.profile.badgeNumber ?? '',
    draft_id: draftId,
    planned_test_id: plannedTestId,
    step,
    kind,
    reason: reason || null,
    occurred_at: occurredAt.toISOString()
  }]);

  if (error) {
    if (isMissingTable(error)) {
      return c.json({ error: 'Session interruption tables are not set up. Run backend/migrations/20261010_test_session_interruptions.sql.' }, 503);
    }
    return c.json({ error: error.message }, 500);
  }

  return c.json({ ok: true }, 201);
});

router.get('/supervisor/session-interruptions', requireSupervisor, async (c) => {
  const kind = c.req.query('kind');

  let query = serviceSupabase
    .from('test_session_interruptions')
    .select('*')
    .order('occurred_at', { ascending: false })
    .limit(200);

  if (kind && INTERRUPTION_KINDS.has(kind)) {
    query = query.eq('kind', kind);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingTable(error)) {
      return c.json({ error: 'Session interruption tables are not set up. Run backend/migrations/20261010_test_session_interruptions.sql.' }, 503);
    }
    return c.json({ error: error.message }, 500);
  }

  return c.json((data ?? []).map((row) => toSessionInterruption(row as Record<string, unknown>)));
});

export default router;

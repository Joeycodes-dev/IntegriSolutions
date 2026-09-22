import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireAuth } from '../middleware/auth';
import { resolveProfileByEmail } from '../utilities/resolveProfile';
import { serviceSupabase } from '../serviceSupabase';

const router = new Hono<AppEnv>();

function isMissingTable(error: { message?: string; code?: string } | null | undefined): boolean {
  return !!error && (error.code === '42P01' || /roadblock_shift|roadblock_shifts/i.test(error.message ?? ''));
}

function toRoadblockShift(row: Record<string, unknown>, assignmentStatus: string | null = null) {
  return {
    id: String(row.id),
    roadblockName: String(row.roadblock_name ?? ''),
    station: String(row.station ?? ''),
    supervisorEmail: String(row.supervisor_email ?? ''),
    supervisorName: row.supervisor_name ? String(row.supervisor_name) : null,
    startsAt: String(row.starts_at ?? ''),
    endsAt: String(row.ends_at ?? ''),
    status: String(row.status ?? 'active'),
    centerLat: row.center_lat == null ? null : Number(row.center_lat),
    centerLng: row.center_lng == null ? null : Number(row.center_lng),
    radiusMeters: row.radius_meters == null ? null : Number(row.radius_meters),
    notes: row.notes == null ? null : String(row.notes),
    assignmentStatus,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? row.created_at ?? '')
  };
}

router.use('*', requireAuth);

router.get('/active', async (c) => {
  const userEmail = c.get('userEmail') ?? '';
  const userId = c.get('userId');
  let resolved;
  try {
    resolved = await resolveProfileByEmail(userEmail, userId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Officer profile lookup failed';
    return c.json({ error: message }, 500);
  }

  if (!resolved || resolved.source !== 'officer_users' || typeof resolved.profile.officerId !== 'number') {
    return c.json({ error: 'Only officer accounts can view roadblock shift assignments' }, 403);
  }

  const officerId = resolved.profile.officerId;
  const { data: assignments, error: assignmentError } = await serviceSupabase
    .from('roadblock_shift_officers')
    .select('shift_id, assignment_status')
    .eq('officer_id', officerId)
    .in('assignment_status', ['assigned', 'accepted']);

  if (assignmentError) {
    if (isMissingTable(assignmentError)) {
      return c.json({ error: 'Roadblock shift tables are not set up. Run backend/migrations/20260731_shift_roadblock_operations.sql.' }, 503);
    }
    return c.json({ error: assignmentError.message }, 500);
  }

  const assignmentRows = assignments ?? [];
  const shiftIds = Array.from(new Set(assignmentRows.map((row) => String(row.shift_id)).filter(Boolean)));
  if (shiftIds.length === 0) return c.json([]);

  const nowIso = new Date().toISOString();
  const { data: shifts, error: shiftError } = await serviceSupabase
    .from('roadblock_shifts')
    .select('*')
    .in('id', shiftIds)
    .in('status', ['active', 'scheduled'])
    .lte('starts_at', nowIso)
    .gte('ends_at', nowIso)
    .order('starts_at', { ascending: true });

  if (shiftError) {
    if (isMissingTable(shiftError)) {
      return c.json({ error: 'Roadblock shift tables are not set up. Run backend/migrations/20260731_shift_roadblock_operations.sql.' }, 503);
    }
    return c.json({ error: shiftError.message }, 500);
  }

  const assignmentStatusByShift = new Map(
    assignmentRows.map((row) => [String(row.shift_id), String(row.assignment_status)])
  );

  return c.json((shifts ?? []).map((row) => toRoadblockShift(
    row as Record<string, unknown>,
    assignmentStatusByShift.get(String(row.id)) ?? null
  )));
});

export default router;

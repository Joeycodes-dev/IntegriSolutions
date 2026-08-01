import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import { resolveProfileByEmail } from '../utilities/resolveProfile';

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

router.use(requireAuth);

router.get('/active', async (req, res) => {
  const authReq = req as AuthRequest;
  let resolved;
  try {
    resolved = await resolveProfileByEmail(authReq.userEmail ?? '', authReq.userId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Officer profile lookup failed';
    return res.status(500).json({ error: message });
  }

  if (!resolved || resolved.source !== 'officer_users' || typeof resolved.profile.officerId !== 'number') {
    return res.status(403).json({ error: 'Only officer accounts can view roadblock shift assignments' });
  }

  const officerId = resolved.profile.officerId;
  const { data: assignments, error: assignmentError } = await serviceSupabase
    .from('roadblock_shift_officers')
    .select('shift_id, assignment_status')
    .eq('officer_id', officerId)
    .in('assignment_status', ['assigned', 'accepted']);

  if (assignmentError) {
    if (isMissingTable(assignmentError)) {
      return res.status(503).json({ error: 'Roadblock shift tables are not set up. Run backend/migrations/20260731_shift_roadblock_operations.sql.' });
    }
    return res.status(500).json({ error: assignmentError.message });
  }

  const assignmentRows = assignments ?? [];
  const shiftIds = Array.from(new Set(assignmentRows.map((row) => String(row.shift_id)).filter(Boolean)));
  if (shiftIds.length === 0) return res.json([]);

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
      return res.status(503).json({ error: 'Roadblock shift tables are not set up. Run backend/migrations/20260731_shift_roadblock_operations.sql.' });
    }
    return res.status(500).json({ error: shiftError.message });
  }

  const assignmentStatusByShift = new Map(
    assignmentRows.map((row) => [String(row.shift_id), String(row.assignment_status)])
  );

  return res.json((shifts ?? []).map((row) => toRoadblockShift(
    row as Record<string, unknown>,
    assignmentStatusByShift.get(String(row.id)) ?? null
  )));
});

export default router;
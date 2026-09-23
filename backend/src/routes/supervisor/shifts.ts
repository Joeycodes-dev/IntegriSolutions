import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import { randomUUID } from 'crypto';
import { serviceSupabase } from '../../serviceSupabase';
import { requireSupervisor } from '../../middleware/requireSupervisor';
import { writeAuditLog } from '../../utilities/auditLog';
import { readJson } from '../../utilities/jsonBody';

const router = new Hono<AppEnv>();

const SHIFT_STATUSES = ['scheduled', 'active', 'closed', 'cancelled'] as const;
type ShiftStatus = typeof SHIFT_STATUSES[number];

function isMissingTable(error: { message?: string; code?: string } | null | undefined): boolean {
  return !!error && (error.code === '42P01' || /roadblock_shift|roadblock_shifts/i.test(error.message ?? ''));
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseOptionalNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sanitizeAssignedOfficerIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const ids = value
    .map((item) => Number(item))
    .filter((id) => Number.isInteger(id) && id > 0);
  return Array.from(new Set(ids));
}

function supervisorNameFromEmail(email: string | null | undefined): string {
  const local = email?.split('@')[0]?.replace(/[._-]+/g, ' ').trim();
  return local || 'Supervisor';
}

function initialStatus(startsAt: Date, endsAt: Date): ShiftStatus {
  const now = Date.now();
  if (startsAt.getTime() > now) return 'scheduled';
  if (endsAt.getTime() < now) return 'closed';
  return 'active';
}

function toRoadblockShift(row: Record<string, unknown>, assignedOfficerIds: number[] = []) {
  return {
    id: String(row.id),
    roadblockName: String(row.roadblock_name ?? ''),
    station: String(row.station ?? ''),
    supervisorEmail: String(row.supervisor_email ?? ''),
    supervisorName: row.supervisor_name ? String(row.supervisor_name) : null,
    startsAt: String(row.starts_at ?? ''),
    endsAt: String(row.ends_at ?? ''),
    status: String(row.status ?? 'active') as ShiftStatus,
    centerLat: row.center_lat == null ? null : Number(row.center_lat),
    centerLng: row.center_lng == null ? null : Number(row.center_lng),
    radiusMeters: row.radius_meters == null ? null : Number(row.radius_meters),
    notes: row.notes == null ? null : String(row.notes),
    assignedOfficerIds,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? row.created_at ?? '')
  };
}

async function loadAssignments(shiftIds: string[]): Promise<Map<string, number[]>> {
  const assignments = new Map<string, number[]>();
  if (shiftIds.length === 0) return assignments;

  const { data, error } = await serviceSupabase
    .from('roadblock_shift_officers')
    .select('shift_id, officer_id, assignment_status')
    .in('shift_id', shiftIds)
    .neq('assignment_status', 'removed');

  if (error) throw error;

  for (const row of data ?? []) {
    const shiftId = String(row.shift_id);
    const officerId = Number(row.officer_id);
    if (!Number.isFinite(officerId)) continue;
    assignments.set(shiftId, [...(assignments.get(shiftId) ?? []), officerId]);
  }

  return assignments;
}

router.use('*', requireSupervisor);

router.get('/', async (c) => {
  const { data, error } = await serviceSupabase
    .from('roadblock_shifts')
    .select('*')
    .order('starts_at', { ascending: false })
    .limit(100);

  if (error) {
    if (isMissingTable(error)) {
      return c.json({ error: 'Roadblock shift tables are not set up. Run backend/migrations/20260731_shift_roadblock_operations.sql.' }, 503);
    }
    return c.json({ error: error.message }, 500);
  }

  const rows = data ?? [];
  const assignments = await loadAssignments(rows.map((row) => String(row.id)));
  return c.json(rows.map((row) => toRoadblockShift(row as Record<string, unknown>, assignments.get(String(row.id)) ?? [])));
});

router.post('/', async (c) => {
  const body = await readJson(c);
  const roadblockName = String(body.roadblockName ?? '').trim();
  const station = String(body.station ?? '').trim();
  const startsAt = parseDate(body.startsAt);
  const endsAt = parseDate(body.endsAt);
  const assignedOfficerIds = sanitizeAssignedOfficerIds(body.assignedOfficerIds);

  if (!roadblockName || !station || !startsAt || !endsAt) {
    return c.json({ error: 'Roadblock name, station, start time, and end time are required' }, 400);
  }

  if (endsAt.getTime() <= startsAt.getTime()) {
    return c.json({ error: 'Shift end time must be after the start time' }, 400);
  }

  if (assignedOfficerIds.length === 0) {
    return c.json({ error: 'Assign at least one officer to the roadblock shift' }, 400);
  }

  const status = initialStatus(startsAt, endsAt);
  const id = randomUUID();
  const supervisorEmail = c.get('userEmail') ?? 'unknown';
  const insertPayload = {
    id,
    roadblock_name: roadblockName,
    station,
    supervisor_email: supervisorEmail,
    supervisor_name: supervisorNameFromEmail(supervisorEmail),
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    status,
    center_lat: parseOptionalNumber(body.centerLat),
    center_lng: parseOptionalNumber(body.centerLng),
    radius_meters: parseOptionalNumber(body.radiusMeters),
    notes: String(body.notes ?? '').trim() || null
  };

  const { data: inserted, error: insertError } = await serviceSupabase
    .from('roadblock_shifts')
    .insert([insertPayload])
    .select('*');

  if (insertError || !inserted?.length) {
    if (isMissingTable(insertError)) {
      return c.json({ error: 'Roadblock shift tables are not set up. Run backend/migrations/20260731_shift_roadblock_operations.sql.' }, 503);
    }
    return c.json({ error: insertError?.message ?? 'Failed to create roadblock shift' }, 500);
  }

  const assignmentRows = assignedOfficerIds.map((officerId) => ({ shift_id: id, officer_id: officerId }));
  const { error: assignmentError } = await serviceSupabase
    .from('roadblock_shift_officers')
    .insert(assignmentRows);

  if (assignmentError) {
    await serviceSupabase.from('roadblock_shifts').delete().eq('id', id);
    return c.json({ error: assignmentError.message }, 500);
  }

  await writeAuditLog(
    supervisorEmail,
    `Created roadblock shift ${roadblockName}`,
    id
  );

  return c.json(toRoadblockShift(inserted[0] as Record<string, unknown>, assignedOfficerIds), 201);
});

router.patch('/:shiftId', async (c) => {
  const shiftId = String(c.req.param('shiftId'));
  const body = await readJson(c);
  const status = typeof body.status === 'string' ? body.status.trim() : undefined;
  const hasAssignmentPatch = Object.prototype.hasOwnProperty.call(body, 'assignedOfficerIds');
  const assignedOfficerIds = sanitizeAssignedOfficerIds(body.assignedOfficerIds);

  if (!status && !hasAssignmentPatch) {
    return c.json({ error: 'Provide status and/or assignedOfficerIds to update' }, 400);
  }

  if (status && !(SHIFT_STATUSES as readonly string[]).includes(status)) {
    return c.json({ error: `Status must be one of: ${SHIFT_STATUSES.join(', ')}` }, 400);
  }

  if (hasAssignmentPatch && assignedOfficerIds.length === 0) {
    return c.json({ error: 'Assign at least one officer to the roadblock shift' }, 400);
  }

  if (status) {
    const { error } = await serviceSupabase
      .from('roadblock_shifts')
      .update({ status })
      .eq('id', shiftId);

    if (error) return c.json({ error: error.message }, 500);
  }

  if (hasAssignmentPatch) {
    const { error: deleteError } = await serviceSupabase
      .from('roadblock_shift_officers')
      .delete()
      .eq('shift_id', shiftId);

    if (deleteError) return c.json({ error: deleteError.message }, 500);

    const { error: insertError } = await serviceSupabase
      .from('roadblock_shift_officers')
      .insert(assignedOfficerIds.map((officerId) => ({ shift_id: shiftId, officer_id: officerId })));

    if (insertError) return c.json({ error: insertError.message }, 500);
  }

  const { data: rows, error: fetchError } = await serviceSupabase
    .from('roadblock_shifts')
    .select('*')
    .eq('id', shiftId)
    .limit(1);

  if (fetchError) return c.json({ error: fetchError.message }, 500);
  const updated = rows?.[0] as Record<string, unknown> | undefined;
  if (!updated) return c.json({ error: 'Roadblock shift not found' }, 404);

  const assignments = await loadAssignments([shiftId]);

  await writeAuditLog(
    c.get('userEmail') ?? 'unknown',
    `Updated roadblock shift ${shiftId}`,
    shiftId
  );

  return c.json(toRoadblockShift(updated, assignments.get(shiftId) ?? []));
});

export default router;

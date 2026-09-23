import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireAuth } from '../middleware/auth';
import { resolveProfileByEmail } from '../utilities/resolveProfile';
import { writeAuditLog } from '../utilities/auditLog';
import { priorityWeight } from '../utilities/alertPriority';
import { serviceSupabase } from '../serviceSupabase';
import { readJson } from '../utilities/jsonBody';

const router = new Hono<AppEnv>();

/**
 * This is an escalation signal only — it does not confirm that the person or vehicle
 * is wanted, stolen, arrested, or otherwise legally determined. Follow your unit's
 * operational procedure and escalate to the appropriate authority. This system does
 * not determine what action, if any, is lawful.
 */
export const MATCH_ESCALATION_DISCLAIMER =
  "This is an escalation signal only — it does not confirm that the person or vehicle is wanted, stolen, arrested, or otherwise legally determined. Follow your unit's operational procedure and escalate to the appropriate authority. This system does not determine what action, if any, is lawful.";

function isMissingTable(error: { message?: string; code?: string } | null | undefined): boolean {
  return !!error && (error.code === '42P01' || /operational_alert/i.test(error.message ?? ''));
}

function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

function toOperationalAlert(row: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    id: String(row.id),
    alertType: String(row.alert_type),
    priority: String(row.priority),
    description: String(row.description),
    vehicleRegistration: row.vehicle_registration == null ? null : String(row.vehicle_registration),
    vehicleDescription: row.vehicle_description == null ? null : String(row.vehicle_description),
    personName: row.person_name == null ? null : String(row.person_name),
    personDescription: row.person_description == null ? null : String(row.person_description),
    personReference: row.person_reference == null ? null : String(row.person_reference),
    photoUrl: row.photo_url == null ? null : String(row.photo_url),
    locationLat: row.location_lat == null ? null : Number(row.location_lat),
    locationLng: row.location_lng == null ? null : Number(row.location_lng),
    locationLabel: row.location_label == null ? null : String(row.location_label),
    locationRadiusMeters: row.location_radius_meters == null ? null : Number(row.location_radius_meters),
    issuedByName: String(row.issued_by_name),
    targetScope: String(row.target_scope),
    sourceType: String(row.source_type),
    sourceAuthority: row.source_authority == null ? null : String(row.source_authority),
    sourceReference: row.source_reference == null ? null : String(row.source_reference),
    status: String(row.status),
    expiresAt: row.expires_at == null ? null : String(row.expires_at),
    createdAt: String(row.created_at),
    version: row.version == null ? 1 : Number(row.version),
    ...extra
  };
}

type EligibilityResult =
  | { ok: true; alert: Record<string, unknown> }
  | { ok: false; status: 403 | 404 | 409 | 500; error: string };

/**
 * Same eligibility rules as GET /active, applied to a single alert: it must exist,
 * be active, not have passed its expiry, and the officer must actually be in scope
 * (all_officers / their assigned-or-accepted shift / explicitly targeted). Used to
 * gate acknowledge and possible-match reporting so those actions can't be taken
 * against an alert the officer was never shown.
 */
async function checkAlertEligibility(alertId: string, officerId: number): Promise<EligibilityResult> {
  const { data: alert, error: alertError } = await serviceSupabase
    .from('operational_alerts')
    .select('*')
    .eq('id', alertId)
    .maybeSingle();

  if (alertError) return { ok: false, status: 500, error: alertError.message };
  if (!alert) return { ok: false, status: 404, error: 'Operational alert not found' };

  const alertRow = alert as Record<string, unknown>;

  if (String(alertRow.status) !== 'active') {
    return { ok: false, status: 409, error: 'This alert is no longer active' };
  }

  if (alertRow.expires_at) {
    const expiresAtMs = new Date(String(alertRow.expires_at)).getTime();
    if (!Number.isNaN(expiresAtMs) && expiresAtMs <= Date.now()) {
      return { ok: false, status: 409, error: 'This alert has expired' };
    }
  }

  const targetScope = String(alertRow.target_scope);

  if (targetScope === 'all_officers') {
    return { ok: true, alert: alertRow };
  }

  if (targetScope === 'shift') {
    const targetShiftId = alertRow.target_shift_id == null ? null : String(alertRow.target_shift_id);
    if (!targetShiftId) return { ok: false, status: 403, error: 'This alert is not targeted to you' };

    const { data: assignment, error: assignmentError } = await serviceSupabase
      .from('roadblock_shift_officers')
      .select('shift_id')
      .eq('shift_id', targetShiftId)
      .eq('officer_id', officerId)
      .in('assignment_status', ['assigned', 'accepted'])
      .maybeSingle();

    if (assignmentError) return { ok: false, status: 500, error: assignmentError.message };
    if (!assignment) return { ok: false, status: 403, error: 'This alert is not targeted to you' };
    return { ok: true, alert: alertRow };
  }

  if (targetScope === 'officers') {
    const { data: target, error: targetError } = await serviceSupabase
      .from('operational_alert_officers')
      .select('officer_id')
      .eq('alert_id', alertId)
      .eq('officer_id', officerId)
      .maybeSingle();

    if (targetError) return { ok: false, status: 500, error: targetError.message };
    if (!target) return { ok: false, status: 403, error: 'This alert is not targeted to you' };
    return { ok: true, alert: alertRow };
  }

  return { ok: false, status: 403, error: 'This alert is not targeted to you' };
}

router.use('*', requireAuth);

router.get('/active', async (c) => {
  const actor = await resolveProfileByEmail(c.get('userEmail') ?? '', c.get('userId'), serviceSupabase, c.get('preferredRoleId'));
  if (!actor || actor.source !== 'officer_users' || typeof actor.profile.officerId !== 'number') {
    return c.json({ error: 'Only officer accounts can view operational alerts' }, 403);
  }

  const officerId = actor.profile.officerId;

  const { data: shiftAssignments, error: shiftAssignmentError } = await serviceSupabase
    .from('roadblock_shift_officers')
    .select('shift_id')
    .eq('officer_id', officerId)
    .in('assignment_status', ['assigned', 'accepted']);

  if (shiftAssignmentError) return c.json({ error: shiftAssignmentError.message }, 500);

  const shiftIds = Array.from(new Set((shiftAssignments ?? []).map((row) => String(row.shift_id)).filter(Boolean)));

  const { data: officerTargets, error: officerTargetError } = await serviceSupabase
    .from('operational_alert_officers')
    .select('alert_id')
    .eq('officer_id', officerId);

  if (officerTargetError) {
    if (isMissingTable(officerTargetError)) {
      return c.json({ error: 'Operational alert tables are not set up. Run backend/migrations/20260910_operational_alerts.sql.' }, 503);
    }
    return c.json({ error: officerTargetError.message }, 500);
  }

  const explicitAlertIds = Array.from(new Set((officerTargets ?? []).map((row) => String(row.alert_id))));

  const [allOfficersRes, shiftRes, explicitRes] = await Promise.all([
    serviceSupabase.from('operational_alerts').select('*').eq('target_scope', 'all_officers').eq('status', 'active'),
    shiftIds.length
      ? serviceSupabase.from('operational_alerts').select('*').eq('target_scope', 'shift').in('target_shift_id', shiftIds).eq('status', 'active')
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    explicitAlertIds.length
      ? serviceSupabase.from('operational_alerts').select('*').in('id', explicitAlertIds).eq('target_scope', 'officers').eq('status', 'active')
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null })
  ]);

  for (const result of [allOfficersRes, shiftRes, explicitRes]) {
    if (result.error) {
      if (isMissingTable(result.error)) {
        return c.json({ error: 'Operational alert tables are not set up. Run backend/migrations/20260910_operational_alerts.sql.' }, 503);
      }
      return c.json({ error: result.error.message }, 500);
    }
  }

  const merged = new Map<string, Record<string, unknown>>();
  for (const row of [...(allOfficersRes.data ?? []), ...(shiftRes.data ?? []), ...(explicitRes.data ?? [])] as Record<string, unknown>[]) {
    merged.set(String(row.id), row);
  }

  const nowMs = Date.now();
  const rows = Array.from(merged.values()).filter((row) => {
    if (!row.expires_at) return true;
    const expiresAtMs = new Date(String(row.expires_at)).getTime();
    return Number.isNaN(expiresAtMs) || expiresAtMs > nowMs;
  });

  const alertIds = rows.map((row) => String(row.id));
  const { data: ackRows, error: ackError } = alertIds.length
    ? await serviceSupabase
      .from('operational_alert_acknowledgements')
      .select('alert_id, acknowledged_at, alert_version')
      .eq('officer_id', officerId)
      .in('alert_id', alertIds)
    : { data: [] as Array<{ alert_id: string; acknowledged_at: string; alert_version?: number }>, error: null };

  if (ackError) return c.json({ error: ackError.message }, 500);

  // An acknowledgement only counts against the alert's *current* version —
  // a material edit bumps operational_alerts.version, and an officer's
  // acknowledgement of an earlier version does not carry forward. This is
  // what makes the alert naturally reappear as unacknowledged after a
  // material update, with no special-case logic needed on the client.
  const currentVersionByAlert = new Map(rows.map((row) => [String(row.id), row.version == null ? 1 : Number(row.version)]));
  const ackByAlert = new Map<string, string>();
  for (const row of ackRows ?? []) {
    const alertId = String(row.alert_id);
    const ackVersion = row.alert_version == null ? 1 : Number(row.alert_version);
    if (ackVersion === (currentVersionByAlert.get(alertId) ?? 1)) {
      ackByAlert.set(alertId, String(row.acknowledged_at));
    }
  }

  const sorted = rows.sort((a, b) => {
    const priorityDelta = priorityWeight(b.priority) - priorityWeight(a.priority);
    if (priorityDelta !== 0) return priorityDelta;
    return String(b.created_at).localeCompare(String(a.created_at));
  });

  return c.json(sorted.map((row) => toOperationalAlert(row, {
    acknowledgedAt: ackByAlert.get(String(row.id)) ?? null
  })));
});

router.post('/:id/acknowledge', async (c) => {
  const actor = await resolveProfileByEmail(c.get('userEmail') ?? '', c.get('userId'), serviceSupabase, c.get('preferredRoleId'));
  if (!actor || actor.source !== 'officer_users') {
    return c.json({ error: 'Only officer accounts can acknowledge operational alerts' }, 403);
  }

  const alertId = String(c.req.param('id'));

  const eligibility = await checkAlertEligibility(alertId, actor.dbId);
  if (!eligibility.ok) {
    return c.json({ error: eligibility.error }, eligibility.status);
  }

  const alertVersion = eligibility.alert.version == null ? 1 : Number(eligibility.alert.version);

  const acknowledgedAt = new Date().toISOString();
  const { data, error } = await serviceSupabase
    .from('operational_alert_acknowledgements')
    .upsert(
      {
        alert_id: alertId,
        officer_id: actor.dbId,
        officer_name: `${actor.profile.name} ${actor.profile.surname}`.trim(),
        badge_number: actor.profile.badgeNumber,
        acknowledged_at: acknowledgedAt,
        alert_version: alertVersion
      },
      // Scoped to the specific version the officer is acknowledging: the same
      // officer can hold one acknowledgement row per version of the same
      // alert (v1, v2, ...), and re-sending the same version's acknowledgement
      // stays idempotent (upserts onto the same row) rather than creating a
      // duplicate or clobbering a different version's record.
      { onConflict: 'alert_id,officer_id,alert_version' }
    )
    .select('*')
    .single();

  if (error) return c.json({ error: error.message }, 500);

  await writeAuditLog(c.get('userEmail') ?? 'unknown', `Acknowledged operational alert ${alertId}`, alertId);

  return c.json({ alertId, acknowledgedAt: String(data.acknowledged_at), alertVersion });
});

router.post('/:id/matches', async (c) => {
  const actor = await resolveProfileByEmail(c.get('userEmail') ?? '', c.get('userId'), serviceSupabase, c.get('preferredRoleId'));
  if (!actor || actor.source !== 'officer_users') {
    return c.json({ error: 'Only officer accounts can report a possible match' }, 403);
  }

  const alertId = String(c.req.param('id'));
  const body = await readJson(c);
  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
  const location = (body.location ?? {}) as { lat?: unknown; lng?: unknown };

  if (!notes) {
    return c.json({ error: 'Notes are required to report a possible match' }, 400);
  }
  if (location.lat != null && !isValidLatitude(Number(location.lat))) {
    return c.json({ error: 'location.lat must be between -90 and 90' }, 400);
  }
  if (location.lng != null && !isValidLongitude(Number(location.lng))) {
    return c.json({ error: 'location.lng must be between -180 and 180' }, 400);
  }

  const eligibility = await checkAlertEligibility(alertId, actor.dbId);
  if (!eligibility.ok) {
    return c.json({ error: eligibility.error }, eligibility.status);
  }

  // Deliberately never touches operational_alerts.status: reporting a possible match
  // is an escalation signal only, not a legal determination (see MATCH_ESCALATION_DISCLAIMER).
  const { data, error } = await serviceSupabase
    .from('operational_alert_matches')
    .insert([{
      alert_id: alertId,
      officer_id: actor.dbId,
      officer_name: `${actor.profile.name} ${actor.profile.surname}`.trim(),
      badge_number: actor.profile.badgeNumber,
      notes,
      location_lat: typeof location.lat === 'number' ? location.lat : null,
      location_lng: typeof location.lng === 'number' ? location.lng : null
    }])
    .select('*')
    .single();

  if (error) return c.json({ error: error.message }, 500);

  await writeAuditLog(c.get('userEmail') ?? 'unknown', `Reported possible match (unconfirmed) for alert ${alertId}`, alertId);

  return c.json({
    id: Number(data.id),
    alertId,
    notes: String(data.notes),
    createdAt: String(data.created_at),
    disclaimer: MATCH_ESCALATION_DISCLAIMER
  }, 201);
});

export default router;

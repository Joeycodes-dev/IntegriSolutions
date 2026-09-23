import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../../env';
import { serviceSupabase } from '../../serviceSupabase';
import { requireSupervisor } from '../../middleware/requireSupervisor';
import { ROLE_SUPERVISOR, ROLE_OFFICER } from '../../constants/roles';
import { writeAuditLog } from '../../utilities/auditLog';
import { readJson } from '../../utilities/jsonBody';
import { readUpload } from '../../utilities/uploads';
import { priorityWeight } from '../../utilities/alertPriority';

const router = new Hono<AppEnv>();

const ALERT_TYPES = new Set(['bolo_person', 'bolo_vehicle', 'hazard', 'general']);
const BOLO_TYPES = new Set(['bolo_person', 'bolo_vehicle']);
// critical = immediate emergency / officer-safety / life-safety event.
// high remains an urgent-but-non-emergency operational priority — it is
// not renamed or repurposed. Order: critical > high > medium > low.
const PRIORITIES = new Set(['critical', 'high', 'medium', 'low']);
const SOURCE_TYPES = new Set(['internal', 'external']);
const TARGET_SCOPES = new Set(['all_officers', 'shift', 'officers']);
const STATUSES = new Set(['active', 'expired', 'cancelled', 'resolved']);
const PERSON_REFERENCE_ID_NUMBER_PATTERN = /^\d{13}$/;
// Mirrors backend/migrations/20260911_operational_alert_location.sql's CHECK constraints.
const MAX_LOCATION_RADIUS_METERS = 50_000;

function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

function isValidRadiusMeters(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= MAX_LOCATION_RADIUS_METERS;
}

function sameOfficerIdSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((id) => setA.has(id));
}

// A minor expiry adjustment (e.g. correcting a typo'd end time by a few
// minutes, or shortening the window) should not force re-acknowledgement.
// Meaningfully extending how long an alert stays operationally relevant
// should. This is a deterministic, tunable *operational* default — not a
// legal retention period — kept simple and explicit rather than AI-inferred.
const MATERIAL_EXPIRY_EXTENSION_MS = 60 * 60 * 1000; // 1 hour

function isExpiryChangeMaterial(previousExpiresAt: string | null, nextExpiresAt: string | null): boolean {
  // Removing an expiry (making the alert indefinite) always meaningfully
  // extends its operational relevance.
  if (previousExpiresAt && !nextExpiresAt) return true;
  // Adding an expiry to a previously indefinite alert narrows relevance, and
  // shortening an existing window ends relevance sooner — neither is treated
  // as extending operational relevance.
  if (!previousExpiresAt || !nextExpiresAt) return false;
  const previousMs = new Date(previousExpiresAt).getTime();
  const nextMs = new Date(nextExpiresAt).getTime();
  if (Number.isNaN(previousMs) || Number.isNaN(nextMs)) return false;
  return nextMs - previousMs >= MATERIAL_EXPIRY_EXTENSION_MS;
}

/**
 * Deterministic (never AI-inferred) classification of whether a Supervisor's
 * edit changes the alert's operational meaning enough to require every
 * officer who already acknowledged it to acknowledge again:
 *
 *  - priority increase, target/shift/officer targeting change, location or
 *    trigger-radius change, and source authority/reference/type change are
 *    always material.
 *  - a meaningful expiry extension (see isExpiryChangeMaterial) is material;
 *    a minor correction or a shortened window is not.
 *  - a description/instruction-only edit is material only when the
 *    Supervisor explicitly flags it via the "This changes operational
 *    meaning — require re-acknowledgement" checkbox (default OFF) — typo and
 *    formatting fixes must not force re-acknowledgement on their own.
 *  - a priority decrease is never material on its own.
 */
export function computeMaterialChange(input: {
  priorityIncreased: boolean;
  targetChanged: boolean;
  locationChanged: boolean;
  sourceChanged: boolean;
  descriptionChanged: boolean;
  materialChangeOverride: boolean;
  expiryMaterial: boolean;
}): { material: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (input.priorityIncreased) reasons.push('priority increased');
  if (input.targetChanged) reasons.push('target scope/assignment changed');
  if (input.locationChanged) reasons.push('location/radius changed');
  if (input.sourceChanged) reasons.push('source authority/reference changed');
  if (input.descriptionChanged && input.materialChangeOverride) {
    reasons.push('description/instructions materially changed (marked by supervisor)');
  }
  if (input.expiryMaterial) reasons.push('expiry meaningfully extended');
  return { material: reasons.length > 0, reasons };
}

// ---- Phase A2: expiry defaults, Critical non-acknowledgement awareness ----

// A BOLO (person/vehicle) or hazard bulletin without an end date tends to
// linger past its operational relevance, so a Supervisor who doesn't set one
// gets a sensible default applied rather than an indefinite alert. This is a
// deterministic *operational* default — not a legal retention or expungement
// period — and is easy to tune here. A general alert may still remain
// open-ended (no default is applied) since it covers a broader range of
// ongoing operational notices.
const ALERT_TYPE_DEFAULT_EXPIRY_HOURS: Partial<Record<string, number>> = {
  bolo_person: 72,
  bolo_vehicle: 72,
  hazard: 24
};

function resolveDefaultExpiresAt(alertType: string, explicitExpiresAt: Date | null): Date | null {
  if (explicitExpiresAt) return explicitExpiresAt;
  const defaultHours = ALERT_TYPE_DEFAULT_EXPIRY_HOURS[alertType];
  if (!defaultHours) return null;
  return new Date(Date.now() + defaultHours * 60 * 60 * 1000);
}

// How long a Critical alert may go without acknowledgement from any
// targeted officer before a Supervisor sees an awareness warning. Purely
// informational — it never auto-dispatches, auto-punishes, auto-escalates,
// or infers misconduct. An operational default, not a legal deadline;
// tune here. Measured from version_updated_at (when the current version of
// the alert's content became current), not updated_at, so a non-material
// edit (e.g. a typo fix) never resets the clock.
const CRITICAL_UNACK_WARNING_MINUTES = 15;

function isCriticalNonAckWarning(alert: Record<string, unknown>, outstandingCount: number): boolean {
  if (String(alert.priority) !== 'critical') return false;
  if (String(alert.status) !== 'active') return false;
  if (outstandingCount <= 0) return false;
  const referenceIso = alert.version_updated_at != null ? String(alert.version_updated_at) : String(alert.created_at);
  const referenceMs = new Date(referenceIso).getTime();
  if (Number.isNaN(referenceMs)) return false;
  return Date.now() - referenceMs >= CRITICAL_UNACK_WARNING_MINUTES * 60 * 1000;
}

/**
 * Resolves the officer roster actually eligible for an alert, mirroring
 * checkAlertEligibility in routes/alerts.ts (officer-facing) so coverage
 * numbers can never drift from what officers themselves can see/acknowledge:
 *  - all_officers: every officer_users row (role_id = officer) — same
 *    roster GET /api/supervisor/officers already returns, unfiltered by
 *    employment status, matching how the officer-facing route treats scope.
 *  - shift: officers assigned/accepted onto the alert's target shift.
 *  - officers: the explicit operational_alert_officers targets.
 */
async function resolveEligibleOfficerIds(
  alertId: string,
  targetScope: string,
  targetShiftId: string | null
): Promise<{ ids: number[]; error?: string }> {
  if (targetScope === 'all_officers') {
    const { data, error } = await serviceSupabase.from('officer_users').select('officer_id').eq('role_id', ROLE_OFFICER);
    if (error) return { ids: [], error: error.message };
    return { ids: Array.from(new Set((data ?? []).map((row: { officer_id: unknown }) => Number(row.officer_id)))) };
  }
  if (targetScope === 'shift') {
    if (!targetShiftId) return { ids: [] };
    const { data, error } = await serviceSupabase
      .from('roadblock_shift_officers')
      .select('officer_id')
      .eq('shift_id', targetShiftId)
      .in('assignment_status', ['assigned', 'accepted']);
    if (error) return { ids: [], error: error.message };
    return { ids: Array.from(new Set((data ?? []).map((row: { officer_id: unknown }) => Number(row.officer_id)))) };
  }
  if (targetScope === 'officers') {
    const { data, error } = await serviceSupabase
      .from('operational_alert_officers')
      .select('officer_id')
      .eq('alert_id', alertId);
    if (error) return { ids: [], error: error.message };
    return { ids: Array.from(new Set((data ?? []).map((row: { officer_id: unknown }) => Number(row.officer_id)))) };
  }
  return { ids: [] };
}

const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

function isMissingTable(error: { message?: string; code?: string } | null | undefined): boolean {
  return !!error && (error.code === '42P01' || /operational_alert/i.test(error.message ?? ''));
}

function optionalTrimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sanitizeOfficerIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const ids = value
    .map((item) => Number(item))
    .filter((id) => Number.isInteger(id) && id > 0);
  return Array.from(new Set(ids));
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function supervisorNameFromEmail(email: string | null | undefined): string {
  const local = email?.split('@')[0]?.replace(/[._-]+/g, ' ').trim();
  return local || 'Supervisor';
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
    issuedBySource: String(row.issued_by_source),
    issuedById: Number(row.issued_by_id),
    issuedByName: String(row.issued_by_name),
    targetScope: String(row.target_scope),
    targetShiftId: row.target_shift_id == null ? null : String(row.target_shift_id),
    sourceType: String(row.source_type),
    sourceAuthority: row.source_authority == null ? null : String(row.source_authority),
    sourceReference: row.source_reference == null ? null : String(row.source_reference),
    status: String(row.status),
    expiresAt: row.expires_at == null ? null : String(row.expires_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at ?? row.created_at),
    version: row.version == null ? 1 : Number(row.version),
    statusReason: row.status_reason == null ? null : String(row.status_reason),
    statusReasonBy: row.status_reason_by == null ? null : String(row.status_reason_by),
    statusReasonAt: row.status_reason_at == null ? null : String(row.status_reason_at),
    ...extra
  };
}

/**
 * requireSupervisor also accepts Admin (for read-only oversight). Issuing, updating,
 * or photo-attaching an operational alert is a field-command action reserved for
 * Supervisors — Admin's role is account/system administration and audit visibility,
 * not originating operational content (see supervisor/shifts.ts, cases.ts, etc.,
 * none of which Admin has a UI path to author either).
 */
const requireSupervisorRole: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get('roleId') !== ROLE_SUPERVISOR) {
    return c.json({ error: 'Only supervisor accounts can issue operational alerts' }, 403);
  }
  await next();
};

router.use('*', requireSupervisor);

router.post('/', requireSupervisorRole, async (c) => {
  const body = await readJson(c);

  const alertType = String(body.alertType ?? '');
  const rawPriority = body.priority;
  const priority = typeof rawPriority === 'string' && PRIORITIES.has(rawPriority) ? rawPriority : 'medium';
  const description = String(body.description ?? '').trim();
  const sourceType = typeof body.sourceType === 'string' && SOURCE_TYPES.has(body.sourceType) ? body.sourceType : 'internal';
  const sourceAuthority = optionalTrimmedString(body.sourceAuthority) ?? '';
  const sourceReference = optionalTrimmedString(body.sourceReference) ?? '';
  const targetScope = String(body.targetScope ?? '');
  const targetShiftId = optionalTrimmedString(body.targetShiftId);
  const officerIds = sanitizeOfficerIds(body.officerIds);
  const personReference = typeof body.personReference === 'string' ? body.personReference.trim() : '';
  const location = (body.location ?? {}) as { lat?: unknown; lng?: unknown; label?: unknown; radiusMeters?: unknown };
  const explicitExpiresAt = body.expiresAt ? parseDate(body.expiresAt) : null;

  if (!ALERT_TYPES.has(alertType)) {
    return c.json({ error: 'A valid alert type is required' }, 400);
  }
  if (rawPriority != null && (typeof rawPriority !== 'string' || !PRIORITIES.has(rawPriority))) {
    return c.json({ error: `priority must be one of: ${Array.from(PRIORITIES).join(', ')}` }, 400);
  }
  if (!description) {
    return c.json({ error: 'Description is required' }, 400);
  }
  if (!TARGET_SCOPES.has(targetScope)) {
    return c.json({ error: 'A valid target scope is required' }, 400);
  }
  if (targetScope === 'shift' && !targetShiftId) {
    return c.json({ error: 'targetShiftId is required when targetScope is shift' }, 400);
  }
  if (targetScope === 'officers' && officerIds.length === 0) {
    return c.json({ error: 'At least one officer id is required when targetScope is officers' }, 400);
  }
  if (BOLO_TYPES.has(alertType) && sourceType !== 'external') {
    return c.json(
      {
        error: 'BOLO alerts for a person or vehicle must come from an external authority — set source type to external with an authority and reference'
      },
      400
    );
  }
  if (sourceType === 'external' && (!sourceAuthority || !sourceReference)) {
    return c.json({ error: 'External alerts require both a source authority and a source reference' }, 400);
  }
  if (personReference && PERSON_REFERENCE_ID_NUMBER_PATTERN.test(personReference)) {
    return c.json({ error: 'Do not enter a full ID number in the person reference — use a partial reference or description' }, 400);
  }
  if (location.lat != null && !isValidLatitude(Number(location.lat))) {
    return c.json({ error: 'location.lat must be between -90 and 90' }, 400);
  }
  if (location.lng != null && !isValidLongitude(Number(location.lng))) {
    return c.json({ error: 'location.lng must be between -180 and 180' }, 400);
  }
  if (location.radiusMeters != null && !isValidRadiusMeters(Number(location.radiusMeters))) {
    return c.json({ error: `location.radiusMeters must be a positive number up to ${MAX_LOCATION_RADIUS_METERS}` }, 400);
  }

  // BOLO/hazard bulletins get a documented operational default expiry when
  // the Supervisor doesn't set one (see ALERT_TYPE_DEFAULT_EXPIRY_HOURS);
  // general alerts stay open-ended, matching prior behavior.
  const expiresAt = resolveDefaultExpiresAt(alertType, explicitExpiresAt);

  const supervisorEmail = c.get('userEmail') ?? 'unknown';
  const insertPayload = {
    alert_type: alertType,
    priority,
    description,
    vehicle_registration: optionalTrimmedString(body.vehicleRegistration),
    vehicle_description: optionalTrimmedString(body.vehicleDescription),
    person_name: optionalTrimmedString(body.personName),
    person_description: optionalTrimmedString(body.personDescription),
    person_reference: personReference || null,
    location_lat: optionalNumber(location.lat),
    location_lng: optionalNumber(location.lng),
    location_label: optionalTrimmedString(location.label),
    location_radius_meters: optionalNumber(location.radiusMeters),
    issued_by_source: 'supervisor_users',
    issued_by_id: c.get('supervisorOfficerId'),
    issued_by_name: supervisorNameFromEmail(supervisorEmail),
    target_scope: targetScope,
    target_shift_id: targetScope === 'shift' ? targetShiftId : null,
    source_type: sourceType,
    source_authority: sourceType === 'external' ? sourceAuthority : null,
    source_reference: sourceType === 'external' ? sourceReference : null,
    expires_at: expiresAt ? expiresAt.toISOString() : null
  };

  const { data: inserted, error: insertError } = await serviceSupabase
    .from('operational_alerts')
    .insert([insertPayload])
    .select('*');

  if (insertError || !inserted?.length) {
    if (isMissingTable(insertError)) {
      return c.json({ error: 'Operational alert tables are not set up. Run backend/migrations/20260910_operational_alerts.sql.' }, 503);
    }
    return c.json({ error: insertError?.message ?? 'Failed to create operational alert' }, 400);
  }

  const alertRow = inserted[0] as Record<string, unknown>;

  if (targetScope === 'officers') {
    const { error: targetError } = await serviceSupabase
      .from('operational_alert_officers')
      .insert(officerIds.map((officerId) => ({ alert_id: alertRow.id, officer_id: officerId })));

    if (targetError) {
      await serviceSupabase.from('operational_alerts').delete().eq('id', alertRow.id);
      return c.json({ error: targetError.message }, 500);
    }
  }

  await writeAuditLog(supervisorEmail, `Created operational alert (${alertType})`, String(alertRow.id));

  return c.json(toOperationalAlert(alertRow, {
    assignedOfficerIds: targetScope === 'officers' ? officerIds : []
  }), 201);
});

router.get('/', async (c) => {
  const { data: rows, error } = await serviceSupabase
    .from('operational_alerts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    if (isMissingTable(error)) {
      return c.json({ error: 'Operational alert tables are not set up. Run backend/migrations/20260910_operational_alerts.sql.' }, 503);
    }
    return c.json({ error: error.message }, 500);
  }

  const alertIds = (rows ?? []).map((row) => String(row.id));

  const [ackRes, matchRes, targetRes] = await Promise.all([
    alertIds.length
      ? serviceSupabase.from('operational_alert_acknowledgements').select('alert_id').in('alert_id', alertIds)
      : Promise.resolve({ data: [] as Array<{ alert_id: string }>, error: null }),
    alertIds.length
      ? serviceSupabase.from('operational_alert_matches').select('alert_id').in('alert_id', alertIds)
      : Promise.resolve({ data: [] as Array<{ alert_id: string }>, error: null }),
    alertIds.length
      ? serviceSupabase.from('operational_alert_officers').select('alert_id, officer_id').in('alert_id', alertIds)
      : Promise.resolve({ data: [] as Array<{ alert_id: string; officer_id: number }>, error: null })
  ]);

  const ackCounts = new Map<string, number>();
  for (const row of ackRes.data ?? []) {
    const key = String(row.alert_id);
    ackCounts.set(key, (ackCounts.get(key) ?? 0) + 1);
  }

  const matchCounts = new Map<string, number>();
  for (const row of matchRes.data ?? []) {
    const key = String(row.alert_id);
    matchCounts.set(key, (matchCounts.get(key) ?? 0) + 1);
  }

  const targetsByAlert = new Map<string, number[]>();
  for (const row of targetRes.data ?? []) {
    const key = String(row.alert_id);
    targetsByAlert.set(key, [...(targetsByAlert.get(key) ?? []), Number(row.officer_id)]);
  }

  return c.json((rows ?? []).map((row) => toOperationalAlert(row as Record<string, unknown>, {
    acknowledgementCount: ackCounts.get(String(row.id)) ?? 0,
    matchCount: matchCounts.get(String(row.id)) ?? 0,
    assignedOfficerIds: targetsByAlert.get(String(row.id)) ?? []
  })));
});

router.patch('/:id', requireSupervisorRole, async (c) => {
  const alertId = String(c.req.param('id'));
  const body = await readJson(c);

  const { data: existingRow, error: existingError } = await serviceSupabase
    .from('operational_alerts')
    .select('*')
    .eq('id', alertId)
    .maybeSingle();

  if (existingError) return c.json({ error: existingError.message }, 500);
  if (!existingRow) return c.json({ error: 'Operational alert not found' }, 404);
  const existing = existingRow as Record<string, unknown>;

  const status = typeof body.status === 'string' ? body.status : undefined;
  const hasExpiresPatch = Object.prototype.hasOwnProperty.call(body, 'expiresAt');
  const hasLocationPatch = Object.prototype.hasOwnProperty.call(body, 'location');
  const location = hasLocationPatch ? ((body.location ?? {}) as { lat?: unknown; lng?: unknown; label?: unknown; radiusMeters?: unknown }) : null;
  const hasPriorityPatch = Object.prototype.hasOwnProperty.call(body, 'priority');
  const hasDescriptionPatch = Object.prototype.hasOwnProperty.call(body, 'description');
  const hasTargetPatch = ['targetScope', 'targetShiftId', 'officerIds'].some((key) => Object.prototype.hasOwnProperty.call(body, key));
  const hasSourcePatch = ['sourceType', 'sourceAuthority', 'sourceReference'].some((key) => Object.prototype.hasOwnProperty.call(body, key));
  // "This changes operational meaning — require re-acknowledgement" checkbox,
  // shown by the Supervisor UI alongside a description/instructions edit.
  // Default OFF: only forces materiality when the description actually changed.
  const materialChangeOverride = body.materialChangeOverride === true;
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  // Resolved = the operational condition ended/completed. Cancelled = the
  // alert was withdrawn, issued in error, or is no longer applicable.
  // Distinct semantics; neither implies a legal determination about a
  // person or vehicle. A reason is mandatory for both so the record of why
  // an alert stopped being active is never blank.
  const isClosingStatus = status === 'resolved' || status === 'cancelled';

  if (!status && !hasExpiresPatch && !hasLocationPatch && !hasPriorityPatch && !hasDescriptionPatch && !hasTargetPatch && !hasSourcePatch) {
    return c.json({ error: 'Provide at least one field to update' }, 400);
  }
  if (status && !STATUSES.has(status)) {
    return c.json({ error: `Status must be one of: ${Array.from(STATUSES).join(', ')}` }, 400);
  }
  if (isClosingStatus && !reason) {
    return c.json({ error: `A reason is required when marking an alert as ${status}` }, 400);
  }
  if (location?.lat != null && !isValidLatitude(Number(location.lat))) {
    return c.json({ error: 'location.lat must be between -90 and 90' }, 400);
  }
  if (location?.lng != null && !isValidLongitude(Number(location.lng))) {
    return c.json({ error: 'location.lng must be between -180 and 180' }, 400);
  }
  if (location?.radiusMeters != null && !isValidRadiusMeters(Number(location.radiusMeters))) {
    return c.json({ error: `location.radiusMeters must be a positive number up to ${MAX_LOCATION_RADIUS_METERS}` }, 400);
  }

  let priority: string | undefined;
  if (hasPriorityPatch) {
    if (typeof body.priority !== 'string' || !PRIORITIES.has(body.priority)) {
      return c.json({ error: `priority must be one of: ${Array.from(PRIORITIES).join(', ')}` }, 400);
    }
    priority = body.priority;
  }

  let description: string | undefined;
  if (hasDescriptionPatch) {
    description = String(body.description ?? '').trim();
    if (!description) {
      return c.json({ error: 'Description cannot be empty' }, 400);
    }
  }

  const existingAlertType = String(existing.alert_type);
  const existingTargetScope = String(existing.target_scope);

  let targetScope: string | undefined;
  let targetShiftId: string | null = null;
  let officerIds: number[] | undefined;
  if (hasTargetPatch) {
    targetScope = typeof body.targetScope === 'string' ? body.targetScope : existingTargetScope;
    if (!TARGET_SCOPES.has(targetScope)) {
      return c.json({ error: 'A valid target scope is required' }, 400);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'targetShiftId')) {
      targetShiftId = optionalTrimmedString(body.targetShiftId);
    } else if (targetScope === existingTargetScope) {
      targetShiftId = existing.target_shift_id == null ? null : String(existing.target_shift_id);
    }
    officerIds = Object.prototype.hasOwnProperty.call(body, 'officerIds') ? sanitizeOfficerIds(body.officerIds) : undefined;

    if (targetScope === 'shift' && !targetShiftId) {
      return c.json({ error: 'targetShiftId is required when targetScope is shift' }, 400);
    }
    if (targetScope === 'officers' && (!officerIds || officerIds.length === 0)) {
      return c.json({ error: 'At least one officer id is required when targetScope is officers' }, 400);
    }
  }

  let sourceType: string | undefined;
  let sourceAuthority = '';
  let sourceReference = '';
  if (hasSourcePatch) {
    sourceType = typeof body.sourceType === 'string' && SOURCE_TYPES.has(body.sourceType) ? body.sourceType : String(existing.source_type);
    sourceAuthority = Object.prototype.hasOwnProperty.call(body, 'sourceAuthority')
      ? (optionalTrimmedString(body.sourceAuthority) ?? '')
      : (existing.source_authority == null ? '' : String(existing.source_authority));
    sourceReference = Object.prototype.hasOwnProperty.call(body, 'sourceReference')
      ? (optionalTrimmedString(body.sourceReference) ?? '')
      : (existing.source_reference == null ? '' : String(existing.source_reference));

    if (BOLO_TYPES.has(existingAlertType) && sourceType !== 'external') {
      return c.json(
        {
          error: 'BOLO alerts for a person or vehicle must come from an external authority — set source type to external with an authority and reference'
        },
        400
      );
    }
    if (sourceType === 'external' && (!sourceAuthority || !sourceReference)) {
      return c.json({ error: 'External alerts require both a source authority and a source reference' }, 400);
    }
  }

  // ---- Material-change classification (deterministic, never AI-inferred) ----
  const priorityIncreased = hasPriorityPatch && priority !== undefined
    && priorityWeight(priority) > priorityWeight(String(existing.priority));

  let existingOfficerIds: number[] = [];
  if (hasTargetPatch && (targetScope === 'officers' || existingTargetScope === 'officers')) {
    const { data: existingTargetRows, error: existingTargetError } = await serviceSupabase
      .from('operational_alert_officers')
      .select('officer_id')
      .eq('alert_id', alertId);
    if (existingTargetError) return c.json({ error: existingTargetError.message }, 500);
    existingOfficerIds = ((existingTargetRows ?? []) as Array<{ officer_id: unknown }>).map((row) => Number(row.officer_id));
  }

  const targetChanged = hasTargetPatch && (
    targetScope !== existingTargetScope
    || (targetScope === 'shift' && targetShiftId !== (existing.target_shift_id == null ? null : String(existing.target_shift_id)))
    || (targetScope === 'officers' && officerIds !== undefined && !sameOfficerIdSet(officerIds, existingOfficerIds))
  );

  const existingLocationLat = existing.location_lat == null ? null : Number(existing.location_lat);
  const existingLocationLng = existing.location_lng == null ? null : Number(existing.location_lng);
  const existingLocationRadius = existing.location_radius_meters == null ? null : Number(existing.location_radius_meters);
  const locationChanged = hasLocationPatch && (
    optionalNumber(location?.lat) !== existingLocationLat
    || optionalNumber(location?.lng) !== existingLocationLng
    || optionalNumber(location?.radiusMeters) !== existingLocationRadius
  );

  const sourceChanged = hasSourcePatch && (
    sourceType !== String(existing.source_type)
    || (sourceAuthority || null) !== (existing.source_authority == null ? null : String(existing.source_authority))
    || (sourceReference || null) !== (existing.source_reference == null ? null : String(existing.source_reference))
  );

  const descriptionChanged = hasDescriptionPatch && description !== String(existing.description);

  const existingExpiresAtIso = existing.expires_at == null ? null : String(existing.expires_at);
  const nextExpiresAtIso = hasExpiresPatch ? (parseDate(body.expiresAt)?.toISOString() ?? null) : undefined;
  const expiryChanged = hasExpiresPatch && nextExpiresAtIso !== existingExpiresAtIso;
  const expiryMaterial = expiryChanged && isExpiryChangeMaterial(existingExpiresAtIso, nextExpiresAtIso ?? null);

  const { material, reasons } = computeMaterialChange({
    priorityIncreased,
    targetChanged,
    locationChanged,
    sourceChanged,
    descriptionChanged,
    materialChangeOverride,
    expiryMaterial
  });

  const existingVersion = existing.version == null ? 1 : Number(existing.version);
  const nextVersion = material ? existingVersion + 1 : existingVersion;

  // ---- Build and apply the update ----
  const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (status) updatePayload.status = status;
  if (isClosingStatus) {
    updatePayload.status_reason = reason;
    updatePayload.status_reason_by = c.get('userEmail') ?? 'unknown';
    updatePayload.status_reason_at = new Date().toISOString();
  }
  if (hasExpiresPatch) updatePayload.expires_at = nextExpiresAtIso ?? null;
  if (location) {
    updatePayload.location_lat = optionalNumber(location.lat);
    updatePayload.location_lng = optionalNumber(location.lng);
    updatePayload.location_label = optionalTrimmedString(location.label);
    updatePayload.location_radius_meters = optionalNumber(location.radiusMeters);
  }
  if (hasPriorityPatch) updatePayload.priority = priority;
  if (hasDescriptionPatch) updatePayload.description = description;
  if (hasTargetPatch) {
    updatePayload.target_scope = targetScope;
    updatePayload.target_shift_id = targetScope === 'shift' ? targetShiftId : null;
  }
  if (hasSourcePatch) {
    updatePayload.source_type = sourceType;
    updatePayload.source_authority = sourceType === 'external' ? sourceAuthority : null;
    updatePayload.source_reference = sourceType === 'external' ? sourceReference : null;
  }
  // Never decremented, never reset by a non-material edit — only bumped here.
  if (material) {
    updatePayload.version = nextVersion;
    updatePayload.version_updated_at = new Date().toISOString();
  }

  const { data, error } = await serviceSupabase
    .from('operational_alerts')
    .update(updatePayload)
    .eq('id', alertId)
    .select('*')
    .maybeSingle();

  if (error) return c.json({ error: error.message }, 500);
  if (!data) return c.json({ error: 'Operational alert not found' }, 404);

  if (hasTargetPatch) {
    const { error: deleteTargetError } = await serviceSupabase
      .from('operational_alert_officers')
      .delete()
      .eq('alert_id', alertId);
    if (deleteTargetError) return c.json({ error: deleteTargetError.message }, 500);

    if (targetScope === 'officers' && officerIds && officerIds.length) {
      const { error: insertTargetError } = await serviceSupabase
        .from('operational_alert_officers')
        .insert(officerIds.map((officerId) => ({ alert_id: alertId, officer_id: officerId })));
      if (insertTargetError) return c.json({ error: insertTargetError.message }, 500);
    }
  }

  await writeAuditLog(
    c.get('userEmail') ?? 'unknown',
    `Updated operational alert ${alertId}${status ? ` to ${status}` : ''}`
      + (isClosingStatus ? `: ${reason}` : '')
      + (material ? ` (material change — now v${nextVersion}, re-acknowledgement required: ${reasons.join('; ')})` : ''),
    alertId
  );

  return c.json(toOperationalAlert(data as Record<string, unknown>, {
    ...(hasTargetPatch && targetScope === 'officers' ? { assignedOfficerIds: officerIds ?? [] } : {}),
    materialChange: material
  }));
});

router.post('/:id/photo', requireSupervisorRole, async (c) => {
  const alertId = String(c.req.param('id'));
  let file: { originalname: string; mimetype: string; buffer: Uint8Array; size: number } | null = null;
  try {
    file = (await readUpload(c, 'photo')).file;
  } catch {
    file = null;
  }

  if (!file || !ALLOWED_PHOTO_TYPES.includes(file.mimetype)) {
    return c.json({ error: 'A photo file is required' }, 400);
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new Error('File too large');
  }

  const { data: existing, error: existingError } = await serviceSupabase
    .from('operational_alerts')
    .select('id')
    .eq('id', alertId)
    .maybeSingle();

  if (existingError) return c.json({ error: existingError.message }, 500);
  if (!existing) return c.json({ error: 'Operational alert not found' }, 404);

  const extension = file.originalname.split('.').pop()?.replace(/[^a-z0-9]/gi, '') || 'jpg';
  const storagePath = `operational-alerts/${alertId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;

  const { error: storageError } = await serviceSupabase.storage
    .from('evidence')
    .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });

  if (storageError) {
    return c.json({ error: `Alert photo upload failed: ${storageError.message}` }, 500);
  }

  const { data: urlData } = serviceSupabase.storage.from('evidence').getPublicUrl(storagePath);

  const { data, error } = await serviceSupabase
    .from('operational_alerts')
    .update({
      photo_url: urlData.publicUrl,
      photo_storage_path: storagePath,
      updated_at: new Date().toISOString()
    })
    .eq('id', alertId)
    .select('*')
    .single();

  if (error) return c.json({ error: error.message }, 500);

  await writeAuditLog(c.get('userEmail') ?? 'unknown', `Attached photo to operational alert ${alertId}`, alertId);

  return c.json(toOperationalAlert(data as Record<string, unknown>), 201);
});

router.get('/:id/acknowledgements', async (c) => {
  const alertId = c.req.param('id');

  const { data: alertRow, error: alertError } = await serviceSupabase
    .from('operational_alerts')
    .select('version')
    .eq('id', alertId)
    .maybeSingle();
  if (alertError) return c.json({ error: alertError.message }, 500);
  const currentVersion = alertRow && !Array.isArray(alertRow) && (alertRow as Record<string, unknown>).version != null
    ? Number((alertRow as Record<string, unknown>).version)
    : 1;

  const { data, error } = await serviceSupabase
    .from('operational_alert_acknowledgements')
    .select('*')
    .eq('alert_id', alertId)
    .order('acknowledged_at', { ascending: false });

  if (error) return c.json({ error: error.message }, 500);

  // A material edit bumps the alert's version — an acknowledgement recorded
  // against an earlier version no longer counts as coverage for the alert as
  // it exists today, so it's excluded here rather than being surfaced as if
  // the officer had seen the current content.
  return c.json((data ?? [])
    .filter((row) => (row.alert_version == null ? 1 : Number(row.alert_version)) === currentVersion)
    .map((row) => ({
      officerId: Number(row.officer_id),
      officerName: String(row.officer_name),
      badgeNumber: String(row.badge_number),
      acknowledgedAt: String(row.acknowledged_at)
    })));
});

/**
 * Acknowledgement coverage for the alert's *current* version, resolved
 * against the actual eligible roster for its target scope (all officers /
 * shift / explicitly targeted) — never a raw headcount of whoever happens
 * to have an acknowledgement row. Also carries the Critical
 * non-acknowledgement awareness flag: informational only, see
 * isCriticalNonAckWarning — never a trigger for automatic dispatch,
 * punishment, or escalation.
 */
router.get('/:id/coverage', async (c) => {
  const alertId = String(c.req.param('id'));

  const { data: alertRow, error: alertError } = await serviceSupabase
    .from('operational_alerts')
    .select('*')
    .eq('id', alertId)
    .maybeSingle();
  if (alertError) return c.json({ error: alertError.message }, 500);
  if (!alertRow) return c.json({ error: 'Operational alert not found' }, 404);
  const alert = alertRow as Record<string, unknown>;
  const currentVersion = alert.version == null ? 1 : Number(alert.version);
  const targetScope = String(alert.target_scope);
  const targetShiftId = alert.target_shift_id == null ? null : String(alert.target_shift_id);

  const { ids: eligibleOfficerIds, error: eligibilityError } = await resolveEligibleOfficerIds(alertId, targetScope, targetShiftId);
  if (eligibilityError) return c.json({ error: eligibilityError }, 500);

  const { data: ackRows, error: ackError } = await serviceSupabase
    .from('operational_alert_acknowledgements')
    .select('*')
    .eq('alert_id', alertId);
  if (ackError) return c.json({ error: ackError.message }, 500);

  const currentAcksByOfficer = new Map<number, Record<string, unknown>>();
  for (const row of (ackRows ?? []) as Record<string, unknown>[]) {
    const rowVersion = row.alert_version == null ? 1 : Number(row.alert_version);
    if (rowVersion === currentVersion) currentAcksByOfficer.set(Number(row.officer_id), row);
  }

  // Only ever counted against the eligible roster — an officer who
  // acknowledged before being removed from targeting (or who is no longer
  // eligible for any other reason) is never counted here.
  const acknowledgedOfficerIds = eligibleOfficerIds.filter((id) => currentAcksByOfficer.has(id));
  const outstandingOfficerIds = eligibleOfficerIds.filter((id) => !currentAcksByOfficer.has(id));

  const outstandingProfiles = new Map<number, Record<string, unknown>>();
  if (outstandingOfficerIds.length) {
    const { data, error } = await serviceSupabase
      .from('officer_users')
      .select('officer_id, officer_name, officer_surname, badge_number')
      .in('officer_id', outstandingOfficerIds);
    if (error) return c.json({ error: error.message }, 500);
    for (const row of (data ?? []) as Record<string, unknown>[]) outstandingProfiles.set(Number(row.officer_id), row);
  }

  const totalTargeted = eligibleOfficerIds.length;
  const acknowledgedCount = acknowledgedOfficerIds.length;
  const outstandingCount = outstandingOfficerIds.length;
  const percentage = totalTargeted > 0 ? Math.round((acknowledgedCount / totalTargeted) * 100) : 0;

  return c.json({
    alertId,
    version: currentVersion,
    priority: String(alert.priority),
    status: String(alert.status),
    targetScope,
    totalTargeted,
    acknowledgedCount,
    outstandingCount,
    percentage,
    acknowledgedOfficers: acknowledgedOfficerIds.map((id) => {
      const row = currentAcksByOfficer.get(id) as Record<string, unknown>;
      return {
        officerId: id,
        officerName: String(row.officer_name),
        badgeNumber: String(row.badge_number),
        acknowledgedAt: String(row.acknowledged_at)
      };
    }),
    outstandingOfficers: outstandingOfficerIds.map((id) => {
      const profile = outstandingProfiles.get(id);
      return {
        officerId: id,
        officerName: profile ? `${profile.officer_name} ${profile.officer_surname}`.trim() : `Officer ${id}`,
        badgeNumber: profile ? String(profile.badge_number) : ''
      };
    }),
    criticalNonAckWarning: isCriticalNonAckWarning(alert, outstandingCount),
    criticalNonAckThresholdMinutes: CRITICAL_UNACK_WARNING_MINUTES
  });
});

router.get('/:id/matches', async (c) => {
  const { data, error } = await serviceSupabase
    .from('operational_alert_matches')
    .select('*')
    .eq('alert_id', c.req.param('id'))
    .order('created_at', { ascending: false });

  if (error) return c.json({ error: error.message }, 500);

  return c.json((data ?? []).map((row) => ({
    id: Number(row.id),
    officerId: Number(row.officer_id),
    officerName: String(row.officer_name),
    badgeNumber: String(row.badge_number),
    notes: String(row.notes),
    locationLat: row.location_lat == null ? null : Number(row.location_lat),
    locationLng: row.location_lng == null ? null : Number(row.location_lng),
    createdAt: String(row.created_at)
  })));
});

/**
 * Cross-alert sighting listing for the supervisor Map / Heatmap views.
 * Deliberately read-only, no new concept: reuses operational_alert_matches
 * exactly as-is (a "reported sighting" is a possible-match report — never a
 * confirmed location, wanted/stolen status, or identification). Only
 * sightings that already carry coordinates are returned — this endpoint
 * exists purely to feed a map, not as a general audit trail (use
 * GET /:id/matches for that).
 */
router.get('/sightings', async (c) => {
  const alertTypeParam = c.req.query('alertType');
  const priorityParam = c.req.query('priority');
  const alertIdParam = c.req.query('alertId');
  const alertTypeFilter = typeof alertTypeParam === 'string' && ALERT_TYPES.has(alertTypeParam)
    ? alertTypeParam
    : null;
  const priorityFilter = typeof priorityParam === 'string' && PRIORITIES.has(priorityParam)
    ? priorityParam
    : null;
  const alertIdFilter = typeof alertIdParam === 'string' && alertIdParam.trim() ? alertIdParam.trim() : null;
  const fromFilter = parseDate(c.req.query('from'));
  const toFilter = parseDate(c.req.query('to'));

  let matchesQuery = serviceSupabase
    .from('operational_alert_matches')
    .select('*')
    .not('location_lat', 'is', null)
    .not('location_lng', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1000);

  if (alertIdFilter) matchesQuery = matchesQuery.eq('alert_id', alertIdFilter);
  if (fromFilter) matchesQuery = matchesQuery.gte('created_at', fromFilter.toISOString());
  if (toFilter) matchesQuery = matchesQuery.lte('created_at', toFilter.toISOString());

  const { data: matchRows, error: matchError } = await matchesQuery;
  if (matchError) {
    if (isMissingTable(matchError)) {
      return c.json({ error: 'Operational alert tables are not set up. Run backend/migrations/20260910_operational_alerts.sql.' }, 503);
    }
    return c.json({ error: matchError.message }, 500);
  }

  const matches = (matchRows ?? []) as Record<string, unknown>[];
  const alertIds = Array.from(new Set(matches.map((row) => String(row.alert_id))));

  const alertsById = new Map<string, Record<string, unknown>>();
  if (alertIds.length) {
    const { data: alertRows, error: alertError } = await serviceSupabase
      .from('operational_alerts')
      .select('id, alert_type, priority, description, source_type, source_authority, status')
      .in('id', alertIds);

    if (alertError) return c.json({ error: alertError.message }, 500);
    for (const row of (alertRows ?? []) as Record<string, unknown>[]) {
      alertsById.set(String(row.id), row);
    }
  }

  const sightings = matches
    .map((row) => {
      const alert = alertsById.get(String(row.alert_id));
      return { row, alert };
    })
    .filter(({ alert }) => {
      if (!alert) return false;
      if (alertTypeFilter && String(alert.alert_type) !== alertTypeFilter) return false;
      if (priorityFilter && String(alert.priority) !== priorityFilter) return false;
      return true;
    })
    .map(({ row, alert }) => ({
      id: Number(row.id),
      alertId: String(row.alert_id),
      notes: String(row.notes),
      locationLat: Number(row.location_lat),
      locationLng: Number(row.location_lng),
      createdAt: String(row.created_at),
      officerId: Number(row.officer_id),
      officerName: String(row.officer_name),
      badgeNumber: String(row.badge_number),
      alertType: String(alert!.alert_type),
      alertDescription: String(alert!.description),
      priority: String(alert!.priority),
      alertStatus: String(alert!.status),
      sourceType: String(alert!.source_type),
      sourceAuthority: alert!.source_authority == null ? null : String(alert!.source_authority)
    }));

  return c.json(sightings);
});

export default router;

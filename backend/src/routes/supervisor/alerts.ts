import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import { requireSupervisor, type SupervisorRequest } from '../../middleware/requireSupervisor';
import { ROLE_SUPERVISOR } from '../../constants/roles';
import { writeAuditLog } from '../../utilities/auditLog';
import { asyncHandler } from '../../asyncHandler';
import { priorityWeight } from '../../utilities/alertPriority';

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

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => callback(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype))
});

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
function requireSupervisorRole(req: any, res: any, next: any) {
  const authReq = req as SupervisorRequest;
  if (authReq.roleId !== ROLE_SUPERVISOR) {
    return res.status(403).json({ error: 'Only supervisor accounts can issue operational alerts' });
  }
  return next();
}

router.use(requireSupervisor);

router.post('/', requireSupervisorRole, asyncHandler(async (req, res) => {
  const authReq = req as SupervisorRequest;
  const body = (req.body ?? {}) as Record<string, unknown>;

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
  const expiresAt = body.expiresAt ? parseDate(body.expiresAt) : null;

  if (!ALERT_TYPES.has(alertType)) {
    return res.status(400).json({ error: 'A valid alert type is required' });
  }
  if (rawPriority != null && (typeof rawPriority !== 'string' || !PRIORITIES.has(rawPriority))) {
    return res.status(400).json({ error: `priority must be one of: ${Array.from(PRIORITIES).join(', ')}` });
  }
  if (!description) {
    return res.status(400).json({ error: 'Description is required' });
  }
  if (!TARGET_SCOPES.has(targetScope)) {
    return res.status(400).json({ error: 'A valid target scope is required' });
  }
  if (targetScope === 'shift' && !targetShiftId) {
    return res.status(400).json({ error: 'targetShiftId is required when targetScope is shift' });
  }
  if (targetScope === 'officers' && officerIds.length === 0) {
    return res.status(400).json({ error: 'At least one officer id is required when targetScope is officers' });
  }
  if (BOLO_TYPES.has(alertType) && sourceType !== 'external') {
    return res.status(400).json({
      error: 'BOLO alerts for a person or vehicle must come from an external authority — set source type to external with an authority and reference'
    });
  }
  if (sourceType === 'external' && (!sourceAuthority || !sourceReference)) {
    return res.status(400).json({ error: 'External alerts require both a source authority and a source reference' });
  }
  if (personReference && PERSON_REFERENCE_ID_NUMBER_PATTERN.test(personReference)) {
    return res.status(400).json({ error: 'Do not enter a full ID number in the person reference — use a partial reference or description' });
  }
  if (location.lat != null && !isValidLatitude(Number(location.lat))) {
    return res.status(400).json({ error: 'location.lat must be between -90 and 90' });
  }
  if (location.lng != null && !isValidLongitude(Number(location.lng))) {
    return res.status(400).json({ error: 'location.lng must be between -180 and 180' });
  }
  if (location.radiusMeters != null && !isValidRadiusMeters(Number(location.radiusMeters))) {
    return res.status(400).json({ error: `location.radiusMeters must be a positive number up to ${MAX_LOCATION_RADIUS_METERS}` });
  }

  const supervisorEmail = authReq.userEmail ?? 'unknown';
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
    issued_by_id: authReq.supervisorOfficerId,
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
      return res.status(503).json({ error: 'Operational alert tables are not set up. Run backend/migrations/20260910_operational_alerts.sql.' });
    }
    return res.status(400).json({ error: insertError?.message ?? 'Failed to create operational alert' });
  }

  const alertRow = inserted[0] as Record<string, unknown>;

  if (targetScope === 'officers') {
    const { error: targetError } = await serviceSupabase
      .from('operational_alert_officers')
      .insert(officerIds.map((officerId) => ({ alert_id: alertRow.id, officer_id: officerId })));

    if (targetError) {
      await serviceSupabase.from('operational_alerts').delete().eq('id', alertRow.id);
      return res.status(500).json({ error: targetError.message });
    }
  }

  await writeAuditLog(supervisorEmail, `Created operational alert (${alertType})`, String(alertRow.id));

  return res.status(201).json(toOperationalAlert(alertRow, {
    assignedOfficerIds: targetScope === 'officers' ? officerIds : []
  }));
}));

router.get('/', asyncHandler(async (_req, res) => {
  const { data: rows, error } = await serviceSupabase
    .from('operational_alerts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    if (isMissingTable(error)) {
      return res.status(503).json({ error: 'Operational alert tables are not set up. Run backend/migrations/20260910_operational_alerts.sql.' });
    }
    return res.status(500).json({ error: error.message });
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

  return res.json((rows ?? []).map((row) => toOperationalAlert(row as Record<string, unknown>, {
    acknowledgementCount: ackCounts.get(String(row.id)) ?? 0,
    matchCount: matchCounts.get(String(row.id)) ?? 0,
    assignedOfficerIds: targetsByAlert.get(String(row.id)) ?? []
  })));
}));

router.patch('/:id', requireSupervisorRole, asyncHandler(async (req, res) => {
  const authReq = req as SupervisorRequest;
  const alertId = String(req.params.id);
  const body = (req.body ?? {}) as Record<string, unknown>;

  const { data: existingRow, error: existingError } = await serviceSupabase
    .from('operational_alerts')
    .select('*')
    .eq('id', alertId)
    .maybeSingle();

  if (existingError) return res.status(500).json({ error: existingError.message });
  if (!existingRow) return res.status(404).json({ error: 'Operational alert not found' });
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

  if (!status && !hasExpiresPatch && !hasLocationPatch && !hasPriorityPatch && !hasDescriptionPatch && !hasTargetPatch && !hasSourcePatch) {
    return res.status(400).json({ error: 'Provide at least one field to update' });
  }
  if (status && !STATUSES.has(status)) {
    return res.status(400).json({ error: `Status must be one of: ${Array.from(STATUSES).join(', ')}` });
  }
  if (location?.lat != null && !isValidLatitude(Number(location.lat))) {
    return res.status(400).json({ error: 'location.lat must be between -90 and 90' });
  }
  if (location?.lng != null && !isValidLongitude(Number(location.lng))) {
    return res.status(400).json({ error: 'location.lng must be between -180 and 180' });
  }
  if (location?.radiusMeters != null && !isValidRadiusMeters(Number(location.radiusMeters))) {
    return res.status(400).json({ error: `location.radiusMeters must be a positive number up to ${MAX_LOCATION_RADIUS_METERS}` });
  }

  let priority: string | undefined;
  if (hasPriorityPatch) {
    if (typeof body.priority !== 'string' || !PRIORITIES.has(body.priority)) {
      return res.status(400).json({ error: `priority must be one of: ${Array.from(PRIORITIES).join(', ')}` });
    }
    priority = body.priority;
  }

  let description: string | undefined;
  if (hasDescriptionPatch) {
    description = String(body.description ?? '').trim();
    if (!description) {
      return res.status(400).json({ error: 'Description cannot be empty' });
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
      return res.status(400).json({ error: 'A valid target scope is required' });
    }
    if (Object.prototype.hasOwnProperty.call(body, 'targetShiftId')) {
      targetShiftId = optionalTrimmedString(body.targetShiftId);
    } else if (targetScope === existingTargetScope) {
      targetShiftId = existing.target_shift_id == null ? null : String(existing.target_shift_id);
    }
    officerIds = Object.prototype.hasOwnProperty.call(body, 'officerIds') ? sanitizeOfficerIds(body.officerIds) : undefined;

    if (targetScope === 'shift' && !targetShiftId) {
      return res.status(400).json({ error: 'targetShiftId is required when targetScope is shift' });
    }
    if (targetScope === 'officers' && (!officerIds || officerIds.length === 0)) {
      return res.status(400).json({ error: 'At least one officer id is required when targetScope is officers' });
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
      return res.status(400).json({
        error: 'BOLO alerts for a person or vehicle must come from an external authority — set source type to external with an authority and reference'
      });
    }
    if (sourceType === 'external' && (!sourceAuthority || !sourceReference)) {
      return res.status(400).json({ error: 'External alerts require both a source authority and a source reference' });
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
    if (existingTargetError) return res.status(500).json({ error: existingTargetError.message });
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
  if (material) updatePayload.version = nextVersion;

  const { data, error } = await serviceSupabase
    .from('operational_alerts')
    .update(updatePayload)
    .eq('id', alertId)
    .select('*')
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Operational alert not found' });

  if (hasTargetPatch) {
    const { error: deleteTargetError } = await serviceSupabase
      .from('operational_alert_officers')
      .delete()
      .eq('alert_id', alertId);
    if (deleteTargetError) return res.status(500).json({ error: deleteTargetError.message });

    if (targetScope === 'officers' && officerIds && officerIds.length) {
      const { error: insertTargetError } = await serviceSupabase
        .from('operational_alert_officers')
        .insert(officerIds.map((officerId) => ({ alert_id: alertId, officer_id: officerId })));
      if (insertTargetError) return res.status(500).json({ error: insertTargetError.message });
    }
  }

  await writeAuditLog(
    authReq.userEmail ?? 'unknown',
    `Updated operational alert ${alertId}${status ? ` to ${status}` : ''}`
      + (material ? ` (material change — now v${nextVersion}, re-acknowledgement required: ${reasons.join('; ')})` : ''),
    alertId
  );

  return res.json(toOperationalAlert(data as Record<string, unknown>, {
    ...(hasTargetPatch && targetScope === 'officers' ? { assignedOfficerIds: officerIds ?? [] } : {}),
    materialChange: material
  }));
}));

router.post('/:id/photo', requireSupervisorRole, photoUpload.single('photo'), asyncHandler(async (req, res) => {
  const authReq = req as SupervisorRequest;
  const alertId = String(req.params.id);
  const file = req.file as Express.Multer.File | undefined;

  if (!file) {
    return res.status(400).json({ error: 'A photo file is required' });
  }

  const { data: existing, error: existingError } = await serviceSupabase
    .from('operational_alerts')
    .select('id')
    .eq('id', alertId)
    .maybeSingle();

  if (existingError) return res.status(500).json({ error: existingError.message });
  if (!existing) return res.status(404).json({ error: 'Operational alert not found' });

  const extension = file.originalname.split('.').pop()?.replace(/[^a-z0-9]/gi, '') || 'jpg';
  const storagePath = `operational-alerts/${alertId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;

  const { error: storageError } = await serviceSupabase.storage
    .from('evidence')
    .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });

  if (storageError) {
    return res.status(500).json({ error: `Alert photo upload failed: ${storageError.message}` });
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

  if (error) return res.status(500).json({ error: error.message });

  await writeAuditLog(authReq.userEmail ?? 'unknown', `Attached photo to operational alert ${alertId}`, alertId);

  return res.status(201).json(toOperationalAlert(data as Record<string, unknown>));
}));

router.get('/:id/acknowledgements', asyncHandler(async (req, res) => {
  const alertId = req.params.id;

  const { data: alertRow, error: alertError } = await serviceSupabase
    .from('operational_alerts')
    .select('version')
    .eq('id', alertId)
    .maybeSingle();
  if (alertError) return res.status(500).json({ error: alertError.message });
  const currentVersion = alertRow && !Array.isArray(alertRow) && (alertRow as Record<string, unknown>).version != null
    ? Number((alertRow as Record<string, unknown>).version)
    : 1;

  const { data, error } = await serviceSupabase
    .from('operational_alert_acknowledgements')
    .select('*')
    .eq('alert_id', alertId)
    .order('acknowledged_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  // A material edit bumps the alert's version — an acknowledgement recorded
  // against an earlier version no longer counts as coverage for the alert as
  // it exists today, so it's excluded here rather than being surfaced as if
  // the officer had seen the current content.
  return res.json((data ?? [])
    .filter((row) => (row.alert_version == null ? 1 : Number(row.alert_version)) === currentVersion)
    .map((row) => ({
      officerId: Number(row.officer_id),
      officerName: String(row.officer_name),
      badgeNumber: String(row.badge_number),
      acknowledgedAt: String(row.acknowledged_at)
    })));
}));

router.get('/:id/matches', asyncHandler(async (req, res) => {
  const { data, error } = await serviceSupabase
    .from('operational_alert_matches')
    .select('*')
    .eq('alert_id', req.params.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  return res.json((data ?? []).map((row) => ({
    id: Number(row.id),
    officerId: Number(row.officer_id),
    officerName: String(row.officer_name),
    badgeNumber: String(row.badge_number),
    notes: String(row.notes),
    locationLat: row.location_lat == null ? null : Number(row.location_lat),
    locationLng: row.location_lng == null ? null : Number(row.location_lng),
    createdAt: String(row.created_at)
  })));
}));

/**
 * Cross-alert sighting listing for the supervisor Map / Heatmap views.
 * Deliberately read-only, no new concept: reuses operational_alert_matches
 * exactly as-is (a "reported sighting" is a possible-match report — never a
 * confirmed location, wanted/stolen status, or identification). Only
 * sightings that already carry coordinates are returned — this endpoint
 * exists purely to feed a map, not as a general audit trail (use
 * GET /:id/matches for that).
 */
router.get('/sightings', asyncHandler(async (req, res) => {
  const alertTypeFilter = typeof req.query.alertType === 'string' && ALERT_TYPES.has(req.query.alertType)
    ? req.query.alertType
    : null;
  const priorityFilter = typeof req.query.priority === 'string' && PRIORITIES.has(req.query.priority)
    ? req.query.priority
    : null;
  const alertIdFilter = typeof req.query.alertId === 'string' && req.query.alertId.trim() ? req.query.alertId.trim() : null;
  const fromFilter = parseDate(req.query.from);
  const toFilter = parseDate(req.query.to);

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
      return res.status(503).json({ error: 'Operational alert tables are not set up. Run backend/migrations/20260910_operational_alerts.sql.' });
    }
    return res.status(500).json({ error: matchError.message });
  }

  const matches = (matchRows ?? []) as Record<string, unknown>[];
  const alertIds = Array.from(new Set(matches.map((row) => String(row.alert_id))));

  const alertsById = new Map<string, Record<string, unknown>>();
  if (alertIds.length) {
    const { data: alertRows, error: alertError } = await serviceSupabase
      .from('operational_alerts')
      .select('id, alert_type, priority, description, source_type, source_authority, status')
      .in('id', alertIds);

    if (alertError) return res.status(500).json({ error: alertError.message });
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

  return res.json(sightings);
}));

export default router;

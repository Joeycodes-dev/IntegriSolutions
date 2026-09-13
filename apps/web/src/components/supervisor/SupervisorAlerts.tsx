import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Flame, Loader2, MapPin, Megaphone, Pencil, RefreshCw, ShieldAlert, Users, XCircle } from 'lucide-react';
import type {
  AlertSighting,
  AlertSightingFilters,
  CreateOperationalAlertPayload,
  FieldOfficer,
  OperationalAlert,
  OperationalAlertAcknowledgement,
  OperationalAlertCoverage,
  OperationalAlertMatch,
  OperationalAlertPriority,
  OperationalAlertSourceType,
  OperationalAlertStatus,
  OperationalAlertTargetScope,
  OperationalAlertType,
  RoadblockShift,
  UpdateOperationalAlertPayload
} from '../../types';
import {
  createOperationalAlert,
  getAlertSightings,
  getFieldOfficers,
  getOperationalAlertAcknowledgements,
  getOperationalAlertCoverage,
  getOperationalAlertMatches,
  getOperationalAlerts,
  getRoadblockShifts,
  updateOperationalAlert
} from '../../services/api';
import { filterSightings } from '../../lib/alertSightings';
import { SupervisorAlertsMap } from './SupervisorAlertsMap';
import { SupervisorAlertsHeatmap } from './SupervisorAlertsHeatmap';

// Photo upload is intentionally out of scope for this component: the backend
// endpoint (POST /api/supervisor/alerts/:id/photo) and uploadOperationalAlertPhoto
// client exist, but no file picker is wired up here yet — known limitation.
import { BORDER, NAVY, PAGE_BG, pageContent, pageShell } from './supervisorStyles';

type AlertsView = 'alerts' | 'map' | 'heatmap';

const inputClassName =
  'h-[32px] w-full rounded-lg border bg-white px-2.5 text-[0.75rem] text-slate-800 outline-none transition focus:border-[#0D2137]/35 focus:ring-1 focus:ring-[#0D2137]/10';

/**
 * This is an escalation signal only — it does not confirm that the person or vehicle
 * is wanted, stolen, arrested, or otherwise legally determined. Follow your unit's
 * operational procedure and escalate to the appropriate authority. This system does
 * not determine what action, if any, is lawful.
 */
export const MATCH_ESCALATION_DISCLAIMER =
  "This is an escalation signal only — it does not confirm that the person or vehicle is wanted, stolen, arrested, or otherwise legally determined. Follow your unit's operational procedure and escalate to the appropriate authority. This system does not determine what action, if any, is lawful.";

const ALERT_TYPES: Array<{ value: OperationalAlertType; label: string }> = [
  { value: 'general', label: 'General' },
  { value: 'hazard', label: 'Hazard' },
  { value: 'bolo_person', label: 'BOLO — Person' },
  { value: 'bolo_vehicle', label: 'BOLO — Vehicle' }
];
const BOLO_TYPES = new Set<OperationalAlertType>(['bolo_person', 'bolo_vehicle']);
const PRIORITIES: OperationalAlertPriority[] = ['critical', 'high', 'medium', 'low'];

interface AlertFormState {
  alertType: OperationalAlertType;
  priority: OperationalAlertPriority;
  description: string;
  vehicleRegistration: string;
  vehicleDescription: string;
  personName: string;
  personDescription: string;
  personReference: string;
  locationLabel: string;
  locationLat: string;
  locationLng: string;
  locationRadiusMeters: string;
  targetScope: OperationalAlertTargetScope;
  targetShiftId: string;
  sourceType: OperationalAlertSourceType;
  sourceAuthority: string;
  sourceReference: string;
  expiresAt: string;
}

function defaultForm(): AlertFormState {
  return {
    alertType: 'general',
    priority: 'medium',
    description: '',
    vehicleRegistration: '',
    vehicleDescription: '',
    personName: '',
    personDescription: '',
    personReference: '',
    locationLabel: '',
    locationLat: '',
    locationLng: '',
    locationRadiusMeters: '',
    targetScope: 'all_officers',
    targetShiftId: '',
    sourceType: 'internal',
    sourceAuthority: '',
    sourceReference: '',
    expiresAt: ''
  };
}

interface EditFormState {
  priority: OperationalAlertPriority;
  description: string;
  targetScope: OperationalAlertTargetScope;
  targetShiftId: string;
  officerIds: number[];
  sourceType: OperationalAlertSourceType;
  sourceAuthority: string;
  sourceReference: string;
  /** datetime-local input value ('' means no expiry / indefinite). */
  expiresAt: string;
  materialChangeOverride: boolean;
}

function defaultEditForm(): EditFormState {
  return {
    priority: 'medium',
    description: '',
    targetScope: 'all_officers',
    targetShiftId: '',
    officerIds: [],
    sourceType: 'internal',
    sourceAuthority: '',
    sourceReference: '',
    expiresAt: '',
    materialChangeOverride: false
  };
}

/** ISO timestamp -> the local 'YYYY-MM-DDTHH:mm' shape <input type="datetime-local"> expects. */
function toDateTimeLocalValue(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Parses the edit form's datetime-local expiry field. An empty field means
 * "no expiry" (indefinite) — a valid, deliberate value, not an error. A
 * native <input type="datetime-local"> sanitizes any syntactically invalid
 * text to '' before it ever reaches onChange (per the HTML value
 * sanitization algorithm — verified against jsdom, which matches real
 * browsers here), so this guard is defense-in-depth for any value that
 * reaches this function some other way, rather than something a Supervisor
 * can trigger by typing into the picker.
 *
 * This performs no materiality/versioning judgement — it only decides
 * whether the text is a usable date at all. Whether an accepted change is
 * *material* (see isExpiryChangeMaterial in routes/supervisor/alerts.ts) is
 * decided entirely server-side.
 */
export function parseExpiresAtInput(value: string): { ok: true; iso: string | null } | { ok: false; error: string } {
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, iso: null };
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, error: 'Enter a valid expiry date and time' };
  }
  return { ok: true, iso: parsed.toISOString() };
}

/**
 * Whether the Supervisor actually changed the expiry, at the minute
 * precision a datetime-local input can represent — used only to decide
 * whether to include expiresAt in the PATCH payload at all (so leaving the
 * field untouched never sends a spurious sub-minute rounding "change").
 * This is dirty-checking, not materiality: whether an included expiry
 * change is *material* (see isExpiryChangeMaterial in
 * routes/supervisor/alerts.ts) is decided entirely server-side.
 */
function expiryChangedAtMinutePrecision(previousIso: string | null, nextIso: string | null): boolean {
  if (previousIso === null && nextIso === null) return false;
  if (previousIso === null || nextIso === null) return true;
  const previousMs = new Date(previousIso).getTime();
  const nextMs = new Date(nextIso).getTime();
  if (Number.isNaN(previousMs) || Number.isNaN(nextMs)) return true;
  return Math.floor(previousMs / 60_000) !== Math.floor(nextMs / 60_000);
}

function editFormFromAlert(alert: OperationalAlert): EditFormState {
  return {
    priority: alert.priority,
    description: alert.description,
    targetScope: alert.targetScope,
    targetShiftId: alert.targetShiftId ?? '',
    officerIds: alert.assignedOfficerIds,
    sourceType: alert.sourceType,
    sourceAuthority: alert.sourceAuthority ?? '',
    sourceReference: alert.sourceReference ?? '',
    expiresAt: toDateTimeLocalValue(alert.expiresAt),
    materialChangeOverride: false
  };
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function statusStyles(status: OperationalAlertStatus): string {
  if (status === 'active') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'resolved') return 'border-sky-200 bg-sky-50 text-sky-700';
  if (status === 'expired') return 'border-slate-200 bg-slate-50 text-slate-600';
  return 'border-rose-200 bg-rose-50 text-rose-700';
}

/**
 * Display-only: an alert whose expires_at has passed but whose stored status is
 * still 'active' is shown as expired. This never mutates the DB — there is no
 * background-job pattern in this codebase to auto-transition status, so the row
 * stays 'active' until a supervisor explicitly resolves/cancels it (or a future
 * scheduled job is added).
 */
function effectiveStatus(alert: OperationalAlert): OperationalAlertStatus {
  if (alert.status === 'active' && alert.expiresAt) {
    const expiresAtMs = new Date(alert.expiresAt).getTime();
    if (!Number.isNaN(expiresAtMs) && expiresAtMs <= Date.now()) {
      return 'expired';
    }
  }
  return alert.status;
}

function alertTypeLabel(alertType: OperationalAlertType): string {
  return ALERT_TYPES.find((item) => item.value === alertType)?.label ?? alertType;
}

function sameIdSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((id) => setA.has(id));
}

// Operational default, not a legal retention period — an alert that has
// stayed 'active' this long without being resolved/cancelled is flagged for
// Supervisor review. Display-only, same pattern as effectiveStatus above:
// never mutates the DB, and staleness never implies (or becomes) 'resolved'.
const STALE_ACTIVE_HOURS = 168; // 7 days

function isStaleReviewRequired(alert: OperationalAlert): boolean {
  if (alert.status !== 'active') return false;
  const createdAtMs = new Date(alert.createdAt).getTime();
  if (Number.isNaN(createdAtMs)) return false;
  return Date.now() - createdAtMs >= STALE_ACTIVE_HOURS * 60 * 60 * 1000;
}

export function SupervisorAlerts() {
  const [alerts, setAlerts] = useState<OperationalAlert[]>([]);
  const [officers, setOfficers] = useState<FieldOfficer[]>([]);
  const [shifts, setShifts] = useState<RoadblockShift[]>([]);
  const [selectedOfficerIds, setSelectedOfficerIds] = useState<number[]>([]);
  const [form, setForm] = useState<AlertFormState>(() => defaultForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [expandedMatchesId, setExpandedMatchesId] = useState<string | null>(null);
  const [matchesByAlert, setMatchesByAlert] = useState<Record<string, OperationalAlertMatch[]>>({});
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [expandedAckId, setExpandedAckId] = useState<string | null>(null);
  const [acksByAlert, setAcksByAlert] = useState<Record<string, OperationalAlertAcknowledgement[]>>({});
  const [acksLoading, setAcksLoading] = useState(false);

  const [expandedCoverageId, setExpandedCoverageId] = useState<string | null>(null);
  const [coverageByAlert, setCoverageByAlert] = useState<Record<string, OperationalAlertCoverage>>({});
  const [coverageLoading, setCoverageLoading] = useState(false);

  // Reason prompt shown inline in place of the Resolve/Cancel buttons — the
  // backend requires a reason for both transitions (see PATCH /:id).
  const [pendingStatusChange, setPendingStatusChange] = useState<{ alertId: string; status: 'resolved' | 'cancelled' } | null>(null);
  const [reasonDraft, setReasonDraft] = useState('');
  const [reasonSaving, setReasonSaving] = useState(false);

  // Minimal Phase A1 edit UI (priority/description/target/source +
  // material-change checkbox) — completes the A1 user-facing flow; not a
  // new Phase A2 business rule.
  const [editingAlertId, setEditingAlertId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>(() => defaultEditForm());
  const [editSaving, setEditSaving] = useState(false);

  const [view, setView] = useState<AlertsView>('alerts');
  const [sightings, setSightings] = useState<AlertSighting[]>([]);
  const [sightingsLoaded, setSightingsLoaded] = useState(false);
  const [sightingsLoading, setSightingsLoading] = useState(false);
  const [sightingsError, setSightingsError] = useState<string | null>(null);
  const [sightingFilters, setSightingFilters] = useState<AlertSightingFilters>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [alertData, officerData, shiftData] = await Promise.all([
        getOperationalAlerts(),
        getFieldOfficers(),
        getRoadblockShifts()
      ]);
      setAlerts(alertData);
      setOfficers(officerData);
      setShifts(shiftData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load operational alerts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Critical non-acknowledgement awareness must be visible without an extra
  // click (it's a life-safety signal), so coverage is fetched eagerly for
  // active Critical alerts only — every other alert's coverage stays lazy,
  // loaded on demand via toggleCoverage, same pattern as acknowledgements/matches.
  useEffect(() => {
    const idsNeedingCoverage = alerts
      .filter((alert) => alert.priority === 'critical' && alert.status === 'active')
      .map((alert) => alert.id)
      .filter((id) => !(id in coverageByAlert));
    if (idsNeedingCoverage.length === 0) return;

    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        idsNeedingCoverage.map(async (id) => {
          try {
            return [id, await getOperationalAlertCoverage(id)] as const;
          } catch {
            return null;
          }
        })
      );
      if (cancelled) return;
      setCoverageByAlert((prev) => {
        const next = { ...prev };
        for (const entry of entries) {
          if (entry) next[entry[0]] = entry[1];
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [alerts, coverageByAlert]);

  const loadSightings = useCallback(async () => {
    setSightingsLoading(true);
    try {
      const data = await getAlertSightings();
      setSightings(data);
      setSightingsError(null);
      setSightingsLoaded(true);
    } catch (err) {
      setSightingsError(err instanceof Error ? err.message : 'Failed to load reported sightings');
    } finally {
      setSightingsLoading(false);
    }
  }, []);

  // Sightings are fetched lazily on first visit to Map/Heatmap rather than
  // eagerly on mount — the Alert Board is the primary view and most sessions
  // never open Map/Heatmap, so this avoids an unnecessary request.
  useEffect(() => {
    if ((view === 'map' || view === 'heatmap') && !sightingsLoaded && !sightingsLoading) {
      void loadSightings();
    }
  }, [view, sightingsLoaded, sightingsLoading, loadSightings]);

  const filteredSightings = useMemo(
    () => filterSightings(sightings, sightingFilters),
    [sightings, sightingFilters]
  );

  const updateSightingFilter = <K extends keyof AlertSightingFilters>(key: K, value: AlertSightingFilters[K]) => {
    setSightingFilters((prev) => ({ ...prev, [key]: value || undefined }));
  };

  // BOLO alerts for a person or vehicle must always originate externally.
  useEffect(() => {
    if (BOLO_TYPES.has(form.alertType) && form.sourceType !== 'external') {
      setForm((prev) => ({ ...prev, sourceType: 'external' }));
    }
  }, [form.alertType, form.sourceType]);

  const officerById = useMemo(() => {
    const map = new Map<number, FieldOfficer>();
    for (const officer of officers) map.set(officer.officerId, officer);
    return map;
  }, [officers]);

  const activeCount = useMemo(() => alerts.filter((alert) => alert.status === 'active').length, [alerts]);
  const isBolo = BOLO_TYPES.has(form.alertType);

  const toggleOfficer = (officerId: number) => {
    setSelectedOfficerIds((prev) =>
      prev.includes(officerId) ? prev.filter((id) => id !== officerId) : [...prev, officerId]
    );
  };

  const updateForm = <K extends keyof AlertFormState>(key: K, value: AlertFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCreate = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const lat = form.locationLat.trim() ? Number(form.locationLat) : undefined;
      const lng = form.locationLng.trim() ? Number(form.locationLng) : undefined;
      const radiusMeters = form.locationRadiusMeters.trim() ? Number(form.locationRadiusMeters) : undefined;

      if (lat !== undefined && !Number.isFinite(lat)) {
        setError('Trigger latitude must be a number between -90 and 90');
        setSaving(false);
        return;
      }
      if (lng !== undefined && !Number.isFinite(lng)) {
        setError('Trigger longitude must be a number between -180 and 180');
        setSaving(false);
        return;
      }
      if (radiusMeters !== undefined && !Number.isFinite(radiusMeters)) {
        setError('Trigger radius must be a positive number of meters');
        setSaving(false);
        return;
      }

      const hasLocation = form.locationLabel.trim() || lat !== undefined || lng !== undefined || radiusMeters !== undefined;

      const payload: CreateOperationalAlertPayload = {
        alertType: form.alertType,
        priority: form.priority,
        description: form.description.trim(),
        vehicleRegistration: form.vehicleRegistration.trim() || undefined,
        vehicleDescription: form.vehicleDescription.trim() || undefined,
        personName: form.personName.trim() || undefined,
        personDescription: form.personDescription.trim() || undefined,
        personReference: form.personReference.trim() || undefined,
        location: hasLocation
          ? {
              label: form.locationLabel.trim() || undefined,
              lat,
              lng,
              radiusMeters
            }
          : undefined,
        targetScope: form.targetScope,
        targetShiftId: form.targetScope === 'shift' ? form.targetShiftId || null : null,
        officerIds: form.targetScope === 'officers' ? selectedOfficerIds : undefined,
        sourceType: form.sourceType,
        sourceAuthority: form.sourceType === 'external' ? form.sourceAuthority.trim() || undefined : undefined,
        sourceReference: form.sourceType === 'external' ? form.sourceReference.trim() || undefined : undefined,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null
      };

      const created = await createOperationalAlert(payload);
      setAlerts((prev) => [created, ...prev]);
      setForm(defaultForm());
      setSelectedOfficerIds([]);
      setSuccess(`Issued alert: ${created.description}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create operational alert');
    } finally {
      setSaving(false);
    }
  };

  // Resolved = the operational condition ended/completed. Cancelled = the
  // alert was withdrawn, issued in error, or is no longer applicable. The
  // backend requires a reason for both, so clicking either button opens an
  // inline reason prompt in place of the buttons rather than firing immediately.
  const startStatusChange = (alertId: string, status: 'resolved' | 'cancelled') => {
    setPendingStatusChange({ alertId, status });
    setReasonDraft('');
    setError(null);
    setSuccess(null);
  };

  const cancelStatusChange = () => {
    setPendingStatusChange(null);
    setReasonDraft('');
  };

  const confirmStatusChange = async () => {
    if (!pendingStatusChange) return;
    const reason = reasonDraft.trim();
    if (!reason) {
      setError('A reason is required to resolve or cancel an alert');
      return;
    }
    setReasonSaving(true);
    setError(null);
    try {
      const updated = await updateOperationalAlert(pendingStatusChange.alertId, { status: pendingStatusChange.status, reason });
      setAlerts((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      setSuccess(`Alert marked ${pendingStatusChange.status}`);
      setPendingStatusChange(null);
      setReasonDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update operational alert');
    } finally {
      setReasonSaving(false);
    }
  };

  const toggleCoverage = async (alertId: string) => {
    if (expandedCoverageId === alertId) {
      setExpandedCoverageId(null);
      return;
    }
    setExpandedCoverageId(alertId);
    if (!coverageByAlert[alertId]) {
      setCoverageLoading(true);
      try {
        const coverage = await getOperationalAlertCoverage(alertId);
        setCoverageByAlert((prev) => ({ ...prev, [alertId]: coverage }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load acknowledgement coverage');
      } finally {
        setCoverageLoading(false);
      }
    }
  };

  // ---- Minimal Phase A1 edit UI (priority/description/target/source) ----
  const startEdit = (alert: OperationalAlert) => {
    setEditingAlertId(alert.id);
    setEditForm(editFormFromAlert(alert));
    setError(null);
    setSuccess(null);
  };

  const cancelEdit = () => setEditingAlertId(null);

  const updateEditForm = <K extends keyof EditFormState>(key: K, value: EditFormState[K]) => {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleEditOfficer = (officerId: number) => {
    setEditForm((prev) => ({
      ...prev,
      officerIds: prev.officerIds.includes(officerId)
        ? prev.officerIds.filter((id) => id !== officerId)
        : [...prev.officerIds, officerId]
    }));
  };

  const saveEdit = async (alert: OperationalAlert) => {
    setEditSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: UpdateOperationalAlertPayload = {};
      const trimmedDescription = editForm.description.trim();

      if (editForm.priority !== alert.priority) payload.priority = editForm.priority;
      if (trimmedDescription !== alert.description) payload.description = trimmedDescription;

      const targetChanged =
        editForm.targetScope !== alert.targetScope ||
        (editForm.targetScope === 'shift' && editForm.targetShiftId !== (alert.targetShiftId ?? '')) ||
        (editForm.targetScope === 'officers' && !sameIdSet(editForm.officerIds, alert.assignedOfficerIds));
      if (targetChanged) {
        payload.targetScope = editForm.targetScope;
        if (editForm.targetScope === 'shift') payload.targetShiftId = editForm.targetShiftId || null;
        if (editForm.targetScope === 'officers') payload.officerIds = editForm.officerIds;
      }

      const sourceChanged =
        editForm.sourceType !== alert.sourceType ||
        editForm.sourceAuthority.trim() !== (alert.sourceAuthority ?? '') ||
        editForm.sourceReference.trim() !== (alert.sourceReference ?? '');
      if (sourceChanged) {
        payload.sourceType = editForm.sourceType;
        payload.sourceAuthority = editForm.sourceType === 'external' ? editForm.sourceAuthority.trim() : undefined;
        payload.sourceReference = editForm.sourceType === 'external' ? editForm.sourceReference.trim() : undefined;
      }

      // Whether extending, shortening, correcting, or clearing the expiry is
      // *material* (requiring re-acknowledgement) is decided entirely by the
      // backend (see isExpiryChangeMaterial) — this only decides whether the
      // field is dirty enough to send at all.
      const expiryResult = parseExpiresAtInput(editForm.expiresAt);
      if (expiryResult.ok === false) {
        setError(expiryResult.error);
        setEditSaving(false);
        return;
      }
      if (expiryResult.iso === null) {
        if (alert.expiresAt !== null) payload.expiresAt = null;
      } else if (expiryChangedAtMinutePrecision(alert.expiresAt, expiryResult.iso)) {
        payload.expiresAt = expiryResult.iso;
      }

      if (payload.description !== undefined && editForm.materialChangeOverride) {
        payload.materialChangeOverride = true;
      }

      if (Object.keys(payload).length === 0) {
        setEditingAlertId(null);
        return;
      }

      const updated = await updateOperationalAlert(alert.id, payload);
      setAlerts((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      // Coverage is version-scoped — a material edit may have bumped the
      // alert's version, so a stale cached coverage result must not linger.
      setCoverageByAlert((prev) => {
        if (!(alert.id in prev)) return prev;
        const next = { ...prev };
        delete next[alert.id];
        return next;
      });
      setSuccess('Alert updated');
      setEditingAlertId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update operational alert');
    } finally {
      setEditSaving(false);
    }
  };

  const toggleMatches = async (alertId: string) => {
    if (expandedMatchesId === alertId) {
      setExpandedMatchesId(null);
      return;
    }
    setExpandedMatchesId(alertId);
    if (!matchesByAlert[alertId]) {
      setMatchesLoading(true);
      try {
        const matches = await getOperationalAlertMatches(alertId);
        setMatchesByAlert((prev) => ({ ...prev, [alertId]: matches }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load possible match reports');
      } finally {
        setMatchesLoading(false);
      }
    }
  };

  const toggleAcknowledgements = async (alertId: string) => {
    if (expandedAckId === alertId) {
      setExpandedAckId(null);
      return;
    }
    setExpandedAckId(alertId);
    if (!acksByAlert[alertId]) {
      setAcksLoading(true);
      try {
        const acks = await getOperationalAlertAcknowledgements(alertId);
        setAcksByAlert((prev) => ({ ...prev, [alertId]: acks }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load acknowledgements');
      } finally {
        setAcksLoading(false);
      }
    }
  };

  return (
    <div className={pageShell} style={{ backgroundColor: PAGE_BG }}>
      <header className="flex flex-wrap items-start justify-between gap-3 px-6 pb-3 pt-5">
        <div>
          <h1 className="text-lg font-bold leading-tight" style={{ color: NAVY }}>
            Operational Alerts
          </h1>
          <p className="mt-0.5 text-[0.75rem] text-slate-500">
            Issue BOLO, hazard, and general operational bulletins to officers.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex h-[34px] items-center gap-2 rounded-lg border bg-white px-3.5 text-[0.75rem] font-bold text-slate-700 transition hover:bg-slate-50"
          style={{ borderColor: BORDER }}
        >
          <RefreshCw size={14} strokeWidth={2} />
          Refresh
        </button>
      </header>

      <div className={`${pageContent} flex flex-col gap-4`}>
        {error && (
          <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-[0.75rem] text-rose-700">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-[0.75rem] text-emerald-700">
            {success}
          </div>
        )}

        <div className="inline-flex w-fit rounded-lg border bg-white p-1" style={{ borderColor: BORDER }}>
          {(
            [
              { key: 'alerts' as const, label: 'Alerts', icon: Megaphone },
              { key: 'map' as const, label: 'Map', icon: MapPin },
              { key: 'heatmap' as const, label: 'Heatmap', icon: Flame }
            ]
          ).map((tab) => {
            const Icon = tab.icon;
            const active = view === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setView(tab.key)}
                className={`inline-flex h-[30px] items-center gap-1.5 rounded-md px-3 text-[0.75rem] font-bold transition ${
                  active ? 'text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
                style={active ? { backgroundColor: NAVY } : undefined}
              >
                <Icon size={13} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {view === 'alerts' && (
        <>
        <section className="rounded-xl border bg-white p-4" style={{ borderColor: BORDER }}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[0.875rem] font-bold" style={{ color: NAVY }}>
                New Operational Alert
              </h2>
              <p className="mt-0.5 text-[0.6875rem] text-slate-500">
                BOLO alerts for a person or vehicle must come from a verified external authority.
              </p>
            </div>
            <span className="rounded-full border border-sky-100 bg-sky-50 px-2.5 py-1 text-[0.6875rem] font-bold text-sky-700">
              {activeCount} active
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className="text-[0.6875rem] font-semibold text-slate-600">Alert type</span>
              <select
                value={form.alertType}
                onChange={(e) => updateForm('alertType', e.target.value as OperationalAlertType)}
                className={inputClassName}
                style={{ borderColor: BORDER }}
              >
                {ALERT_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[0.6875rem] font-semibold text-slate-600">Priority</span>
              <select
                value={form.priority}
                onChange={(e) => updateForm('priority', e.target.value as OperationalAlertPriority)}
                className={inputClassName}
                style={{ borderColor: BORDER }}
              >
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>{priority}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="text-[0.6875rem] font-semibold text-slate-600">Description</span>
              <input
                value={form.description}
                onChange={(e) => updateForm('description', e.target.value)}
                placeholder="Be advised: flooding on N1 southbound"
                className={inputClassName}
                style={{ borderColor: BORDER }}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[0.6875rem] font-semibold text-slate-600">Vehicle registration</span>
              <input
                value={form.vehicleRegistration}
                onChange={(e) => updateForm('vehicleRegistration', e.target.value)}
                className={inputClassName}
                style={{ borderColor: BORDER }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[0.6875rem] font-semibold text-slate-600">Vehicle description</span>
              <input
                value={form.vehicleDescription}
                onChange={(e) => updateForm('vehicleDescription', e.target.value)}
                className={inputClassName}
                style={{ borderColor: BORDER }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[0.6875rem] font-semibold text-slate-600">Person name</span>
              <input
                value={form.personName}
                onChange={(e) => updateForm('personName', e.target.value)}
                className={inputClassName}
                style={{ borderColor: BORDER }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[0.6875rem] font-semibold text-slate-600">Person description</span>
              <input
                value={form.personDescription}
                onChange={(e) => updateForm('personDescription', e.target.value)}
                className={inputClassName}
                style={{ borderColor: BORDER }}
              />
            </label>
            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="text-[0.6875rem] font-semibold text-slate-600">
                Person reference <span className="font-normal text-slate-400">(partial plate, alias, case ref — not an ID number)</span>
              </span>
              <input
                value={form.personReference}
                onChange={(e) => updateForm('personReference', e.target.value)}
                className={inputClassName}
                style={{ borderColor: BORDER }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[0.6875rem] font-semibold text-slate-600">Location</span>
              <input
                value={form.locationLabel}
                onChange={(e) => updateForm('locationLabel', e.target.value)}
                placeholder="N1 Midrand offramp"
                className={inputClassName}
                style={{ borderColor: BORDER }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[0.6875rem] font-semibold text-slate-600">
                Trigger latitude <span className="font-normal text-slate-400">(optional)</span>
              </span>
              <input
                value={form.locationLat}
                onChange={(e) => updateForm('locationLat', e.target.value)}
                placeholder="-26.2041"
                inputMode="decimal"
                className={inputClassName}
                style={{ borderColor: BORDER }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[0.6875rem] font-semibold text-slate-600">
                Trigger longitude <span className="font-normal text-slate-400">(optional)</span>
              </span>
              <input
                value={form.locationLng}
                onChange={(e) => updateForm('locationLng', e.target.value)}
                placeholder="28.0473"
                inputMode="decimal"
                className={inputClassName}
                style={{ borderColor: BORDER }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[0.6875rem] font-semibold text-slate-600">
                Trigger radius (m) <span className="font-normal text-slate-400">(optional, notifies nearby officers)</span>
              </span>
              <input
                value={form.locationRadiusMeters}
                onChange={(e) => updateForm('locationRadiusMeters', e.target.value)}
                placeholder="500"
                inputMode="numeric"
                className={inputClassName}
                style={{ borderColor: BORDER }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[0.6875rem] font-semibold text-slate-600">Expires</span>
              <input
                type="datetime-local"
                value={form.expiresAt}
                onChange={(e) => updateForm('expiresAt', e.target.value)}
                className={inputClassName}
                style={{ borderColor: BORDER }}
              />
            </label>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className="text-[0.6875rem] font-semibold text-slate-600">Target</span>
              <select
                value={form.targetScope}
                onChange={(e) => updateForm('targetScope', e.target.value as OperationalAlertTargetScope)}
                className={inputClassName}
                style={{ borderColor: BORDER }}
              >
                <option value="all_officers">All officers</option>
                <option value="shift">A roadblock shift</option>
                <option value="officers">Selected officers</option>
              </select>
            </label>
            {form.targetScope === 'shift' && (
              <label className="flex flex-col gap-1">
                <span className="text-[0.6875rem] font-semibold text-slate-600">Shift</span>
                <select
                  value={form.targetShiftId}
                  onChange={(e) => updateForm('targetShiftId', e.target.value)}
                  className={inputClassName}
                  style={{ borderColor: BORDER }}
                >
                  <option value="">Select a shift…</option>
                  {shifts.map((shift) => (
                    <option key={shift.id} value={shift.id}>{shift.roadblockName} — {shift.station}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1">
              <span className="text-[0.6875rem] font-semibold text-slate-600">
                Source {isBolo && <span className="font-normal text-amber-600">(locked to external for BOLO)</span>}
              </span>
              <select
                value={form.sourceType}
                onChange={(e) => updateForm('sourceType', e.target.value as OperationalAlertSourceType)}
                disabled={isBolo}
                className={inputClassName}
                style={{ borderColor: BORDER }}
              >
                <option value="internal">Internal</option>
                <option value="external">External</option>
              </select>
            </label>
            {form.sourceType === 'external' && (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-[0.6875rem] font-semibold text-slate-600">Source authority</span>
                  <input
                    value={form.sourceAuthority}
                    onChange={(e) => updateForm('sourceAuthority', e.target.value)}
                    placeholder="SAPS Klerksdorp"
                    className={inputClassName}
                    style={{ borderColor: BORDER }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[0.6875rem] font-semibold text-slate-600">Source reference</span>
                  <input
                    value={form.sourceReference}
                    onChange={(e) => updateForm('sourceReference', e.target.value)}
                    placeholder="CAS 123/09/2026"
                    className={inputClassName}
                    style={{ borderColor: BORDER }}
                  />
                </label>
              </>
            )}
          </div>

          {form.targetScope === 'officers' && (
            <div className="mt-4">
              <p className="mb-2 text-[0.6875rem] font-semibold text-slate-600">Selected officers</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {officers.map((officer) => {
                  const selected = selectedOfficerIds.includes(officer.officerId);
                  return (
                    <button
                      type="button"
                      key={officer.officerId}
                      onClick={() => toggleOfficer(officer.officerId)}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left transition ${selected ? 'border-[#0D2137]/30 bg-[#0D2137]/5' : 'bg-white hover:bg-slate-50'}`}
                      style={{ borderColor: selected ? undefined : BORDER }}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[0.75rem] font-bold text-slate-800">{officer.name}</span>
                        <span className="block truncate text-[0.625rem] text-slate-500">{officer.serviceNumber} - {officer.station}</span>
                      </span>
                    </button>
                  );
                })}
                {officers.length === 0 && (
                  <p className="rounded-lg border border-dashed px-3 py-5 text-center text-[0.75rem] text-slate-500" style={{ borderColor: BORDER }}>
                    No field officers are available yet.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={saving || !form.description.trim()}
              className="inline-flex h-[36px] items-center gap-2 rounded-lg px-4 text-[0.75rem] font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ backgroundColor: NAVY }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Megaphone size={14} />}
              Issue Alert
            </button>
          </div>
        </section>

        <section className="rounded-xl border bg-white" style={{ borderColor: BORDER }}>
          <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: BORDER }}>
            <h2 className="text-[0.875rem] font-bold" style={{ color: NAVY }}>
              Alert Board
            </h2>
            {loading && <Loader2 size={15} className="animate-spin text-slate-400" />}
          </div>
          <div className="divide-y" style={{ borderColor: BORDER }}>
            {!loading && alerts.length === 0 && (
              <p className="px-4 py-8 text-center text-[0.75rem] text-slate-500">No operational alerts issued yet.</p>
            )}
            {alerts.map((alert) => {
              const assigned = alert.assignedOfficerIds
                .map((id) => officerById.get(id)?.name ?? `Officer #${id}`)
                .join(', ');
              const matches = matchesByAlert[alert.id] ?? [];
              const matchesOpen = expandedMatchesId === alert.id;
              const acks = acksByAlert[alert.id] ?? [];
              const acksOpen = expandedAckId === alert.id;
              const displayStatus = effectiveStatus(alert);
              const stale = isStaleReviewRequired(alert);
              const coverage = coverageByAlert[alert.id];
              const coverageOpen = expandedCoverageId === alert.id;
              const isChangingStatus = pendingStatusChange?.alertId === alert.id;
              const isEditing = editingAlertId === alert.id;

              return (
                <article key={alert.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[0.8125rem] font-bold text-slate-900">{alertTypeLabel(alert.alertType)}</h3>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusStyles(displayStatus)}`}>
                          {displayStatus}
                        </span>
                        {stale && (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                            Review required — active {STALE_ACTIVE_HOURS / 24}+ days
                          </span>
                        )}
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                          {alert.priority}
                        </span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${alert.sourceType === 'external' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                          {alert.sourceType === 'external'
                            ? `External — ${alert.sourceAuthority ?? 'unknown'} (Ref: ${alert.sourceReference ?? 'n/a'})`
                            : 'Internal'}
                        </span>
                      </div>
                      <p className="mt-1 text-[0.8125rem] text-slate-700">{alert.description}</p>
                      {alert.vehicleRegistration && (
                        <p className="mt-1 text-[0.75rem] text-slate-600">Vehicle: {alert.vehicleRegistration} - {alert.vehicleDescription ?? 'no description'}</p>
                      )}
                      {alert.personName && (
                        <p className="mt-1 text-[0.75rem] text-slate-600">Person: {alert.personName} - {alert.personDescription ?? 'no description'}</p>
                      )}
                      {alert.personReference && (
                        <p className="mt-1 text-[0.6875rem] text-slate-500">Reference: {alert.personReference}</p>
                      )}
                      <p className="mt-1 text-[0.6875rem] text-slate-500">
                        Target: {alert.targetScope === 'all_officers' ? 'All officers' : alert.targetScope === 'shift' ? 'Roadblock shift' : `Officers (${assigned || 'none'})`}
                      </p>
                      <p className="mt-1 text-[0.6875rem] text-slate-500">
                        Acknowledged by {alert.acknowledgementCount} · {alert.matchCount} possible match report{alert.matchCount === 1 ? '' : 's'}
                      </p>
                      <p className="mt-1 text-[0.6875rem] text-slate-400">
                        Issued by {alert.issuedByName} · {formatDateTime(alert.createdAt)}
                        {alert.expiresAt && ` · Expires ${formatDateTime(alert.expiresAt)}`}
                      </p>
                      {alert.statusReason && (
                        <p className="mt-1 text-[0.6875rem] text-slate-500">
                          {alert.status === 'resolved' ? 'Resolved' : 'Cancelled'} — {alert.statusReason}
                          {alert.statusReasonBy && ` (${alert.statusReasonBy})`}
                        </p>
                      )}
                      {coverage?.criticalNonAckWarning && (
                        <p className="mt-2 flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[0.6875rem] font-semibold text-rose-700">
                          <ShieldAlert size={13} />
                          Critical alert: {coverage.outstandingCount} officer{coverage.outstandingCount === 1 ? '' : 's'} still unacknowledged
                          past {coverage.criticalNonAckThresholdMinutes} min — awareness only, no automatic action taken.
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {alert.status === 'active' && !isChangingStatus && (
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => startEdit(alert)}
                            className="inline-flex h-[28px] items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[0.6875rem] font-bold text-slate-700 transition hover:bg-slate-50"
                          >
                            <Pencil size={12} />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => startStatusChange(alert.id, 'resolved')}
                            className="inline-flex h-[28px] items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-[0.6875rem] font-bold text-emerald-700 transition hover:bg-emerald-100"
                          >
                            Resolve
                          </button>
                          <button
                            type="button"
                            onClick={() => startStatusChange(alert.id, 'cancelled')}
                            className="inline-flex h-[28px] items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 text-[0.6875rem] font-bold text-slate-700 transition hover:bg-slate-100"
                          >
                            <XCircle size={12} />
                            Cancel
                          </button>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => void toggleCoverage(alert.id)}
                        className="inline-flex h-[26px] items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 text-[0.6875rem] font-bold text-indigo-700 transition hover:bg-indigo-100"
                      >
                        <Users size={12} />
                        {coverage
                          ? `${coverage.acknowledgedCount}/${coverage.totalTargeted} acknowledged (${coverage.percentage}%)`
                          : coverageOpen && coverageLoading
                            ? 'Loading coverage…'
                            : 'View coverage'}
                      </button>
                      {alert.acknowledgementCount > 0 && (
                        <button
                          type="button"
                          onClick={() => void toggleAcknowledgements(alert.id)}
                          className="inline-flex h-[26px] items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 text-[0.6875rem] font-bold text-sky-700 transition hover:bg-sky-100"
                        >
                          <CheckCircle2 size={12} />
                          {acksOpen ? 'Hide acknowledgements' : 'View acknowledgements'}
                        </button>
                      )}
                      {alert.matchCount > 0 && (
                        <button
                          type="button"
                          onClick={() => void toggleMatches(alert.id)}
                          className="inline-flex h-[26px] items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 text-[0.6875rem] font-bold text-amber-700 transition hover:bg-amber-100"
                        >
                          <AlertTriangle size={12} />
                          {matchesOpen ? 'Hide reports' : 'View reports'}
                        </button>
                      )}
                    </div>
                  </div>

                  {isChangingStatus && (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="mb-2 text-[0.6875rem] font-semibold text-slate-600">
                        Reason for marking this alert {pendingStatusChange?.status} <span className="font-normal text-slate-400">(required)</span>
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          value={reasonDraft}
                          onChange={(e) => setReasonDraft(e.target.value)}
                          placeholder={pendingStatusChange?.status === 'resolved' ? 'e.g. Flooding has subsided, road reopened' : 'e.g. Issued in error — wrong vehicle registration'}
                          className={`${inputClassName} flex-1 min-w-[220px]`}
                          style={{ borderColor: BORDER }}
                        />
                        <button
                          type="button"
                          onClick={() => void confirmStatusChange()}
                          disabled={reasonSaving || !reasonDraft.trim()}
                          className="inline-flex h-[32px] items-center gap-1 rounded-md px-3 text-[0.6875rem] font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                          style={{ backgroundColor: NAVY }}
                        >
                          {reasonSaving ? <Loader2 size={12} className="animate-spin" /> : 'Confirm'}
                        </button>
                        <button
                          type="button"
                          onClick={cancelStatusChange}
                          className="inline-flex h-[32px] items-center rounded-md border bg-white px-3 text-[0.6875rem] font-bold text-slate-600 transition hover:bg-slate-50"
                          style={{ borderColor: BORDER }}
                        >
                          Back
                        </button>
                      </div>
                    </div>
                  )}

                  {isEditing && (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="mb-2 text-[0.6875rem] font-semibold text-slate-600">Edit alert</p>
                      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                        <label className="flex flex-col gap-1">
                          <span className="text-[0.6875rem] font-semibold text-slate-600">Priority</span>
                          <select
                            value={editForm.priority}
                            onChange={(e) => updateEditForm('priority', e.target.value as OperationalAlertPriority)}
                            className={inputClassName}
                            style={{ borderColor: BORDER }}
                          >
                            {PRIORITIES.map((priority) => (
                              <option key={priority} value={priority}>{priority}</option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-[0.6875rem] font-semibold text-slate-600">Target</span>
                          <select
                            value={editForm.targetScope}
                            onChange={(e) => updateEditForm('targetScope', e.target.value as OperationalAlertTargetScope)}
                            className={inputClassName}
                            style={{ borderColor: BORDER }}
                          >
                            <option value="all_officers">All officers</option>
                            <option value="shift">A roadblock shift</option>
                            <option value="officers">Selected officers</option>
                          </select>
                        </label>
                        {editForm.targetScope === 'shift' && (
                          <label className="flex flex-col gap-1">
                            <span className="text-[0.6875rem] font-semibold text-slate-600">Shift</span>
                            <select
                              value={editForm.targetShiftId}
                              onChange={(e) => updateEditForm('targetShiftId', e.target.value)}
                              className={inputClassName}
                              style={{ borderColor: BORDER }}
                            >
                              <option value="">Select a shift…</option>
                              {shifts.map((shift) => (
                                <option key={shift.id} value={shift.id}>{shift.roadblockName} — {shift.station}</option>
                              ))}
                            </select>
                          </label>
                        )}
                        <label className="flex flex-col gap-1">
                          <span className="text-[0.6875rem] font-semibold text-slate-600">
                            Source {BOLO_TYPES.has(alert.alertType) && <span className="font-normal text-amber-600">(locked to external for BOLO)</span>}
                          </span>
                          <select
                            value={editForm.sourceType}
                            onChange={(e) => updateEditForm('sourceType', e.target.value as OperationalAlertSourceType)}
                            disabled={BOLO_TYPES.has(alert.alertType)}
                            className={inputClassName}
                            style={{ borderColor: BORDER }}
                          >
                            <option value="internal">Internal</option>
                            <option value="external">External</option>
                          </select>
                        </label>
                        {editForm.sourceType === 'external' && (
                          <>
                            <label className="flex flex-col gap-1">
                              <span className="text-[0.6875rem] font-semibold text-slate-600">Source authority</span>
                              <input
                                value={editForm.sourceAuthority}
                                onChange={(e) => updateEditForm('sourceAuthority', e.target.value)}
                                className={inputClassName}
                                style={{ borderColor: BORDER }}
                              />
                            </label>
                            <label className="flex flex-col gap-1">
                              <span className="text-[0.6875rem] font-semibold text-slate-600">Source reference</span>
                              <input
                                value={editForm.sourceReference}
                                onChange={(e) => updateEditForm('sourceReference', e.target.value)}
                                className={inputClassName}
                                style={{ borderColor: BORDER }}
                              />
                            </label>
                          </>
                        )}
                        <label className="flex flex-col gap-1 md:col-span-2">
                          <span className="text-[0.6875rem] font-semibold text-slate-600">Description</span>
                          <input
                            value={editForm.description}
                            onChange={(e) => updateEditForm('description', e.target.value)}
                            className={inputClassName}
                            style={{ borderColor: BORDER }}
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-[0.6875rem] font-semibold text-slate-600">
                            Expires <span className="font-normal text-slate-400">(leave blank for no expiry)</span>
                          </span>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="datetime-local"
                              value={editForm.expiresAt}
                              onChange={(e) => updateEditForm('expiresAt', e.target.value)}
                              className={inputClassName}
                              style={{ borderColor: BORDER }}
                            />
                            {editForm.expiresAt && (
                              <button
                                type="button"
                                onClick={() => updateEditForm('expiresAt', '')}
                                className="h-[32px] shrink-0 rounded-lg border bg-white px-2 text-[0.6875rem] font-bold text-slate-600 transition hover:bg-slate-50"
                                style={{ borderColor: BORDER }}
                              >
                                Clear
                              </button>
                            )}
                          </div>
                        </label>
                        {editForm.description.trim() !== alert.description && (
                          <label className="flex items-center gap-2 md:col-span-2">
                            <input
                              type="checkbox"
                              checked={editForm.materialChangeOverride}
                              onChange={(e) => updateEditForm('materialChangeOverride', e.target.checked)}
                            />
                            <span className="text-[0.6875rem] text-slate-600">This changes operational meaning — require re-acknowledgement</span>
                          </label>
                        )}
                      </div>

                      {editForm.targetScope === 'officers' && (
                        <div className="mt-3">
                          <p className="mb-2 text-[0.6875rem] font-semibold text-slate-600">Selected officers</p>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                            {officers.map((officer) => {
                              const selected = editForm.officerIds.includes(officer.officerId);
                              return (
                                <button
                                  type="button"
                                  key={officer.officerId}
                                  onClick={() => toggleEditOfficer(officer.officerId)}
                                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left transition ${selected ? 'border-[#0D2137]/30 bg-[#0D2137]/5' : 'bg-white hover:bg-slate-50'}`}
                                  style={{ borderColor: selected ? undefined : BORDER }}
                                >
                                  <span className="min-w-0">
                                    <span className="block truncate text-[0.75rem] font-bold text-slate-800">{officer.name}</span>
                                    <span className="block truncate text-[0.625rem] text-slate-500">{officer.serviceNumber} - {officer.station}</span>
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="inline-flex h-[30px] items-center rounded-md border bg-white px-3 text-[0.6875rem] font-bold text-slate-600 transition hover:bg-slate-50"
                          style={{ borderColor: BORDER }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void saveEdit(alert)}
                          disabled={editSaving}
                          className="inline-flex h-[30px] items-center gap-1 rounded-md px-3 text-[0.6875rem] font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                          style={{ backgroundColor: NAVY }}
                        >
                          {editSaving ? <Loader2 size={12} className="animate-spin" /> : 'Save changes'}
                        </button>
                      </div>
                    </div>
                  )}

                  {coverageOpen && (
                    <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3">
                      {coverageLoading && !coverage && <Loader2 size={14} className="animate-spin text-indigo-600" />}
                      {coverage && (
                        <>
                          <p className="text-[0.75rem] font-semibold text-slate-800">
                            {coverage.acknowledgedCount}/{coverage.totalTargeted} acknowledged ({coverage.percentage}%) — v{coverage.version}
                          </p>
                          {coverage.outstandingOfficers.length > 0 ? (
                            <div className="mt-2">
                              <p className="mb-1 text-[0.6875rem] font-semibold text-slate-600">Outstanding</p>
                              {coverage.outstandingOfficers.map((officer) => (
                                <div key={officer.officerId} className="mt-1.5 rounded-md border border-indigo-100 bg-white px-2.5 py-1.5 first:mt-0">
                                  <p className="text-[0.75rem] text-slate-700">{officer.officerName} ({officer.badgeNumber})</p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-1.5 text-[0.75rem] text-slate-500">All targeted officers have acknowledged.</p>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {acksOpen && (
                    <div className="mt-3 rounded-lg border border-sky-100 bg-sky-50/60 p-3">
                      {acksLoading && <Loader2 size={14} className="animate-spin text-sky-600" />}
                      {!acksLoading && acks.map((ack) => (
                        <div key={ack.officerId} className="mt-2 rounded-md border border-sky-100 bg-white px-2.5 py-2 first:mt-0">
                          <p className="text-[0.75rem] font-semibold text-slate-800">{ack.officerName} ({ack.badgeNumber})</p>
                          <p className="mt-0.5 text-[0.6875rem] text-slate-400">Acknowledged {formatDateTime(ack.acknowledgedAt)}</p>
                        </div>
                      ))}
                      {!acksLoading && acks.length === 0 && (
                        <p className="text-[0.75rem] text-slate-500">No acknowledgements yet.</p>
                      )}
                    </div>
                  )}

                  {matchesOpen && (
                    <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50/60 p-3">
                      <p className="mb-2 text-[0.6875rem] leading-relaxed text-amber-800">{MATCH_ESCALATION_DISCLAIMER}</p>
                      {matchesLoading && <Loader2 size={14} className="animate-spin text-amber-600" />}
                      {!matchesLoading && matches.map((match) => (
                        <div key={match.id} className="mt-2 rounded-md border border-amber-100 bg-white px-2.5 py-2">
                          <p className="text-[0.75rem] font-semibold text-slate-800">{match.officerName} ({match.badgeNumber})</p>
                          <p className="mt-0.5 text-[0.75rem] text-slate-600">{match.notes}</p>
                          <p className="mt-0.5 text-[0.6875rem] text-slate-400">{formatDateTime(match.createdAt)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
        </>
        )}

        {(view === 'map' || view === 'heatmap') && (
          <>
            <section className="rounded-xl border bg-white p-3" style={{ borderColor: BORDER }}>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[0.6875rem] font-semibold text-slate-600">Alert type</span>
                  <select
                    value={sightingFilters.alertType ?? ''}
                    onChange={(e) => updateSightingFilter('alertType', (e.target.value || undefined) as OperationalAlertType | undefined)}
                    className={inputClassName}
                    style={{ borderColor: BORDER }}
                  >
                    <option value="">All types</option>
                    {ALERT_TYPES.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[0.6875rem] font-semibold text-slate-600">Priority</span>
                  <select
                    value={sightingFilters.priority ?? ''}
                    onChange={(e) => updateSightingFilter('priority', (e.target.value || undefined) as OperationalAlertPriority | undefined)}
                    className={inputClassName}
                    style={{ borderColor: BORDER }}
                  >
                    <option value="">All priorities</option>
                    {PRIORITIES.map((priority) => (
                      <option key={priority} value={priority}>{priority}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[0.6875rem] font-semibold text-slate-600">Alert</span>
                  <select
                    value={sightingFilters.alertId ?? ''}
                    onChange={(e) => updateSightingFilter('alertId', e.target.value || undefined)}
                    className={inputClassName}
                    style={{ borderColor: BORDER }}
                  >
                    <option value="">All alerts</option>
                    {alerts.map((alert) => (
                      <option key={alert.id} value={alert.id}>{alertTypeLabel(alert.alertType)} — {alert.description.slice(0, 40)}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[0.6875rem] font-semibold text-slate-600">From</span>
                  <input
                    type="datetime-local"
                    value={sightingFilters.from ?? ''}
                    onChange={(e) => updateSightingFilter('from', e.target.value || undefined)}
                    className={inputClassName}
                    style={{ borderColor: BORDER }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[0.6875rem] font-semibold text-slate-600">To</span>
                  <input
                    type="datetime-local"
                    value={sightingFilters.to ?? ''}
                    onChange={(e) => updateSightingFilter('to', e.target.value || undefined)}
                    className={inputClassName}
                    style={{ borderColor: BORDER }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setSightingFilters({})}
                  className="inline-flex h-[32px] items-center rounded-lg border bg-white px-3 text-[0.75rem] font-bold text-slate-600 transition hover:bg-slate-50"
                  style={{ borderColor: BORDER }}
                >
                  Clear filters
                </button>
                <button
                  type="button"
                  onClick={() => void loadSightings()}
                  className="inline-flex h-[32px] items-center gap-1.5 rounded-lg border bg-white px-3 text-[0.75rem] font-bold text-slate-600 transition hover:bg-slate-50"
                  style={{ borderColor: BORDER }}
                >
                  <RefreshCw size={13} />
                  Refresh
                </button>
                {sightingsLoading && <Loader2 size={15} className="animate-spin text-slate-400" />}
              </div>
              {sightingsError && (
                <p className="mt-2 text-[0.75rem] text-rose-700">{sightingsError}</p>
              )}
            </section>

            {view === 'map' && <SupervisorAlertsMap sightings={filteredSightings} />}
            {view === 'heatmap' && <SupervisorAlertsHeatmap sightings={filteredSightings} />}
          </>
        )}
      </div>
    </div>
  );
}

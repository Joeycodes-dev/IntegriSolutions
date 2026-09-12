import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Flame, Loader2, MapPin, Megaphone, RefreshCw, XCircle } from 'lucide-react';
import type {
  AlertSighting,
  AlertSightingFilters,
  CreateOperationalAlertPayload,
  FieldOfficer,
  OperationalAlert,
  OperationalAlertAcknowledgement,
  OperationalAlertMatch,
  OperationalAlertPriority,
  OperationalAlertSourceType,
  OperationalAlertStatus,
  OperationalAlertTargetScope,
  OperationalAlertType,
  RoadblockShift
} from '../../types';
import {
  createOperationalAlert,
  getAlertSightings,
  getFieldOfficers,
  getOperationalAlertAcknowledgements,
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

  const handleStatus = async (alert: OperationalAlert, status: OperationalAlertStatus) => {
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateOperationalAlert(alert.id, { status });
      setAlerts((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      setSuccess(`Alert marked ${status}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update operational alert');
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

              return (
                <article key={alert.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[0.8125rem] font-bold text-slate-900">{alertTypeLabel(alert.alertType)}</h3>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusStyles(displayStatus)}`}>
                          {displayStatus}
                        </span>
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
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {alert.status === 'active' && (
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => void handleStatus(alert, 'resolved')}
                            className="inline-flex h-[28px] items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-[0.6875rem] font-bold text-emerald-700 transition hover:bg-emerald-100"
                          >
                            Resolve
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleStatus(alert, 'cancelled')}
                            className="inline-flex h-[28px] items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 text-[0.6875rem] font-bold text-slate-700 transition hover:bg-slate-100"
                          >
                            <XCircle size={12} />
                            Cancel
                          </button>
                        </div>
                      )}
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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, Loader2, MapPinned, RefreshCw, XCircle } from 'lucide-react';
import type { FieldOfficer, RoadblockShift, RoadblockShiftStatus } from '../../types';
import {
  createRoadblockShift,
  getFieldOfficers,
  getRoadblockShifts,
  updateRoadblockShift
} from '../../services/api';
import { BORDER, NAVY, PAGE_BG, pageContent, pageShell } from './supervisorStyles';

const inputClassName =
  'h-[32px] w-full rounded-lg border bg-white px-2.5 text-[0.75rem] text-slate-800 outline-none transition focus:border-[#0D2137]/35 focus:ring-1 focus:ring-[#0D2137]/10';

interface ShiftFormState {
  roadblockName: string;
  station: string;
  startsAt: string;
  endsAt: string;
  centerLat: string;
  centerLng: string;
  radiusMeters: string;
  notes: string;
}

function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultForm(): ShiftFormState {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  const end = new Date(start);
  end.setHours(end.getHours() + 8);
  return {
    roadblockName: '',
    station: '',
    startsAt: toDatetimeLocal(start),
    endsAt: toDatetimeLocal(end),
    centerLat: '',
    centerLng: '',
    radiusMeters: '750',
    notes: ''
  };
}

function toIso(value: string): string {
  return new Date(value).toISOString();
}

function optionalNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function statusStyles(status: RoadblockShiftStatus): string {
  if (status === 'active') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'scheduled') return 'border-sky-200 bg-sky-50 text-sky-700';
  if (status === 'closed') return 'border-slate-200 bg-slate-50 text-slate-600';
  return 'border-rose-200 bg-rose-50 text-rose-700';
}

function isShiftCurrentlyLive(shift: RoadblockShift): boolean {
  const now = Date.now();
  const starts = new Date(shift.startsAt).getTime();
  const ends = new Date(shift.endsAt).getTime();
  return shift.status !== 'closed' && shift.status !== 'cancelled' && starts <= now && now <= ends;
}

export function SupervisorShifts() {
  const [shifts, setShifts] = useState<RoadblockShift[]>([]);
  const [officers, setOfficers] = useState<FieldOfficer[]>([]);
  const [selectedOfficerIds, setSelectedOfficerIds] = useState<number[]>([]);
  const [form, setForm] = useState<ShiftFormState>(() => defaultForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [shiftData, officerData] = await Promise.all([
        getRoadblockShifts(),
        getFieldOfficers()
      ]);
      setShifts(shiftData);
      setOfficers(officerData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load roadblock shifts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const officerById = useMemo(() => {
    const map = new Map<number, FieldOfficer>();
    for (const officer of officers) map.set(officer.officerId, officer);
    return map;
  }, [officers]);

  const activeCount = useMemo(
    () => shifts.filter((shift) => isShiftCurrentlyLive(shift)).length,
    [shifts]
  );

  const toggleOfficer = (officerId: number) => {
    setSelectedOfficerIds((prev) =>
      prev.includes(officerId)
        ? prev.filter((id) => id !== officerId)
        : [...prev, officerId]
    );
  };

  const updateForm = <K extends keyof ShiftFormState>(key: K, value: ShiftFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCreate = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const created = await createRoadblockShift({
        roadblockName: form.roadblockName.trim(),
        station: form.station.trim(),
        startsAt: toIso(form.startsAt),
        endsAt: toIso(form.endsAt),
        centerLat: optionalNumber(form.centerLat),
        centerLng: optionalNumber(form.centerLng),
        radiusMeters: optionalNumber(form.radiusMeters),
        notes: form.notes.trim() || null,
        assignedOfficerIds: selectedOfficerIds
      });
      setShifts((prev) => [created, ...prev]);
      setForm(defaultForm());
      setSelectedOfficerIds([]);
      setSuccess(`Created shift for ${created.roadblockName}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create roadblock shift');
    } finally {
      setSaving(false);
    }
  };

  const handleStatus = async (shift: RoadblockShift, status: RoadblockShiftStatus) => {
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateRoadblockShift(shift.id, { status });
      setShifts((prev) => prev.map((item) => item.id === updated.id ? updated : item));
      setSuccess(`${updated.roadblockName} marked ${status}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update roadblock shift');
    }
  };

  return (
    <div className={pageShell} style={{ backgroundColor: PAGE_BG }}>
      <header className="flex flex-wrap items-start justify-between gap-3 px-6 pb-3 pt-5">
        <div>
          <h1 className="text-lg font-bold leading-tight" style={{ color: NAVY }}>
            Roadblock Shifts
          </h1>
          <p className="mt-0.5 text-[0.75rem] text-slate-500">
            Create roadblock assignments officers can select on mobile before capturing tests.
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

        <section className="rounded-xl border bg-white p-4" style={{ borderColor: BORDER }}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[0.875rem] font-bold" style={{ color: NAVY }}>
                New Shift Assignment
              </h2>
              <p className="mt-0.5 text-[0.6875rem] text-slate-500">
                Officers only see assigned shifts that are inside the active time window.
              </p>
            </div>
            <span className="rounded-full border border-sky-100 bg-sky-50 px-2.5 py-1 text-[0.6875rem] font-bold text-sky-700">
              {activeCount} live now
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className="text-[0.6875rem] font-semibold text-slate-600">Roadblock</span>
              <input
                value={form.roadblockName}
                onChange={(e) => updateForm('roadblockName', e.target.value)}
                placeholder="N1 Midrand Roadblock"
                className={inputClassName}
                style={{ borderColor: BORDER }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[0.6875rem] font-semibold text-slate-600">Station</span>
              <input
                value={form.station}
                onChange={(e) => updateForm('station', e.target.value)}
                placeholder="Midrand SAPS"
                className={inputClassName}
                style={{ borderColor: BORDER }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[0.6875rem] font-semibold text-slate-600">Starts</span>
              <input
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => updateForm('startsAt', e.target.value)}
                className={inputClassName}
                style={{ borderColor: BORDER }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[0.6875rem] font-semibold text-slate-600">Ends</span>
              <input
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => updateForm('endsAt', e.target.value)}
                className={inputClassName}
                style={{ borderColor: BORDER }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[0.6875rem] font-semibold text-slate-600">Center latitude</span>
              <input
                value={form.centerLat}
                onChange={(e) => updateForm('centerLat', e.target.value)}
                placeholder="-26.2041"
                className={inputClassName}
                style={{ borderColor: BORDER }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[0.6875rem] font-semibold text-slate-600">Center longitude</span>
              <input
                value={form.centerLng}
                onChange={(e) => updateForm('centerLng', e.target.value)}
                placeholder="28.0473"
                className={inputClassName}
                style={{ borderColor: BORDER }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[0.6875rem] font-semibold text-slate-600">Radius meters</span>
              <input
                value={form.radiusMeters}
                onChange={(e) => updateForm('radiusMeters', e.target.value)}
                className={inputClassName}
                style={{ borderColor: BORDER }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[0.6875rem] font-semibold text-slate-600">Notes</span>
              <input
                value={form.notes}
                onChange={(e) => updateForm('notes', e.target.value)}
                placeholder="Checkpoint lane 2"
                className={inputClassName}
                style={{ borderColor: BORDER }}
              />
            </label>
          </div>

          <div className="mt-4">
            <p className="mb-2 text-[0.6875rem] font-semibold text-slate-600">Assigned officers</p>
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
                    {selected ? <CheckCircle2 size={15} className="text-sky-600" /> : <span className="h-[15px] w-[15px] rounded-full border" style={{ borderColor: BORDER }} />}
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

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={saving}
              className="inline-flex h-[36px] items-center gap-2 rounded-lg px-4 text-[0.75rem] font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ backgroundColor: NAVY }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <MapPinned size={14} />}
              Create Shift
            </button>
          </div>
        </section>

        <section className="rounded-xl border bg-white" style={{ borderColor: BORDER }}>
          <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: BORDER }}>
            <h2 className="text-[0.875rem] font-bold" style={{ color: NAVY }}>
              Shift Board
            </h2>
            {loading && <Loader2 size={15} className="animate-spin text-slate-400" />}
          </div>
          <div className="divide-y" style={{ borderColor: BORDER }}>
            {!loading && shifts.length === 0 && (
              <p className="px-4 py-8 text-center text-[0.75rem] text-slate-500">No roadblock shifts created yet.</p>
            )}
            {shifts.map((shift) => {
              const assigned = shift.assignedOfficerIds
                .map((id) => officerById.get(id)?.name ?? `Officer #${id}`)
                .join(', ');
              const bounds = shift.centerLat != null && shift.centerLng != null
                ? `${shift.centerLat.toFixed(4)}, ${shift.centerLng.toFixed(4)} - ${shift.radiusMeters ?? 0}m`
                : 'No location bounds set';
              return (
                <article key={shift.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[0.8125rem] font-bold text-slate-900">{shift.roadblockName}</h3>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusStyles(shift.status)}`}>
                          {isShiftCurrentlyLive(shift) ? 'live' : shift.status}
                        </span>
                      </div>
                      <p className="mt-1 flex items-center gap-1 text-[0.75rem] text-slate-600">
                        <CalendarClock size={12} />
                        {formatDateTime(shift.startsAt)} - {formatDateTime(shift.endsAt)}
                      </p>
                      <p className="mt-1 text-[0.75rem] text-slate-600">{shift.station} - Supervisor {shift.supervisorName ?? shift.supervisorEmail}</p>
                      <p className="mt-1 text-[0.6875rem] text-slate-500">Bounds: {bounds}</p>
                      <p className="mt-1 text-[0.6875rem] text-slate-500">Assigned: {assigned || 'None'}</p>
                      {shift.notes && <p className="mt-1 text-[0.6875rem] text-slate-500">Notes: {shift.notes}</p>}
                    </div>
                    {(shift.status === 'active' || shift.status === 'scheduled') && (
                      <button
                        type="button"
                        onClick={() => void handleStatus(shift, 'closed')}
                        className="inline-flex h-[30px] items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 text-[0.6875rem] font-bold text-slate-700 transition hover:bg-slate-100"
                      >
                        <XCircle size={13} />
                        Close
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
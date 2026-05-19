import { useCallback, useEffect, useMemo, useState } from 'react';
import { getFieldOfficers } from '../../services/api';
import type { FieldOfficer, OfficerShiftStatus, TestRecord } from '../../types';
import {
  ROSTER_ASSIGNMENTS,
  buildOfficerPerformance,
  isToday
} from '../../lib/officerDisplay';
import { BORDER, NAVY, PAGE_BG, pageShell } from './supervisorStyles';
import { AddOfficer } from './AddOfficer';
import { OfficerInformation } from './OfficerInformation';

interface SupervisorOfficersProps {
  tests: TestRecord[];
}

function StatusBadge({ status }: { status: OfficerShiftStatus }) {
  const styles =
    status === 'On Patrol'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : status === 'Checkpoint'
        ? 'border-blue-200 bg-blue-50 text-blue-700'
        : 'border-amber-200 bg-amber-50 text-amber-800';

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${styles}`}>
      {status}
    </span>
  );
}

export function SupervisorOfficers({ tests }: SupervisorOfficersProps) {
  const [view, setView] = useState<'list' | 'add' | 'detail'>('list');
  const [selectedOfficerId, setSelectedOfficerId] = useState<number | null>(null);
  const [officers, setOfficers] = useState<FieldOfficer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOfficers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getFieldOfficers();
      setOfficers(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load officers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOfficers();
  }, [loadOfficers]);

  const activeOfficers = useMemo(
    () => officers.filter((o) => o.status.toLowerCase() === 'active'),
    [officers]
  );

  const todayTests = useMemo(() => tests.filter((t) => isToday(t.createdAt)), [tests]);

  const avgTestsPerOfficer = useMemo(() => {
    if (activeOfficers.length === 0) return '0';
    return (todayTests.length / activeOfficers.length).toFixed(1);
  }, [activeOfficers.length, todayTests.length]);

  const performanceRows = useMemo(
    () => buildOfficerPerformance(activeOfficers, tests),
    [activeOfficers, tests]
  );

  const selectedOfficer = useMemo(
    () => officers.find((o) => o.officerId === selectedOfficerId) ?? null,
    [officers, selectedOfficerId]
  );

  if (view === 'add') {
    return (
      <AddOfficer
        onBack={() => setView('list')}
        onCreated={(created) => {
          setOfficers((prev) => [created, ...prev]);
          setView('list');
        }}
      />
    );
  }

  if (view === 'detail' && selectedOfficer) {
    return (
      <OfficerInformation
        officer={selectedOfficer}
        onBack={() => {
          setSelectedOfficerId(null);
          setView('list');
        }}
      />
    );
  }

  return (
    <div className={pageShell} style={{ backgroundColor: PAGE_BG }}>
      <div className="space-y-3 p-4 lg:p-5">
        <div
          className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-white px-4 py-3.5"
          style={{ borderColor: BORDER }}
        >
          <div>
            <h1 className="text-lg font-bold leading-tight" style={{ color: NAVY }}>
              Officers
            </h1>
            <p className="mt-0.5 max-w-xl text-[0.75rem] leading-snug text-slate-500">
              Manage shift rosters, track officer performance, and monitor live deployment status.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setView('add')}
            className="h-[34px] shrink-0 rounded-lg px-4 text-[0.75rem] font-bold text-white transition hover:brightness-110"
            style={{ backgroundColor: NAVY }}
          >
            Add Officer
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-[0.75rem] text-rose-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-xl border bg-white px-4 py-3" style={{ borderColor: BORDER }}>
            <p className="text-[0.75rem] text-slate-500">Total active officers</p>
            <p className="mt-1 text-2xl font-bold leading-none text-slate-900">
              {loading ? '—' : activeOfficers.length}
            </p>
            <p className="mt-1 text-[0.6875rem] font-medium text-emerald-600">+3 vs last week</p>
          </div>
          <div className="rounded-xl border bg-white px-4 py-3" style={{ borderColor: BORDER }}>
            <p className="text-[0.75rem] text-slate-500">Average tests / officer</p>
            <p className="mt-1 text-2xl font-bold leading-none text-slate-900">
              {loading ? '—' : avgTestsPerOfficer}
            </p>
            <p className="mt-1 text-[0.6875rem] text-slate-500">Current 24-hour cycle</p>
          </div>
          <div className="rounded-xl border bg-white px-4 py-3" style={{ borderColor: BORDER }}>
            <p className="text-[0.75rem] text-slate-500">Shift coverage health</p>
            <p className="mt-1 text-2xl font-bold leading-none text-slate-900">92%</p>
            <p className="mt-1 text-[0.6875rem] font-medium text-amber-600">
              Night shift under target by 1 officer
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_280px]">
          <div className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: BORDER }}>
            <div className="border-b px-4 py-3" style={{ borderColor: BORDER }}>
              <h2 className="text-[0.8125rem] font-bold" style={{ color: NAVY }}>
                Officer Performance
              </h2>
            </div>
            <div className="overflow-x-auto">
              {loading ? (
                <p className="px-4 py-10 text-center text-[0.75rem] text-slate-500">Loading officers…</p>
              ) : (
                <table className="min-w-full text-left">
                  <thead>
                    <tr className="border-b" style={{ borderColor: BORDER }}>
                      {[
                        'OFFICER',
                        'SERVICE NO',
                        'SHIFT',
                        'TESTS TODAY',
                        'FAIL RATE',
                        'ACTION',
                        'STATUS'
                      ].map((col) => (
                        <th
                          key={col}
                          className="px-4 py-2.5 text-[10px] font-bold tracking-[0.08em] text-slate-500"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {performanceRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center text-[0.75rem] text-slate-500">
                          No officers yet. Click Add Officer to register field staff.
                        </td>
                      </tr>
                    ) : (
                      performanceRows.map((row) => (
                        <tr
                          key={row.officerId}
                          className="border-b last:border-b-0"
                          style={{ borderColor: BORDER }}
                        >
                          <td className="px-4 py-2.5">
                            <p className="text-[0.8125rem] font-semibold text-slate-800">
                              {row.displayName}
                            </p>
                            <p className="text-[0.6875rem] text-slate-500">{row.precinct}</p>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[0.75rem] text-slate-700">
                            {row.serviceNumber}
                          </td>
                          <td className="px-4 py-2.5 text-[0.75rem] text-slate-700">{row.shift}</td>
                          <td className="px-4 py-2.5 text-[0.8125rem] font-semibold text-slate-800">
                            {row.testsToday}
                          </td>
                          <td className="px-4 py-2.5 text-[0.75rem] text-slate-700">{row.failRate}</td>
                          <td className="px-4 py-2.5">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedOfficerId(row.officerId);
                                setView('detail');
                              }}
                              className="text-[0.75rem] font-semibold text-slate-600 hover:text-slate-900"
                            >
                              View
                            </button>
                          </td>
                          <td className="px-4 py-2.5">
                            <StatusBadge status={row.status} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="rounded-xl border bg-white px-4 py-3.5" style={{ borderColor: BORDER }}>
            <h2 className="text-[0.8125rem] font-bold" style={{ color: NAVY }}>
              Roster Assignment
            </h2>
            <ul className="mt-3 space-y-3">
              {ROSTER_ASSIGNMENTS.map((slot) => {
                const filled = slot.assigned >= slot.target;
                return (
                  <li
                    key={slot.label}
                    className="flex items-center justify-between border-b pb-3 last:border-b-0 last:pb-0"
                    style={{ borderColor: BORDER }}
                  >
                    <span className="text-[0.8125rem] font-medium text-slate-800">{slot.label}</span>
                    <span
                      className={`text-[0.8125rem] font-bold ${filled ? 'text-emerald-600' : 'text-rose-600'}`}
                    >
                      {slot.assigned} / {slot.target} officers
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

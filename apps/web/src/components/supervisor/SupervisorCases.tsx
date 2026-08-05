import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import type { CaseRecord, CaseStatus, TestRecord } from '../../types';
import { getCases } from '../../services/api';
import { formatCaptureContext, formatReferenceId } from '../../lib/testEvidence';
import { CASE_STATUSES, CASE_STATUS_LABELS, CASE_STATUS_STYLES, formatCaseTimestamp } from '../../lib/caseStatus';
import { BORDER, NAVY, PAGE_BG, pageContent, pageShell } from './supervisorStyles';
import { EvidenceReview } from './EvidenceReview';

const REFRESH_INTERVAL_MS = 10_000;

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  const style = CASE_STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden />
      {CASE_STATUS_LABELS[status]}
    </span>
  );
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function captureContextLabel(location: string | Record<string, unknown> | undefined): string {
  return formatCaptureContext(location);
}

export function SupervisorCases() {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<CaseStatus | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [selectedCase, setSelectedCase] = useState<CaseRecord | null>(null);

  const loadCases = useCallback(async () => {
    try {
      const data = await getCases();
      setCases(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cases');
      setCases([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCases();
  }, [loadCases]);

  useEffect(() => {
    if (loading) return;
    const interval = setInterval(() => void loadCases(), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadCases, loading]);

  const counts = useMemo(() => {
    const map = new Map<string, number>(CASE_STATUSES.map((status) => [status, 0]));
    for (const entry of cases) {
      map.set(entry.caseStatus, (map.get(entry.caseStatus) ?? 0) + 1);
    }
    return map;
  }, [cases]);

  const filteredCases = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cases.filter(
      (entry) =>
        (statusFilter === 'ALL' || entry.caseStatus === statusFilter) &&
        (!q ||
        entry.driverName.toLowerCase().includes(q) ||
        entry.officerName.toLowerCase().includes(q) ||
        entry.driverId.toLowerCase().includes(q) ||
        entry.id.toLowerCase().includes(q))
    );
  }, [cases, search, statusFilter]);

  if (selectedCase) {
    return (
      <EvidenceReview
        test={selectedCase as TestRecord}
        onBack={() => {
          setSelectedCase(null);
          void loadCases();
        }}
      />
    );
  }

  return (
    <div className={pageShell} style={{ backgroundColor: PAGE_BG }}>
      <header className="flex flex-wrap items-start justify-between gap-3 px-6 pb-3 pt-5">
        <div>
          <h1 className="text-lg font-bold leading-tight" style={{ color: NAVY }}>
            Case Queue
          </h1>
          <p className="mt-0.5 text-[0.75rem] text-slate-500">
            Review, verify, refer, invalidate, and close cases from a single queue
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadCases()}
          className="inline-flex h-[34px] items-center gap-2 rounded-lg border bg-white px-3.5 text-[0.75rem] font-bold text-slate-700 transition hover:bg-slate-50"
          style={{ borderColor: BORDER }}
        >
          <RefreshCw size={14} strokeWidth={2} />
          Refresh
        </button>
      </header>

      <div className={`${pageContent} space-y-3`}>
        {error && (
          <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-[0.75rem] text-rose-700">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {(['ALL', ...CASE_STATUSES] as const).map((status) => {
            const active = statusFilter === status;
            const count = status === 'ALL' ? cases.length : counts.get(status) ?? 0;
            return (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`inline-flex h-[30px] items-center gap-1.5 rounded-full border px-3 text-[0.6875rem] font-bold transition ${
                  active ? 'border-[#0D2137]/35 bg-[#0D2137]/5 text-[#0D2137]' : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
                style={{ borderColor: active ? undefined : BORDER }}
              >
                {status === 'ALL' ? 'All' : CASE_STATUS_LABELS[status]}
                <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${active ? 'bg-[#0D2137] text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {count}
                </span>
              </button>
            );
          })}

          <div className="relative ml-auto w-[240px]">
            <Search
              size={13}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              strokeWidth={2}
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search driver, officer, case ID..."
              className="h-[30px] w-full rounded-md border bg-white pl-8 pr-2.5 text-[0.75rem] text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-[#0D2137]/35 focus:ring-1 focus:ring-[#0D2137]/10"
              style={{ borderColor: BORDER }}
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: BORDER }}>
          <div className="overflow-x-auto">
            {loading ? (
              <p className="px-4 py-10 text-center text-[0.75rem] text-slate-500">Loading cases...</p>
            ) : filteredCases.length === 0 ? (
              <p className="px-4 py-10 text-center text-[0.75rem] text-slate-500">
                {search.trim() || statusFilter !== 'ALL'
                  ? 'No cases match the current filter.'
                  : 'No cases yet. Tests sync into this queue automatically.'}
              </p>
            ) : (
              <table className="min-w-full text-left">
                <thead>
                  <tr className="border-b" style={{ borderColor: BORDER }}>
                    {['CASE ID', 'DRIVER', 'OFFICER', 'RESULT', 'READING', 'CAPTURE CONTEXT', 'CAPTURED', 'STATUS', 'LAST UPDATE'].map((col) => (
                      <th
                        key={col}
                        className="px-4 py-2.5 text-[10px] font-bold tracking-[0.1em] text-slate-500"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredCases.map((entry) => (
                    <tr
                      key={entry.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedCase(entry)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedCase(entry);
                        }
                      }}
                      className="cursor-pointer border-b transition last:border-b-0 hover:bg-slate-50"
                      style={{ borderColor: BORDER }}
                    >
                      <td className="px-4 py-2.5 font-mono text-[0.75rem] font-semibold text-slate-700">
                        {formatReferenceId(entry.id)}
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="text-[0.8125rem] font-semibold text-slate-800">{entry.driverName}</p>
                        <p className="font-mono text-[0.6875rem] text-slate-500">{entry.driverId}</p>
                      </td>
                      <td className="px-4 py-2.5 text-[0.8125rem] text-slate-700">{entry.officerName}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold tracking-wide ${
                            entry.result === 'fail'
                              ? 'border-rose-200 bg-rose-50 text-rose-600'
                              : 'border-emerald-200 bg-emerald-50 text-emerald-600'
                          }`}
                        >
                          {entry.result === 'fail' ? 'FAILED' : 'PASSED'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[0.75rem] text-slate-700">
                        {entry.bacReading.toFixed(2)}
                      </td>
                      <td className="max-w-[180px] px-4 py-2.5">
                        <p className="truncate text-[0.75rem] text-slate-600" title={captureContextLabel(entry.location)}>
                          {captureContextLabel(entry.location)}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-[0.75rem] text-slate-600">
                        {formatTimestamp(entry.createdAt)}
                      </td>
                      <td className="px-4 py-2.5">
                        <CaseStatusBadge status={entry.caseStatus} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-[0.6875rem] text-slate-500">
                        {formatCaseTimestamp(entry.caseUpdatedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

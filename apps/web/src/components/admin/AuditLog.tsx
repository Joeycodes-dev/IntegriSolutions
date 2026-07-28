import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, RefreshCw, Search } from 'lucide-react';
import { getAuditLogs } from '../../services/api';
import type { AuditLogEntry } from '../../types';

const NAVY = '#0D2137';
const PAGE_BG = '#F1F5F9';
const BORDER = '#E2E8F0';

const COLUMNS = ['AUDIT ID', 'ACTOR', 'ACTION', 'TARGET', 'TIMESTAMP'] as const;
const PAGE_SIZE = 20;
const REFRESH_INTERVAL_MS = 30_000;

export function AuditLog() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAuditLogs();
      setEntries(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      void loadLogs();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [autoRefresh, loadLogs]);

  const uniqueActions = useMemo(() => {
    const actions = new Set(entries.map((e) => e.action));
    return Array.from(actions).sort();
  }, [entries]);

  const filteredEntries = useMemo(() => {
    let filtered = entries;

    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.actor.toLowerCase().includes(q) ||
          e.action.toLowerCase().includes(q) ||
          e.target.toLowerCase().includes(q) ||
          e.auditId.toLowerCase().includes(q)
      );
    }

    if (actionFilter) {
      filtered = filtered.filter((e) => e.action === actionFilter);
    }

    return filtered;
  }, [entries, search, actionFilter]);

  const totalPages = Math.ceil(filteredEntries.length / PAGE_SIZE);
  const paginatedEntries = filteredEntries.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search, actionFilter]);

  return (
    <div className="flex min-h-screen flex-1 flex-col" style={{ backgroundColor: PAGE_BG }}>
      <header className="flex flex-wrap items-start justify-between gap-4 px-8 pb-4 pt-8">
        <div>
          <h1 className="text-lg font-bold leading-tight" style={{ color: NAVY }}>
            Audit Log Access
          </h1>
          <p className="mt-1 text-[0.8125rem] text-slate-500">
            Administrative traceability and security event history.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-[0.75rem] text-slate-600">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Auto-refresh
          </label>
          <button
            type="button"
            onClick={() => void loadLogs()}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[0.75rem] font-semibold text-slate-700 transition hover:bg-slate-50"
            style={{ borderColor: BORDER }}
          >
            <RefreshCw size={13} strokeWidth={2} />
            Refresh
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 px-8 pb-4">
        <div className="relative flex-1" style={{ maxWidth: '320px' }}>
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            strokeWidth={2}
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by actor, action, target..."
            className="h-[34px] w-full rounded-md border bg-white pl-9 pr-3 text-[0.8125rem] text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-[#0D2137]/35 focus:ring-1 focus:ring-[#0D2137]/10"
            style={{ borderColor: BORDER }}
          />
        </div>
        <div className="relative">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="h-[34px] appearance-none rounded-md border bg-white pl-3 pr-8 text-[0.8125rem] text-slate-800 outline-none transition focus:border-[#0D2137]/35 focus:ring-1 focus:ring-[#0D2137]/10"
            style={{ borderColor: BORDER }}
          >
            <option value="">All Actions</option>
            {uniqueActions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            strokeWidth={2}
          />
        </div>
        <span className="text-[0.75rem] text-slate-500">
          {filteredEntries.length} {filteredEntries.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      <div className="flex-1 px-8 pb-8">
        <div
          className="overflow-hidden rounded-xl border bg-white"
          style={{ borderColor: BORDER }}
        >
          {error && (
            <div className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-[0.8125rem] text-amber-900">
              {error}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead>
                <tr className="border-b" style={{ borderColor: BORDER }}>
                  {COLUMNS.map((col) => (
                    <th
                      key={col}
                      className="px-5 py-3 text-[10px] font-bold tracking-[0.12em]"
                      style={{ color: NAVY }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-[0.8125rem] text-slate-500">
                      Loading audit logs…
                    </td>
                  </tr>
                ) : paginatedEntries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-[0.8125rem] text-slate-500">
                      {error
                        ? 'Audit history is unavailable until the database table is configured.'
                        : search || actionFilter
                        ? 'No audit events match your filters.'
                        : 'No audit events recorded yet. Actions such as creating or removing users will appear here.'}
                    </td>
                  </tr>
                ) : (
                  paginatedEntries.map((entry) => (
                    <tr
                      key={entry.id}
                      className="border-b last:border-b-0"
                      style={{ borderColor: BORDER }}
                    >
                      <td className="px-5 py-3.5 font-mono text-[0.75rem] text-slate-600">
                        {entry.auditId}
                      </td>
                      <td className="px-5 py-3.5 text-[0.8125rem] text-slate-800">{entry.actor}</td>
                      <td className="px-5 py-3.5 text-[0.8125rem] text-slate-700">{entry.action}</td>
                      <td className="px-5 py-3.5 text-[0.8125rem] text-slate-700">{entry.target}</td>
                      <td className="px-5 py-3.5 font-mono text-[0.75rem] text-slate-600">
                        {entry.timestamp}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-5 py-3" style={{ borderColor: BORDER }}>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="rounded-md border px-3 py-1.5 text-[0.75rem] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ borderColor: BORDER }}
              >
                Previous
              </button>
              <span className="text-[0.75rem] text-slate-600">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="rounded-md border px-3 py-1.5 text-[0.75rem] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ borderColor: BORDER }}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { getAuditLogs } from '../../services/api';
import type { AuditLogEntry } from '../../types';

const NAVY = '#0D2137';
const PAGE_BG = '#F1F5F9';
const BORDER = '#E2E8F0';

const COLUMNS = ['AUDIT ID', 'ACTOR', 'ACTION', 'TARGET', 'TIMESTAMP'] as const;

export function AuditLog() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="flex min-h-screen flex-1 flex-col" style={{ backgroundColor: PAGE_BG }}>
      <header className="px-8 pb-4 pt-8">
        <h1 className="text-lg font-bold leading-tight" style={{ color: NAVY }}>
          Audit Log Access
        </h1>
        <p className="mt-1 text-[0.8125rem] text-slate-500">
          Administrative traceability and security event history.
        </p>
      </header>

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
                ) : entries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-[0.8125rem] text-slate-500">
                      {error
                        ? 'Audit history is unavailable until the database table is configured.'
                        : 'No audit events recorded yet. Actions such as creating or removing users will appear here.'}
                    </td>
                  </tr>
                ) : (
                  entries.map((entry) => (
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
        </div>
      </div>
    </div>
  );
}

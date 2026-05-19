import { useMemo, useState } from 'react';
import { AlertCircle, Search } from 'lucide-react';
import type { TestRecord } from '../../types';
import { BORDER, NAVY, PAGE_BG, pageContent, pageShell } from './supervisorStyles';

interface SupervisorLogsProps {
  tests: TestRecord[];
  loading: boolean;
  error: string | null;
  onSelectTest: (test: TestRecord) => void;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatOfficerName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return name;
  const initials = parts
    .slice(0, -1)
    .map((p) => `${p.charAt(0).toUpperCase()}.`)
    .join(' ');
  const surname = parts[parts.length - 1];
  return `${initials} ${surname}`;
}

function matchesSearch(test: TestRecord, query: string): boolean {
  const q = query.toLowerCase();
  return (
    test.officerName.toLowerCase().includes(q) ||
    test.badgeNumber.toLowerCase().includes(q) ||
    test.driverId.toLowerCase().includes(q) ||
    test.driverName.toLowerCase().includes(q) ||
    test.id.toLowerCase().includes(q)
  );
}

export function SupervisorLogs({ tests, loading, error, onSelectTest }: SupervisorLogsProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const sorted = [...tests].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    if (!search.trim()) return sorted;
    return sorted.filter((t) => matchesSearch(t, search.trim()));
  }, [tests, search]);

  return (
    <div className={pageShell} style={{ backgroundColor: PAGE_BG }}>
      <header className="flex flex-wrap items-start justify-between gap-3 px-6 pb-3 pt-5">
        <div>
          <h1 className="text-lg font-bold leading-tight" style={{ color: NAVY }}>
            Live Test Logs
          </h1>
          <p className="mt-0.5 text-[0.75rem] text-slate-500">
            Search and inspect every recorded test event
          </p>
        </div>

        <div className="relative w-[220px] shrink-0">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            strokeWidth={2}
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by officer, driver ID..."
            className="h-[30px] w-full rounded-md border bg-white pl-8 pr-2.5 text-[0.75rem] text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-[#0D2137]/35 focus:ring-1 focus:ring-[#0D2137]/10"
            style={{ borderColor: BORDER }}
          />
        </div>
      </header>

      <div className={pageContent}>
        <div className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: BORDER }}>
          {error && (
            <div className="flex items-center gap-2 border-b border-rose-100 bg-rose-50 px-4 py-2 text-[0.75rem] text-rose-700">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          <div className="overflow-x-auto">
            {loading ? (
              <p className="px-4 py-10 text-center text-[0.75rem] text-slate-500">Loading logs…</p>
            ) : (
              <table className="min-w-full text-left">
                <thead>
                  <tr className="border-b" style={{ borderColor: BORDER }}>
                    {['TIMESTAMP', 'OFFICER', 'DRIVER LICENCE', 'RESULT', 'READING'].map((col) => (
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
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-[0.75rem] text-slate-500">
                        {search.trim() ? 'No logs match your search.' : 'No test records found.'}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((test) => {
                      const failed = test.result === 'fail';
                      return (
                        <tr
                          key={test.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => onSelectTest(test)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onSelectTest(test);
                            }
                          }}
                          className="cursor-pointer border-b transition last:border-b-0 hover:bg-slate-50"
                          style={{ borderColor: BORDER }}
                        >
                          <td className="whitespace-nowrap px-4 py-2.5 text-[0.8125rem] text-slate-700">
                            {formatTimestamp(test.createdAt)}
                          </td>
                          <td className="px-4 py-2.5 text-[0.8125rem] font-medium text-slate-800">
                            {formatOfficerName(test.officerName)}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[0.8125rem] text-slate-700">
                            {test.driverId}
                          </td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold tracking-wide ${
                                failed
                                  ? 'border-rose-200 bg-rose-50 text-rose-600'
                                  : 'border-emerald-200 bg-emerald-50 text-emerald-600'
                              }`}
                            >
                              {failed ? 'FAILED' : 'PASSED'}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-[0.8125rem] text-slate-800">
                            {test.bacReading.toFixed(2)} g/100ml
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

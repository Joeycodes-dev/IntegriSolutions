import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, Filter, Search, ShieldAlert, X } from 'lucide-react';
import type { TestRecord } from '../../types';
import { getTests, type TestFilters } from '../../services/api';
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

const RESULT_OPTIONS = [
  { label: 'All Results', value: '' },
  { label: 'Passed', value: 'pass' },
  { label: 'Failed', value: 'fail' }
] as const;

export function SupervisorLogs({ tests: _allTests, loading: _loading, error: _error, onSelectTest }: SupervisorLogsProps) {
  const [search, setSearch] = useState('');
  const [resultFilter, setResultFilter] = useState<'' | 'pass' | 'fail'>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filteredTests, setFilteredTests] = useState<TestRecord[]>([]);
  const [filteredLoading, setFilteredLoading] = useState(true);
  const [filteredError, setFilteredError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchFiltered = useCallback(async (filters: TestFilters) => {
    setFilteredLoading(true);
    setFilteredError(null);
    try {
      const data = await getTests(filters);
      setFilteredTests(data as TestRecord[]);
    } catch (err) {
      setFilteredError(err instanceof Error ? err.message : 'Failed to load logs');
    } finally {
      setFilteredLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const filters: TestFilters = {};
      if (search.trim()) filters.search = search.trim();
      if (resultFilter) filters.result = resultFilter;
      if (dateFrom) filters.dateFrom = dateFrom;
      if (dateTo) filters.dateTo = dateTo;
      void fetchFiltered(filters);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, resultFilter, dateFrom, dateTo, fetchFiltered]);

  const hasActiveFilters = resultFilter !== '' || dateFrom !== '' || dateTo !== '';

  const clearFilters = () => {
    setResultFilter('');
    setDateFrom('');
    setDateTo('');
    setSearch('');
  };

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

        <div className="flex items-center gap-2">
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
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`inline-flex h-[30px] items-center gap-1.5 rounded-md border px-2.5 text-[0.6875rem] font-semibold transition ${
              hasActiveFilters ? 'border-[#0D2137]/30 bg-[#0D2137]/5 text-[#0D2137]' : 'text-slate-600 hover:bg-slate-50'
            }`}
            style={{ borderColor: hasActiveFilters ? undefined : BORDER }}
          >
            <Filter size={13} strokeWidth={2} />
            Filters
            {hasActiveFilters && (
              <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#0D2137] text-[9px] font-bold text-white">
                {[resultFilter, dateFrom, dateTo].filter(Boolean).length}
              </span>
            )}
          </button>
        </div>
      </header>

      {showFilters && (
        <div className="mx-5 mb-3 rounded-xl border bg-white p-3.5" style={{ borderColor: BORDER }}>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold tracking-[0.1em] text-slate-500">RESULT</span>
              <div className="relative">
                <select
                  value={resultFilter}
                  onChange={(e) => setResultFilter(e.target.value as '' | 'pass' | 'fail')}
                  className="h-[30px] appearance-none rounded-md border bg-white pl-2.5 pr-7 text-[0.75rem] text-slate-800 outline-none transition focus:border-[#0D2137]/35 focus:ring-1 focus:ring-[#0D2137]/10"
                  style={{ borderColor: BORDER }}
                >
                  {RESULT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <ChevronDown size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold tracking-[0.1em] text-slate-500">FROM</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-[30px] rounded-md border bg-white px-2.5 text-[0.75rem] text-slate-800 outline-none transition focus:border-[#0D2137]/35 focus:ring-1 focus:ring-[#0D2137]/10"
                style={{ borderColor: BORDER }}
              />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold tracking-[0.1em] text-slate-500">TO</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-[30px] rounded-md border bg-white px-2.5 text-[0.75rem] text-slate-800 outline-none transition focus:border-[#0D2137]/35 focus:ring-1 focus:ring-[#0D2137]/10"
                style={{ borderColor: BORDER }}
              />
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-[30px] items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2.5 text-[0.6875rem] font-semibold text-rose-600 transition hover:bg-rose-100"
              >
                <X size={12} strokeWidth={2} />
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      <div className={pageContent}>
        <div className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: BORDER }}>
          {filteredError && (
            <div className="flex items-center gap-2 border-b border-rose-100 bg-rose-50 px-4 py-2 text-[0.75rem] text-rose-700">
              <AlertCircle size={14} />
              {filteredError}
            </div>
          )}

          <div className="overflow-x-auto">
            {filteredLoading ? (
              <p className="px-4 py-10 text-center text-[0.75rem] text-slate-500">Loading logs...</p>
            ) : (
              <table className="min-w-full text-left">
                <thead>
                  <tr className="border-b" style={{ borderColor: BORDER }}>
                    {['TIMESTAMP', 'OFFICER', 'DRIVER LICENCE', 'RESULT', 'READING', 'INTEGRITY'].map((col) => (
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
                  {filteredTests.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-[0.75rem] text-slate-500">
                        {search.trim() || hasActiveFilters ? 'No logs match your filters.' : 'No test records found.'}
                      </td>
                    </tr>
                  ) : (
                    filteredTests.map((test) => {
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
                          <td className="px-4 py-2.5">
                            {test.hashValid === true ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                <CheckCircle2 size={10} strokeWidth={2.5} />
                                VERIFIED
                              </span>
                            ) : test.hashValid === false ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                                <ShieldAlert size={10} strokeWidth={2.5} />
                                TAMPERED
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400">—</span>
                            )}
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

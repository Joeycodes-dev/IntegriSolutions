import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Filter, Search, ShieldAlert, X } from 'lucide-react';
import type { TestRecord } from '../../types';
import { getTests, type TestFilters } from '../../services/api';
import {
  INDIVIDUAL_TEST_LABEL,
  NO_ROADBLOCK_LINK_LABEL,
  parseTestLocation
} from '../../lib/testEvidence';
import { collectRoadblockOptions, getTestRoadblockContext } from '../../lib/reportAnalytics';
import { BORDER, NAVY, PAGE_BG, pageContent, pageShell } from './supervisorStyles';

interface SupervisorLogsProps {
  tests: TestRecord[];
  loading: boolean;
  error: string | null;
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

function formatGps(location?: string | Record<string, unknown>): string {
  const parsed = parseTestLocation(location);
  if (typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
    return `${parsed.lat.toFixed(4)}, ${parsed.lng.toFixed(4)}`;
  }
  return '—';
}

const RESULT_OPTIONS = [
  { label: 'All Results', value: '' },
  { label: 'Passed', value: 'pass' },
  { label: 'Failed', value: 'fail' }
] as const;

const PAGE_SIZE = 10;

export function SupervisorLogs({ tests, loading: _loading, error: _error }: SupervisorLogsProps) {
  const [search, setSearch] = useState('');
  const [resultFilter, setResultFilter] = useState<'' | 'pass' | 'fail'>('');
  const [officerFilter, setOfficerFilter] = useState('');
  const [roadblockFilter, setRoadblockFilter] = useState('');
  const [driverLicenseFilter, setDriverLicenseFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filteredTests, setFilteredTests] = useState<TestRecord[]>([]);
  const [filteredLoading, setFilteredLoading] = useState(true);
  const [filteredError, setFilteredError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
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
      if (officerFilter) filters.officer = officerFilter;
      if (driverLicenseFilter.trim()) filters.driverLicense = driverLicenseFilter.trim();
      if (dateFrom) filters.dateFrom = dateFrom;
      if (dateTo) filters.dateTo = dateTo;
      void fetchFiltered(filters);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, resultFilter, officerFilter, driverLicenseFilter, dateFrom, dateTo, fetchFiltered]);

  const officerOptions = useMemo(() => {
    const source = tests.length > 0 ? tests : filteredTests;
    const officers = new Map<string, string>();

    for (const test of source) {
      const name = test.officerName?.trim();
      if (!name || officers.has(name)) continue;
      officers.set(name, test.badgeNumber ? `${name} (${test.badgeNumber})` : name);
    }

    return Array.from(officers, ([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [tests, filteredTests]);

  const roadblockOptions = useMemo(
    () => collectRoadblockOptions([...tests, ...filteredTests]),
    [tests, filteredTests]
  );

  const visibleTests = useMemo(() => {
    if (!roadblockFilter) return filteredTests;
    return filteredTests.filter((test) => getTestRoadblockContext(test).key === roadblockFilter);
  }, [filteredTests, roadblockFilter]);

  const hasActiveFilters = resultFilter !== '' || officerFilter !== '' || roadblockFilter !== '' || driverLicenseFilter.trim() !== '' || dateFrom !== '' || dateTo !== '';

  const totalPages = Math.max(1, Math.ceil(visibleTests.length / PAGE_SIZE));
  const paginatedTests = useMemo(
    () => visibleTests.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [visibleTests, currentPage]
  );
  const firstVisible = visibleTests.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const lastVisible = Math.min(currentPage * PAGE_SIZE, visibleTests.length);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, resultFilter, officerFilter, roadblockFilter, driverLicenseFilter, dateFrom, dateTo]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const clearFilters = () => {
    setResultFilter('');
    setOfficerFilter('');
    setRoadblockFilter('');
    setDriverLicenseFilter('');
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
            View-only register of every recorded test event
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
                {[resultFilter, officerFilter, roadblockFilter, driverLicenseFilter.trim(), dateFrom, dateTo].filter(Boolean).length}
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
              <span className="text-[10px] font-bold tracking-[0.1em] text-slate-500">OFFICER</span>
              <div className="relative">
                <select
                  aria-label="Officer filter"
                  value={officerFilter}
                  onChange={(e) => setOfficerFilter(e.target.value)}
                  className="h-[30px] min-w-[180px] appearance-none rounded-md border bg-white pl-2.5 pr-7 text-[0.75rem] text-slate-800 outline-none transition focus:border-[#0D2137]/35 focus:ring-1 focus:ring-[#0D2137]/10"
                  style={{ borderColor: BORDER }}
                >
                  <option value="">All Officers</option>
                  {officerOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <ChevronDown size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold tracking-[0.1em] text-slate-500">DRIVER LICENCE</span>
              <input
                aria-label="Driver licence filter"
                type="search"
                value={driverLicenseFilter}
                onChange={(e) => setDriverLicenseFilter(e.target.value)}
                placeholder="Licence number"
                className="h-[30px] w-[160px] rounded-md border bg-white px-2.5 font-mono text-[0.75rem] text-slate-800 placeholder:font-sans placeholder:text-slate-400 outline-none transition focus:border-[#0D2137]/35 focus:ring-1 focus:ring-[#0D2137]/10"
                style={{ borderColor: BORDER }}
              />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold tracking-[0.1em] text-slate-500">CAPTURE CONTEXT</span>
              <div className="relative">
                <select
                  aria-label="Capture context filter"
                  value={roadblockFilter}
                  onChange={(e) => setRoadblockFilter(e.target.value)}
                  className="h-[30px] min-w-[220px] appearance-none rounded-md border bg-white pl-2.5 pr-7 text-[0.75rem] text-slate-800 outline-none transition focus:border-[#0D2137]/35 focus:ring-1 focus:ring-[#0D2137]/10"
                  style={{ borderColor: BORDER }}
                >
                  <option value="">All Capture Contexts</option>
                  {roadblockOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.name}{option.station !== '—' ? ` · ${option.station}` : ''}
                    </option>
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
                    {['TIMESTAMP', 'OFFICER', 'CAPTURE CONTEXT', 'DRIVER LICENCE', 'RESULT', 'READING', 'GPS', 'INTEGRITY'].map((col) => (
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
                  {visibleTests.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-[0.75rem] text-slate-500">
                        {search.trim() || hasActiveFilters ? 'No logs match your filters.' : 'No test records found.'}
                      </td>
                    </tr>
                  ) : (
                    paginatedTests.map((test) => {
                      const failed = test.result === 'fail';
                      const captureContext = getTestRoadblockContext(test);
                      const captureName = captureContext.captureType === 'individual'
                        ? INDIVIDUAL_TEST_LABEL
                        : captureContext.name;
                      const captureDetails = captureContext.captureType === 'individual'
                        ? `${captureContext.station !== '—' ? `Station ${captureContext.station} · ` : ''}${NO_ROADBLOCK_LINK_LABEL}`
                        : `${captureContext.station !== '—' ? `${captureContext.station} · ` : ''}ID ${captureContext.roadblockId ?? '—'}`;
                      return (
                        <tr key={test.id} className="border-b last:border-b-0" style={{ borderColor: BORDER }}>
                          <td className="whitespace-nowrap px-4 py-2.5 text-[0.8125rem] text-slate-700">
                            {formatTimestamp(test.createdAt)}
                          </td>
                          <td className="px-4 py-2.5 text-[0.8125rem] font-medium text-slate-800">
                            {formatOfficerName(test.officerName)}
                          </td>
                          <td className="min-w-[190px] px-4 py-2.5">
                            <p className="max-w-[220px] truncate text-[0.8125rem] font-semibold text-slate-800" title={captureName}>
                              {captureName}
                            </p>
                            <p className="mt-0.5 truncate text-[10px] text-slate-500" title={captureDetails}>
                              {captureDetails}
                            </p>
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
                          <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[0.75rem] text-slate-700">
                            {formatGps(test.location)}
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

          {!filteredLoading && visibleTests.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3" style={{ borderColor: BORDER }}>
              <span className="text-[0.75rem] text-slate-500">
                Showing {firstVisible}-{lastVisible} of {visibleTests.length} logs
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                  aria-label="Previous logs page"
                  className="inline-flex h-[30px] items-center gap-1 rounded-md border px-2.5 text-[0.6875rem] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                  style={{ borderColor: BORDER }}
                >
                  <ChevronLeft size={13} strokeWidth={2} />
                  Previous
                </button>
                <span className="min-w-[76px] text-center text-[0.75rem] font-semibold text-slate-600">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={currentPage === totalPages}
                  aria-label="Next logs page"
                  className="inline-flex h-[30px] items-center gap-1 rounded-md border px-2.5 text-[0.6875rem] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                  style={{ borderColor: BORDER }}
                >
                  Next
                  <ChevronRight size={13} strokeWidth={2} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

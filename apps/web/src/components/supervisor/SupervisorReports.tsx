import { useMemo, useState } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { generateWeeklyEvidencePdf } from '../../lib/generateEvidencePdf';
import type { TestRecord } from '../../types';
import {
  buildResultBreakdown,
  buildWeeklyTrend,
  collectRoadblocks,
  defaultReportDateRange,
  filterTestsForReport,
  type ReportFilters,
  type ReportResultFilter
} from '../../lib/reportAnalytics';
import { DuiTrendChart, ResultPieChart } from './ReportCharts';
import { BORDER, NAVY, PAGE_BG, pageShell } from './supervisorStyles';

interface SupervisorReportsProps {
  tests: TestRecord[];
  loading: boolean;
}

const fieldClassName =
  'h-[32px] w-full rounded-lg border bg-white pl-2.5 pr-2 text-[0.75rem] text-slate-800 outline-none transition focus:border-[#0D2137]/35 focus:ring-1 focus:ring-[#0D2137]/10';

function FilterLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[0.6875rem] font-semibold text-slate-600">{children}</span>;
}

function SelectField({
  label,
  value,
  onChange,
  children
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <FilterLabel>{label}</FilterLabel>
      <div className="relative">
        <select
          className={`${fieldClassName} appearance-none pr-8`}
          style={{ borderColor: BORDER }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {children}
        </select>
        <ChevronDown
          size={14}
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
        />
      </div>
    </label>
  );
}

function DateField({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <FilterLabel>{label}</FilterLabel>
      <div className="relative">
        <input
          type="date"
          className={`${fieldClassName} pr-8 [color-scheme:light]`}
          style={{ borderColor: BORDER }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <Calendar
          size={14}
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
        />
      </div>
    </label>
  );
}

export function SupervisorReports({ tests, loading }: SupervisorReportsProps) {
  const defaults = defaultReportDateRange();
  const [filters, setFilters] = useState<ReportFilters>({
    from: defaults.from,
    to: defaults.to,
    result: 'all',
    roadblock: 'ALL'
  });

  const roadblocks = useMemo(() => collectRoadblocks(tests), [tests]);

  const filtered = useMemo(
    () => filterTestsForReport(tests, filters),
    [tests, filters]
  );

  const trendSeries = useMemo(() => buildWeeklyTrend(filtered), [filtered]);
  const breakdown = useMemo(() => buildResultBreakdown(filtered), [filtered]);

  const updateFilter = <K extends keyof ReportFilters>(key: K, value: ReportFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const handleGeneratePdf = async () => {
    setPdfError(null);
    if (filtered.length === 0) {
      setPdfError('No records match the selected filters.');
      return;
    }

    setGeneratingPdf(true);
    try {
      await generateWeeklyEvidencePdf(filtered, { from: filters.from, to: filters.to });
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Failed to generate PDF');
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <div className={`${pageShell} min-w-0`} style={{ backgroundColor: PAGE_BG }}>
      <header className="flex flex-wrap items-start justify-between gap-3 px-6 pb-3 pt-5">
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight" style={{ color: NAVY }}>
            Reports &amp; Analytics
          </h1>
          <p className="mt-0.5 text-[0.75rem] text-slate-500">
            Court-ready exports and supervisory performance insight
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleGeneratePdf()}
          disabled={generatingPdf || loading}
          className="h-[34px] shrink-0 rounded-lg px-4 text-[0.75rem] font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          style={{ backgroundColor: NAVY }}
        >
          {generatingPdf ? 'Generating PDF…' : 'Generate Weekly PDF Report'}
        </button>
      </header>

      <div className="flex min-w-0 flex-1 flex-col gap-3 px-6 pb-6">
        {pdfError && (
          <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-[0.75rem] text-rose-700">
            {pdfError}
          </div>
        )}
        <div className="rounded-xl border bg-white px-4 py-3.5" style={{ borderColor: BORDER }}>
          <h2 className="mb-3 text-[0.8125rem] font-bold" style={{ color: NAVY }}>
            Filters
          </h2>
          <div className="grid grid-cols-4 gap-3">
            <DateField label="From" value={filters.from} onChange={(v) => updateFilter('from', v)} />
            <DateField label="To" value={filters.to} onChange={(v) => updateFilter('to', v)} />
            <SelectField
              label="Result"
              value={filters.result}
              onChange={(v) => updateFilter('result', v as ReportResultFilter)}
            >
              <option value="all">All Results</option>
              <option value="pass">Passed</option>
              <option value="fail">Failed</option>
            </SelectField>
            <SelectField
              label="Roadblock"
              value={filters.roadblock}
              onChange={(v) => updateFilter('roadblock', v)}
            >
              <option value="ALL">ALL</option>
              {roadblocks.map((rb) => (
                <option key={rb} value={rb}>
                  {rb}
                </option>
              ))}
            </SelectField>
          </div>
          <p className="mt-2.5 text-[0.75rem] text-slate-500">
            {loading
              ? 'Loading records…'
              : `Showing ${filtered.length} record${filtered.length === 1 ? '' : 's'} for selected filters.`}
          </p>
        </div>

        <div className="grid min-w-0 grid-cols-2 gap-3">
          <div
            className="flex min-h-[240px] min-w-0 flex-col rounded-xl border bg-white px-4 py-3"
            style={{ borderColor: BORDER }}
          >
            <h2 className="mb-2 shrink-0 text-[0.8125rem] font-bold" style={{ color: NAVY }}>
              DUI Trends weekly
            </h2>
            <div className="flex min-h-0 flex-1 items-center">
              {loading ? (
                <p className="w-full py-8 text-center text-[0.75rem] text-slate-500">Loading chart…</p>
              ) : (
                <DuiTrendChart series={trendSeries} />
              )}
            </div>
          </div>

          <div
            className="flex min-h-[240px] min-w-0 flex-col rounded-xl border bg-white px-4 py-3"
            style={{ borderColor: BORDER }}
          >
            <h2 className="mb-2 shrink-0 text-[0.8125rem] font-bold" style={{ color: NAVY }}>
              Result Breakdown
            </h2>
            <div className="flex min-h-0 flex-1 items-center justify-center">
              {loading ? (
                <p className="py-8 text-center text-[0.75rem] text-slate-500">Loading chart…</p>
              ) : (
                <ResultPieChart passed={breakdown.passed} failed={breakdown.failed} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

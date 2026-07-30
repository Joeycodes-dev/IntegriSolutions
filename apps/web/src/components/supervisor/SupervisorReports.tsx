import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Gauge,
  Info,
  Lightbulb,
  MapPin,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Users
} from 'lucide-react';
import { generateWeeklyEvidencePdf } from '../../lib/generateEvidencePdf';
import type { TestRecord } from '../../types';
import {
  buildBacDistribution,
  buildDriverCategorySplit,
  buildHourlyHeatmap,
  buildKeyMetrics,
  buildOfficerStats,
  buildPeriodDelta,
  buildResultBreakdown,
  buildRoadblockStats,
  buildTrendSeries,
  collectRoadblocks,
  dataSpanDateRange,
  defaultReportDateRange,
  filterTestsForReport,
  generateInsights,
  parseLocalDate,
  previousPeriodRange,
  type InsightTone,
  type ReportFilters,
  type ReportResultFilter
} from '../../lib/reportAnalytics';
import {
  BacHistogram,
  DuiTrendChart,
  OfficerLeaderboard,
  PeakHoursHeatmap,
  ResultPieChart,
  RoadblockBarChart
} from './ReportCharts';
import { BORDER, NAVY, PAGE_BG, pageShell } from './supervisorStyles';

interface SupervisorReportsProps {
  tests: TestRecord[];
  loading: boolean;
  error?: string | null;
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

/* ---------------- KPI cards ---------------- */

interface KpiCardProps {
  label: string;
  value: string;
  caption?: string;
  icon: typeof Activity;
  iconBg: string;
  iconColor: string;
  delta?: { text: string; direction: 'up' | 'down' | 'flat'; tone: 'good' | 'bad' | 'neutral' } | null;
}

function KpiCard({ label, value, caption, icon: Icon, iconBg, iconColor, delta }: KpiCardProps) {
  return (
    <div
      className="flex min-w-0 flex-col justify-between rounded-xl border bg-white px-3.5 py-3"
      style={{ borderColor: BORDER }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-[9px] font-bold leading-none tracking-[0.14em] text-slate-500">
          {label}
        </p>
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: iconBg }}
        >
          <Icon size={13} strokeWidth={2.25} style={{ color: iconColor }} />
        </div>
      </div>
      <p className="mt-2 text-[1.375rem] font-bold leading-none tabular-nums" style={{ color: NAVY }}>
        {value}
      </p>
      <div className="mt-1.5 flex min-h-[0.875rem] items-center gap-1">
        {delta ? (
          <>
            {delta.direction === 'up' && <TrendingUp size={11} className={delta.tone === 'bad' ? 'text-rose-600' : delta.tone === 'good' ? 'text-emerald-600' : 'text-slate-400'} />}
            {delta.direction === 'down' && <TrendingDown size={11} className={delta.tone === 'bad' ? 'text-rose-600' : delta.tone === 'good' ? 'text-emerald-600' : 'text-slate-400'} />}
            <span
              className={`text-[0.625rem] font-semibold tabular-nums ${
                delta.tone === 'bad' ? 'text-rose-600' : delta.tone === 'good' ? 'text-emerald-600' : 'text-slate-500'
              }`}
            >
              {delta.text}
            </span>
          </>
        ) : (
          caption && <span className="truncate text-[0.625rem] text-slate-400">{caption}</span>
        )}
      </div>
    </div>
  );
}

/* ---------------- Section wrapper ---------------- */

function SectionCard({
  title,
  subtitle,
  icon: Icon,
  children,
  className = ''
}: {
  title: string;
  subtitle?: string;
  icon?: typeof Activity;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex min-w-0 flex-col rounded-xl border bg-white px-4 py-3 ${className}`}
      style={{ borderColor: BORDER }}
    >
      <div className="mb-2.5 flex shrink-0 items-center gap-2">
        {Icon && <Icon size={14} className="shrink-0 text-slate-400" />}
        <div className="min-w-0">
          <h2 className="text-[0.8125rem] font-bold leading-tight" style={{ color: NAVY }}>
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-[0.625rem] leading-snug text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/* ---------------- Insights panel ---------------- */

const INSIGHT_STYLES: Record<InsightTone, { icon: typeof Info; chip: string; iconColor: string }> = {
  critical: { icon: ShieldAlert, chip: 'bg-rose-50 border-rose-100', iconColor: '#DC2626' },
  warning: { icon: AlertTriangle, chip: 'bg-amber-50 border-amber-100', iconColor: '#D97706' },
  positive: { icon: CheckCircle2, chip: 'bg-emerald-50 border-emerald-100', iconColor: '#059669' },
  info: { icon: Info, chip: 'bg-sky-50 border-sky-100', iconColor: '#2563EB' }
};

/* ---------------- Main component ---------------- */

export function SupervisorReports({ tests, loading, error = null }: SupervisorReportsProps) {
  const defaults = defaultReportDateRange();
  const [filters, setFilters] = useState<ReportFilters>({
    from: defaults.from,
    to: defaults.to,
    result: 'all',
    roadblock: 'ALL'
  });
  const [rangeInitialized, setRangeInitialized] = useState(false);

  // Once tests load, expand the date range to cover real data so charts aren't empty.
  useEffect(() => {
    if (rangeInitialized || loading || tests.length === 0) return;
    const span = dataSpanDateRange(tests);
    if (!span) return;
    setFilters((prev) => ({ ...prev, from: span.from, to: span.to }));
    setRangeInitialized(true);
  }, [tests, loading, rangeInitialized]);

  const roadblocks = useMemo(() => collectRoadblocks(tests), [tests]);

  const filtered = useMemo(
    () => filterTestsForReport(tests, filters),
    [tests, filters]
  );

  const trend = useMemo(
    () => buildTrendSeries(filtered, filters.from, filters.to),
    [filtered, filters.from, filters.to]
  );
  const breakdown = useMemo(() => buildResultBreakdown(filtered), [filtered]);

  /* ---------- insight layer ---------- */

  const metrics = useMemo(() => buildKeyMetrics(filtered), [filtered]);

  const delta = useMemo(() => {
    const prevRange = previousPeriodRange(filters.from, filters.to);
    if (!prevRange) return { failureRatePts: null, volumePct: null };
    const previous = filterTestsForReport(tests, {
      ...filters,
      from: prevRange.from,
      to: prevRange.to
    });
    return buildPeriodDelta(filtered, previous);
  }, [tests, filtered, filters]);

  const roadblockStats = useMemo(() => buildRoadblockStats(filtered), [filtered]);
  const heatmap = useMemo(() => buildHourlyHeatmap(filtered), [filtered]);
  const bacBuckets = useMemo(() => buildBacDistribution(filtered), [filtered]);
  const officerStats = useMemo(() => buildOfficerStats(filtered), [filtered]);
  const categories = useMemo(() => buildDriverCategorySplit(filtered), [filtered]);

  const insights = useMemo(
    () => generateInsights({ metrics, delta, roadblocks: roadblockStats, heatmap, officers: officerStats, categories }),
    [metrics, delta, roadblockStats, heatmap, officerStats, categories]
  );

  const daySpan = useMemo(() => {
    const from = parseLocalDate(filters.from).getTime();
    const to = parseLocalDate(filters.to).getTime();
    if (Number.isNaN(from) || Number.isNaN(to) || to < from) return 0;
    return Math.round((to - from) / (24 * 60 * 60 * 1000)) + 1;
  }, [filters.from, filters.to]);

  const trendTitle = daySpan > 14 ? 'DUI Trends (weekly)' : 'DUI Trends (daily)';

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

  const statusMessage = (() => {
    if (loading) return 'Loading records…';
    if (error) return error;
    if (tests.length === 0) return 'No test records available yet.';
    if (filtered.length === 0) {
      return `No records match these filters (${tests.length} total available). Adjust dates or filters.`;
    }
    return `Showing ${filtered.length} of ${tests.length} record${tests.length === 1 ? '' : 's'} for selected filters.`;
  })();

  const failureRateDelta = (() => {
    if (delta.failureRatePts == null) return null;
    const pts = delta.failureRatePts;
    if (Math.abs(pts) < 0.05) {
      return { text: 'No change vs previous period', direction: 'flat' as const, tone: 'neutral' as const };
    }
    // Rising failure rate is bad; falling is good.
    return pts > 0
      ? { text: `+${pts} pts vs previous period`, direction: 'up' as const, tone: 'bad' as const }
      : { text: `${pts} pts vs previous period`, direction: 'down' as const, tone: 'good' as const };
  })();

  const volumeDelta = (() => {
    if (delta.volumePct == null) return null;
    const pct = delta.volumePct;
    if (pct === 0) return { text: 'Same volume as previous period', direction: 'flat' as const, tone: 'neutral' as const };
    return pct > 0
      ? { text: `+${pct}% vs previous period`, direction: 'up' as const, tone: 'neutral' as const }
      : { text: `${pct}% vs previous period`, direction: 'down' as const, tone: 'neutral' as const };
  })();

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
          className="h-[34px] shrink-0 cursor-pointer rounded-lg px-4 text-[0.75rem] font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
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
        {error && !loading && (
          <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-[0.75rem] text-rose-700">
            {error}
          </div>
        )}

        {/* Filters */}
        <div className="rounded-xl border bg-white px-4 py-3.5" style={{ borderColor: BORDER }}>
          <h2 className="mb-3 text-[0.8125rem] font-bold" style={{ color: NAVY }}>
            Filters
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
          <p className={`mt-2.5 text-[0.75rem] ${error ? 'text-rose-600' : 'text-slate-500'}`}>
            {statusMessage}
          </p>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            label="TOTAL TESTS"
            value={loading ? '—' : String(metrics.total)}
            icon={Activity}
            iconBg="#DBEAFE"
            iconColor="#2563EB"
            delta={volumeDelta}
          />
          <KpiCard
            label="FAILURE RATE"
            value={loading ? '—' : `${metrics.failureRate}%`}
            icon={Gauge}
            iconBg="#FEE2E2"
            iconColor="#DC2626"
            delta={failureRateDelta}
          />
          <KpiCard
            label="FAILURES"
            value={loading ? '—' : String(metrics.failed)}
            icon={ShieldAlert}
            iconBg="#FEE2E2"
            iconColor="#DC2626"
            caption={metrics.peakDayLabel ? `Peak day: ${metrics.peakDayLabel}` : 'No failures in range'}
          />
          <KpiCard
            label="AVG FAILING BAC"
            value={loading ? '—' : metrics.avgBacOfFailures > 0 ? metrics.avgBacOfFailures.toFixed(3) : '0.000'}
            icon={Gauge}
            iconBg="#FFEDD5"
            iconColor="#EA580C"
            caption="g/100ml · limit 0.05"
          />
          <KpiCard
            label="ACTIVE OFFICERS"
            value={loading ? '—' : String(metrics.activeOfficers)}
            icon={Users}
            iconBg="#EDE9FE"
            iconColor="#7C3AED"
            caption="Captured ≥1 test in range"
          />
          <KpiCard
            label="INTEGRITY FLAGS"
            value={loading ? '—' : String(metrics.integrityFlags)}
            icon={metrics.integrityFlags > 0 ? ShieldAlert : ShieldCheck}
            iconBg={metrics.integrityFlags > 0 ? '#FEE2E2' : '#D1FAE5'}
            iconColor={metrics.integrityFlags > 0 ? '#DC2626' : '#059669'}
            caption={metrics.integrityFlags > 0 ? 'Hash mismatches — review' : 'All records verified'}
          />
        </div>

        {/* Auto-generated insights */}
        {!loading && insights.length > 0 && (
          <SectionCard title="Key Insights" subtitle="Auto-generated from the selected period" icon={Lightbulb}>
            <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              {insights.map((insight) => {
                const style = INSIGHT_STYLES[insight.tone];
                const Icon = style.icon;
                return (
                  <li
                    key={insight.title}
                    className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 ${style.chip}`}
                  >
                    <Icon size={15} strokeWidth={2.25} className="mt-0.5 shrink-0" style={{ color: style.iconColor }} />
                    <div className="min-w-0">
                      <p className="text-[0.75rem] font-bold leading-snug text-slate-800">{insight.title}</p>
                      <p className="mt-0.5 text-[0.6875rem] leading-snug text-slate-600">{insight.detail}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </SectionCard>
        )}

        {/* Trend + breakdown */}
        <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-3">
          <SectionCard
            title={trendTitle}
            subtitle="Test volume, failures and pass rate over time"
            icon={Activity}
            className="min-h-[280px] lg:col-span-2"
          >
            <div className="flex min-h-0 flex-1 items-center">
              {loading ? (
                <p className="w-full py-8 text-center text-[0.75rem] text-slate-500">Loading chart…</p>
              ) : (
                <DuiTrendChart series={trend.series} labels={trend.labels} />
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="Result Breakdown"
            subtitle="Pass vs fail for selected filters"
            icon={Gauge}
            className="min-h-[280px]"
          >
            <div className="flex min-h-0 flex-1 items-center justify-center">
              {loading ? (
                <p className="py-8 text-center text-[0.75rem] text-slate-500">Loading chart…</p>
              ) : (
                <ResultPieChart passed={breakdown.passed} failed={breakdown.failed} />
              )}
            </div>
          </SectionCard>
        </div>

        {/* Roadblocks + BAC distribution */}
        <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
          <SectionCard
            title="Failures by Roadblock"
            subtitle="Highest-yield checkpoints, ranked by failed tests"
            icon={MapPin}
            className="min-h-[260px]"
          >
            <div className="flex min-h-0 flex-1 items-center">
              {loading ? (
                <p className="w-full py-8 text-center text-[0.75rem] text-slate-500">Loading chart…</p>
              ) : (
                <RoadblockBarChart stats={roadblockStats} />
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="BAC Distribution"
            subtitle="How far over the legal limit readings fall"
            icon={Gauge}
            className="min-h-[260px]"
          >
            <div className="flex min-h-0 flex-1 items-center">
              {loading ? (
                <p className="w-full py-8 text-center text-[0.75rem] text-slate-500">Loading chart…</p>
              ) : (
                <BacHistogram buckets={bacBuckets} />
              )}
            </div>
          </SectionCard>
        </div>

        {/* Peak hours + officer leaderboard */}
        <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
          <SectionCard
            title="Peak Offence Hours"
            subtitle="Failed tests by day of week and hour — plan staffing"
            icon={Clock}
            className="min-h-[240px]"
          >
            <div className="flex min-h-0 flex-1 items-center">
              {loading ? (
                <p className="w-full py-8 text-center text-[0.75rem] text-slate-500">Loading chart…</p>
              ) : (
                <PeakHoursHeatmap data={heatmap} />
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="Officer Activity Leaderboard"
            subtitle="Most active officers in the selected period"
            icon={Users}
            className="min-h-[240px]"
          >
            <div className="flex min-h-0 flex-1 items-center">
              {loading ? (
                <p className="w-full py-8 text-center text-[0.75rem] text-slate-500">Loading…</p>
              ) : (
                <OfficerLeaderboard officers={officerStats} />
              )}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

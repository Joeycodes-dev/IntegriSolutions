import { parseTestLocation } from './testEvidence';
import type { TestRecord } from '../types';

export type ReportResultFilter = 'all' | 'pass' | 'fail';

export interface ReportFilters {
  from: string;
  to: string;
  result: ReportResultFilter;
  roadblock: string;
}

export interface TestRoadblockContext {
  key: string;
  roadblockId: string | null;
  name: string;
  station: string;
  supervisor: string;
  shiftStartsAt: string | null;
  shiftEndsAt: string | null;
}

export interface RoadblockOption {
  key: string;
  roadblockId: string | null;
  name: string;
  station: string;
}

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
  values: number[];
  axis: 'left' | 'right';
}

export interface TrendChartData {
  labels: string[];
  series: TrendSeries[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function toIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse YYYY-MM-DD as a local calendar date (avoids UTC shift). */
export function parseLocalDate(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function defaultReportDateRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 6);
  return { from: toIsoDate(from), to: toIsoDate(to) };
}

/** Span covering all test timestamps (local calendar days). */
export function dataSpanDateRange(tests: TestRecord[]): { from: string; to: string } | null {
  const times = tests
    .map((t) => new Date(t.createdAt).getTime())
    .filter((ms) => !Number.isNaN(ms));
  if (times.length === 0) return null;

  const min = new Date(Math.min(...times));
  const max = new Date(Math.max(...times));
  return { from: toIsoDate(min), to: toIsoDate(max) };
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

export function weekdayIndex(iso: string): number {
  const date = new Date(iso);
  const day = date.getDay();
  return day === 0 ? 6 : day - 1;
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function getTestRoadblockContext(test: TestRecord): TestRoadblockContext {
  const parsed = parseTestLocation(test.location);
  const merged = { ...parsed, ...test.evidence };
  const roadblockId = firstText(merged.roadblockId);
  const name = firstText(merged.roadblock, merged.station, merged.label, merged.locationLabel) ?? 'Unspecified';
  const station = firstText(merged.station) ?? '—';

  return {
    key: roadblockId ?? `legacy:${name.toLowerCase()}|${station.toLowerCase()}`,
    roadblockId,
    name,
    station,
    supervisor: firstText(merged.supervisorName, merged.supervisorEmail) ?? '—',
    shiftStartsAt: firstText(merged.shiftStartsAt),
    shiftEndsAt: firstText(merged.shiftEndsAt)
  };
}

export function getTestRoadblock(test: TestRecord): string {
  return getTestRoadblockContext(test).name;
}

export function getTestRoadblockKey(test: TestRecord): string {
  return getTestRoadblockContext(test).key;
}

export function collectRoadblockOptions(tests: TestRecord[]): RoadblockOption[] {
  const options = new Map<string, RoadblockOption>();
  for (const test of tests) {
    const context = getTestRoadblockContext(test);
    if (!options.has(context.key)) {
      options.set(context.key, {
        key: context.key,
        roadblockId: context.roadblockId,
        name: context.name,
        station: context.station
      });
    }
  }
  return Array.from(options.values()).sort(
    (a, b) => a.name.localeCompare(b.name) || a.station.localeCompare(b.station)
  );
}

export function collectRoadblocks(tests: TestRecord[]): string[] {
  return Array.from(new Set(collectRoadblockOptions(tests).map((option) => option.name))).sort((a, b) =>
    a.localeCompare(b)
  );
}

export function filterTestsForReport(tests: TestRecord[], filters: ReportFilters): TestRecord[] {
  const fromMs = startOfDay(parseLocalDate(filters.from)).getTime();
  const toMs = endOfDay(parseLocalDate(filters.to)).getTime();

  return tests.filter((test) => {
    const created = new Date(test.createdAt).getTime();
    if (Number.isNaN(created) || created < fromMs || created > toMs) return false;
    if (filters.result !== 'all' && test.result !== filters.result) return false;
    const roadblock = getTestRoadblockContext(test);
    if (
      filters.roadblock !== 'ALL' &&
      filters.roadblock !== roadblock.key &&
      filters.roadblock !== roadblock.name
    ) {
      return false;
    }
    return true;
  });
}

function eachCalendarDay(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  const cursor = startOfDay(from);
  const end = startOfDay(to);
  while (cursor.getTime() <= end.getTime()) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function dayKey(d: Date): string {
  return toIsoDate(d);
}

function formatDayLabel(d: Date, includeDate: boolean): string {
  const wd = WEEKDAY_LABELS[d.getDay() === 0 ? 6 : d.getDay() - 1];
  if (!includeDate) return wd;
  return `${wd} ${d.getDate()}`;
}

function formatWeekLabel(start: Date): string {
  return `${start.getDate()}/${start.getMonth() + 1}`;
}

function toSeries(totals: number[], fails: number[]): TrendSeries[] {
  const passRates = totals.map((total, i) =>
    total === 0 ? 0 : Math.round(((total - fails[i]) / total) * 100)
  );

  return [
    { key: 'failures', label: 'Failures', color: '#EF4444', values: fails, axis: 'left' },
    { key: 'tests', label: 'Tests', color: '#8B5CF6', values: totals, axis: 'left' },
    { key: 'passRate', label: 'Pass rate %', color: '#22C55E', values: passRates, axis: 'right' }
  ];
}

/**
 * Build a time-series trend for the selected date range.
 * ≤14 days → daily buckets; longer ranges → weekly buckets.
 */
export function buildTrendSeries(
  tests: TestRecord[],
  from: string,
  to: string
): TrendChartData {
  const start = startOfDay(parseLocalDate(from));
  const end = startOfDay(parseLocalDate(to));
  if (end.getTime() < start.getTime()) {
    return { labels: [], series: toSeries([], []) };
  }

  const dayCount = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
  const byDay = new Map<string, { total: number; fail: number }>();

  for (const test of tests) {
    const created = new Date(test.createdAt);
    if (Number.isNaN(created.getTime())) continue;
    const key = dayKey(created);
    const bucket = byDay.get(key) ?? { total: 0, fail: 0 };
    bucket.total += 1;
    if (test.result === 'fail') bucket.fail += 1;
    byDay.set(key, bucket);
  }

  if (dayCount <= 14) {
    const days = eachCalendarDay(start, end);
    const includeDate = dayCount > 7;
    const labels = days.map((d) => formatDayLabel(d, includeDate));
    const totals = days.map((d) => byDay.get(dayKey(d))?.total ?? 0);
    const fails = days.map((d) => byDay.get(dayKey(d))?.fail ?? 0);
    return { labels, series: toSeries(totals, fails) };
  }

  const labels: string[] = [];
  const totals: number[] = [];
  const fails: number[] = [];
  const weekStart = new Date(start);

  while (weekStart.getTime() <= end.getTime()) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    if (weekEnd.getTime() > end.getTime()) weekEnd.setTime(end.getTime());

    let total = 0;
    let fail = 0;
    for (const day of eachCalendarDay(weekStart, weekEnd)) {
      const bucket = byDay.get(dayKey(day));
      if (!bucket) continue;
      total += bucket.total;
      fail += bucket.fail;
    }

    labels.push(formatWeekLabel(weekStart));
    totals.push(total);
    fails.push(fail);
    weekStart.setDate(weekStart.getDate() + 7);
  }

  return { labels, series: toSeries(totals, fails) };
}

/** Weekday fold of filtered tests (Mon–Sun). Prefer buildTrendSeries for charts. */
export function buildWeeklyTrend(tests: TestRecord[]): TrendSeries[] {
  const buckets = Array.from({ length: 7 }, () => ({ total: 0, fail: 0 }));

  for (const test of tests) {
    const idx = weekdayIndex(test.createdAt);
    buckets[idx].total += 1;
    if (test.result === 'fail') buckets[idx].fail += 1;
  }

  return toSeries(
    buckets.map((b) => b.total),
    buckets.map((b) => b.fail)
  );
}

export function buildResultBreakdown(tests: TestRecord[]) {
  const passed = tests.filter((t) => t.result === 'pass').length;
  const failed = tests.filter((t) => t.result === 'fail').length;
  return { passed, failed, total: passed + failed };
}

/* ------------------------------------------------------------------ */
/* Insight-layer analytics (KPIs, rankings, heatmaps, auto-insights)  */
/* ------------------------------------------------------------------ */

export interface ReportKeyMetrics {
  total: number;
  failed: number;
  failureRate: number;
  avgBacOfFailures: number;
  activeOfficers: number;
  integrityFlags: number;
  peakDayLabel: string | null;
}

export function buildKeyMetrics(tests: TestRecord[]): ReportKeyMetrics {
  let failed = 0;
  let bacSum = 0;
  let bacCount = 0;
  let integrityFlags = 0;
  const officers = new Set<string>();
  const byDay = new Map<string, number>();

  for (const test of tests) {
    if (test.result === 'fail') {
      failed += 1;
      if (Number.isFinite(test.bacReading)) {
        bacSum += test.bacReading;
        bacCount += 1;
      }
    }
    if (test.hashValid === false) integrityFlags += 1;
    if (test.officerName?.trim()) officers.add(test.officerName.trim());

    const created = new Date(test.createdAt);
    if (!Number.isNaN(created.getTime())) {
      const key = dayKey(created);
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
  }

  let peakDayLabel: string | null = null;
  let peakCount = 0;
  for (const [key, count] of byDay) {
    if (count > peakCount) {
      peakCount = count;
      const d = parseLocalDate(key);
      peakDayLabel = `${WEEKDAY_LABELS[d.getDay() === 0 ? 6 : d.getDay() - 1]} ${d.getDate()}/${d.getMonth() + 1}`;
    }
  }

  return {
    total: tests.length,
    failed,
    failureRate: tests.length === 0 ? 0 : Math.round((failed / tests.length) * 1000) / 10,
    avgBacOfFailures: bacCount === 0 ? 0 : Math.round((bacSum / bacCount) * 1000) / 1000,
    activeOfficers: officers.size,
    integrityFlags,
    peakDayLabel
  };
}

/** Equivalent-length period immediately before [from, to]. */
export function previousPeriodRange(from: string, to: string): { from: string; to: string } | null {
  const start = startOfDay(parseLocalDate(from));
  const end = startOfDay(parseLocalDate(to));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;
  const days = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (days - 1));
  return { from: toIsoDate(prevStart), to: toIsoDate(prevEnd) };
}

export interface PeriodDelta {
  /** Percentage-point change in failure rate (current - previous). */
  failureRatePts: number | null;
  /** % change in test volume (current vs previous). */
  volumePct: number | null;
}

export function buildPeriodDelta(current: TestRecord[], previous: TestRecord[]): PeriodDelta {
  if (previous.length === 0) return { failureRatePts: null, volumePct: null };
  const curFails = current.filter((t) => t.result === 'fail').length;
  const prevFails = previous.filter((t) => t.result === 'fail').length;
  const curRate = current.length === 0 ? 0 : (curFails / current.length) * 100;
  const prevRate = (prevFails / previous.length) * 100;
  return {
    failureRatePts: Math.round((curRate - prevRate) * 10) / 10,
    volumePct: Math.round(((current.length - previous.length) / previous.length) * 100)
  };
}

export interface RoadblockStat {
  key: string;
  roadblockId: string | null;
  name: string;
  station: string;
  supervisor: string;
  shiftStartsAt: string | null;
  shiftEndsAt: string | null;
  total: number;
  passed: number;
  failed: number;
  failureRate: number;
  officerCount: number;
  averageBac: number;
}

export function buildRoadblockStats(tests: TestRecord[]): RoadblockStat[] {
  const map = new Map<
    string,
    {
      context: TestRoadblockContext;
      total: number;
      failed: number;
      officers: Set<string>;
      bacTotal: number;
      bacCount: number;
    }
  >();

  for (const test of tests) {
    const context = getTestRoadblockContext(test);
    const bucket =
      map.get(context.key) ??
      {
        context,
        total: 0,
        failed: 0,
        officers: new Set<string>(),
        bacTotal: 0,
        bacCount: 0
      };

    bucket.total += 1;
    if (test.result === 'fail') bucket.failed += 1;
    if (Number.isFinite(test.bacReading)) {
      bucket.bacTotal += test.bacReading;
      bucket.bacCount += 1;
    }
    const officer = test.officerId != null ? String(test.officerId) : test.officerName?.trim();
    if (officer) bucket.officers.add(officer);
    map.set(context.key, bucket);
  }

  return Array.from(map.entries())
    .map(([key, bucket]) => ({
      key,
      roadblockId: bucket.context.roadblockId,
      name: bucket.context.name,
      station: bucket.context.station,
      supervisor: bucket.context.supervisor,
      shiftStartsAt: bucket.context.shiftStartsAt,
      shiftEndsAt: bucket.context.shiftEndsAt,
      total: bucket.total,
      passed: bucket.total - bucket.failed,
      failed: bucket.failed,
      failureRate: bucket.total === 0 ? 0 : Math.round((bucket.failed / bucket.total) * 1000) / 10,
      officerCount: bucket.officers.size,
      averageBac: bucket.bacCount === 0 ? 0 : Math.round((bucket.bacTotal / bucket.bacCount) * 1000) / 1000
    }))
    .sort((a, b) => b.failed - a.failed || b.total - a.total || a.name.localeCompare(b.name));
}

/** 7 weekday rows (Mon–Sun) x 24 hour columns. */
export interface HourlyHeatmapData {
  /** counts[row][hour] — failed tests */
  fails: number[][];
  /** counts[row][hour] — all tests */
  totals: number[][];
  maxFail: number;
  peak: { dayLabel: string; hour: number; fails: number } | null;
}

export function buildHourlyHeatmap(tests: TestRecord[]): HourlyHeatmapData {
  const fails = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const totals = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  let maxFail = 0;
  let peak: HourlyHeatmapData['peak'] = null;

  for (const test of tests) {
    const created = new Date(test.createdAt);
    if (Number.isNaN(created.getTime())) continue;
    const row = created.getDay() === 0 ? 6 : created.getDay() - 1;
    const hour = created.getHours();
    totals[row][hour] += 1;
    if (test.result === 'fail') {
      fails[row][hour] += 1;
      if (fails[row][hour] > maxFail) {
        maxFail = fails[row][hour];
        peak = { dayLabel: WEEKDAY_LABELS[row], hour, fails: fails[row][hour] };
      }
    }
  }

  return { fails, totals, maxFail, peak };
}

export interface BacBucket {
  label: string;
  min: number;
  count: number;
  failed: number;
}

/** BAC distribution in g/100ml, aligned to SA legal limits (0.02 prof / 0.05 gen). */
export function buildBacDistribution(tests: TestRecord[]): BacBucket[] {
  const edges: Array<{ label: string; min: number }> = [
    { label: '0.00–0.02', min: 0 },
    { label: '0.02–0.05', min: 0.02 },
    { label: '0.05–0.08', min: 0.05 },
    { label: '0.08–0.10', min: 0.08 },
    { label: '0.10–0.15', min: 0.1 },
    { label: '0.15+', min: 0.15 }
  ];
  const buckets: BacBucket[] = edges.map((e) => ({ ...e, count: 0, failed: 0 }));

  for (const test of tests) {
    const bac = test.bacReading;
    if (!Number.isFinite(bac) || bac < 0) continue;
    let idx = buckets.length - 1;
    for (let i = 0; i < edges.length; i += 1) {
      const nextMin = edges[i + 1]?.min ?? Number.POSITIVE_INFINITY;
      if (bac >= edges[i].min && bac < nextMin) {
        idx = i;
        break;
      }
    }
    buckets[idx].count += 1;
    if (test.result === 'fail') buckets[idx].failed += 1;
  }
  return buckets;
}

export interface OfficerStat {
  name: string;
  badge: string;
  total: number;
  failed: number;
  failureRate: number;
}

export function buildOfficerStats(tests: TestRecord[]): OfficerStat[] {
  const map = new Map<string, { badge: string; total: number; failed: number }>();
  for (const test of tests) {
    const name = test.officerName?.trim() || 'Unknown officer';
    const bucket = map.get(name) ?? { badge: test.badgeNumber || '—', total: 0, failed: 0 };
    bucket.total += 1;
    if (test.result === 'fail') bucket.failed += 1;
    map.set(name, bucket);
  }
  return Array.from(map.entries())
    .map(([name, b]) => ({
      name,
      badge: b.badge,
      total: b.total,
      failed: b.failed,
      failureRate: b.total === 0 ? 0 : Math.round((b.failed / b.total) * 1000) / 10
    }))
    .sort((a, b) => b.total - a.total || b.failed - a.failed);
}

export interface DriverCategorySplit {
  professional: number;
  general: number;
  professionalFailed: number;
  generalFailed: number;
}

export function buildDriverCategorySplit(tests: TestRecord[]): DriverCategorySplit {
  const split: DriverCategorySplit = {
    professional: 0,
    general: 0,
    professionalFailed: 0,
    generalFailed: 0
  };
  for (const test of tests) {
    const parsed = parseTestLocation(test.location);
    const merged = { ...parsed, ...test.evidence };
    const categoryKey = merged.driverCategoryKey ?? '';
    const category = merged.driverCategory ?? '';
    const isProfessional =
      categoryKey === 'professional' || (!categoryKey && category.includes('0.02'));
    if (isProfessional) {
      split.professional += 1;
      if (test.result === 'fail') split.professionalFailed += 1;
    } else {
      split.general += 1;
      if (test.result === 'fail') split.generalFailed += 1;
    }
  }
  return split;
}

export type InsightTone = 'warning' | 'critical' | 'positive' | 'info';

export interface ReportInsight {
  tone: InsightTone;
  title: string;
  detail: string;
}

export interface AlertThresholds {
  integrityFlagCount: number;
  failureRateChangePoints: number;
  roadblockMinimumTests: number;
  avgFailingBacMultiple: number;
}

export const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = {
  integrityFlagCount: 1,
  failureRateChangePoints: 1,
  roadblockMinimumTests: 3,
  avgFailingBacMultiple: 2
};

interface InsightInput {
  metrics: ReportKeyMetrics;
  delta: PeriodDelta;
  roadblocks: RoadblockStat[];
  heatmap: HourlyHeatmapData;
  officers: OfficerStat[];
  categories: DriverCategorySplit;
}

/** Auto-generated supervisory insights, ordered by importance. Thresholds come from admin configuration. */
export function generateInsights(
  input: InsightInput,
  thresholds: AlertThresholds = DEFAULT_ALERT_THRESHOLDS
): ReportInsight[] {
  const { metrics, delta, roadblocks, heatmap, officers, categories } = input;
  const insights: ReportInsight[] = [];

  if (metrics.integrityFlags >= thresholds.integrityFlagCount) {
    insights.push({
      tone: 'critical',
      title: `${metrics.integrityFlags} record${metrics.integrityFlags === 1 ? '' : 's'} failed integrity verification`,
      detail: 'SHA-256 hash mismatch detected. Quarantine these records before court export.'
    });
  }

  if (delta.failureRatePts != null && Math.abs(delta.failureRatePts) >= thresholds.failureRateChangePoints) {
    const rising = delta.failureRatePts > 0;
    insights.push({
      tone: rising ? 'warning' : 'positive',
      title: `Failure rate ${rising ? 'up' : 'down'} ${Math.abs(delta.failureRatePts)} pts vs previous period`,
      detail: rising
        ? 'Non-compliance is trending upward — consider increased roadblock frequency.'
        : 'Compliance is improving against the previous equivalent period.'
    });
  }

  if (heatmap.peak && heatmap.peak.fails > 0) {
    const endHour = (heatmap.peak.hour + 1) % 24;
    const fmt = (h: number) => `${String(h).padStart(2, '0')}:00`;
    insights.push({
      tone: 'info',
      title: `Peak offence window: ${heatmap.peak.dayLabel} ${fmt(heatmap.peak.hour)}–${fmt(endHour)}`,
      detail: `${heatmap.peak.fails} failed test${heatmap.peak.fails === 1 ? '' : 's'} recorded in this hour. Prioritise staffing here.`
    });
  }

  const riskiest = roadblocks.find((r) => r.total >= thresholds.roadblockMinimumTests && r.failed > 0);
  if (riskiest) {
    insights.push({
      tone: 'warning',
      title: `${riskiest.name} is the highest-yield checkpoint`,
      detail: `${riskiest.failed} failure${riskiest.failed === 1 ? '' : 's'} from ${riskiest.total} tests (${riskiest.failureRate}% failure rate).`
    });
  }

  if (categories.professionalFailed > 0) {
    insights.push({
      tone: 'warning',
      title: `${categories.professionalFailed} professional driver${categories.professionalFailed === 1 ? '' : 's'} over the 0.02 limit`,
      detail: 'Professional permit holders failing screening carry elevated public-transport risk.'
    });
  }

  const topOfficer = officers[0];
  if (topOfficer && topOfficer.total > 0) {
    insights.push({
      tone: 'positive',
      title: `${topOfficer.name} leads activity with ${topOfficer.total} tests`,
      detail: `${topOfficer.failed} failure${topOfficer.failed === 1 ? '' : 's'} recorded (${topOfficer.failureRate}% failure rate).`
    });
  }

  if (metrics.avgBacOfFailures > 0) {
    const multiple = Math.round((metrics.avgBacOfFailures / 0.05) * 10) / 10;
    insights.push({
      tone: multiple >= thresholds.avgFailingBacMultiple ? 'critical' : 'info',
      title: `Average failing BAC is ${metrics.avgBacOfFailures.toFixed(3)} g/100ml`,
      detail: `That is ${multiple}× the general legal limit (0.05 g/100ml).`
    });
  }

  return insights.slice(0, 5);
}

/** Evenly spaced axis ticks from 0 to at least `max`. */
export function niceTicks(max: number, tickCount = 5): number[] {
  if (!Number.isFinite(max) || max <= 0) {
    return Array.from({ length: tickCount }, (_, i) => i);
  }

  const rough = max / (tickCount - 1);
  const power = Math.pow(10, Math.floor(Math.log10(rough)));
  const candidates = [1, 2, 2.5, 5, 10].map((c) => c * power);
  const step = candidates.find((c) => c >= rough) ?? candidates[candidates.length - 1];
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= niceMax + step / 1000; v += step) {
    ticks.push(Math.round(v * 1000) / 1000);
  }
  return ticks;
}

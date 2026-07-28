import { parseTestLocation } from './testEvidence';
import type { TestRecord } from '../types';

export type ReportResultFilter = 'all' | 'pass' | 'fail';

export interface ReportFilters {
  from: string;
  to: string;
  result: ReportResultFilter;
  roadblock: string;
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

export function getTestRoadblock(test: TestRecord): string {
  const parsed = parseTestLocation(test.location);
  const value =
    test.evidence?.roadblock ||
    parsed.roadblock ||
    parsed.station ||
    test.evidence?.station ||
    parsed.label ||
    test.evidence?.locationLabel;
  return value?.trim() || 'Unspecified';
}

export function collectRoadblocks(tests: TestRecord[]): string[] {
  const set = new Set<string>();
  for (const test of tests) {
    set.add(getTestRoadblock(test));
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function filterTestsForReport(tests: TestRecord[], filters: ReportFilters): TestRecord[] {
  const fromMs = startOfDay(parseLocalDate(filters.from)).getTime();
  const toMs = endOfDay(parseLocalDate(filters.to)).getTime();

  return tests.filter((test) => {
    const created = new Date(test.createdAt).getTime();
    if (Number.isNaN(created) || created < fromMs || created > toMs) return false;
    if (filters.result !== 'all' && test.result !== filters.result) return false;
    if (filters.roadblock !== 'ALL' && getTestRoadblock(test) !== filters.roadblock) {
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

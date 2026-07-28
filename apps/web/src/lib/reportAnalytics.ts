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

export function toIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function defaultReportDateRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 6);
  return { from: toIsoDate(from), to: toIsoDate(to) };
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
  const day = new Date(iso).getDay();
  return day === 0 ? 6 : day - 1;
}

export function getTestRoadblock(test: TestRecord): string {
  const parsed = parseTestLocation(test.location);
  const value = parsed.roadblock || parsed.station || parsed.label;
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
  const fromMs = startOfDay(new Date(filters.from)).getTime();
  const toMs = endOfDay(new Date(filters.to)).getTime();

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

export function buildWeeklyTrend(tests: TestRecord[]): TrendSeries[] {
  const buckets = Array.from({ length: 7 }, () => ({ total: 0, fail: 0 }));

  for (const test of tests) {
    const idx = weekdayIndex(test.createdAt);
    buckets[idx].total += 1;
    if (test.result === 'fail') buckets[idx].fail += 1;
  }

  const totals = buckets.map((b) => b.total);
  const fails = buckets.map((b) => b.fail);
  const passRates = buckets.map((b) =>
    b.total === 0 ? 0 : Math.round(((b.total - b.fail) / b.total) * 100)
  );

  return [
    { key: 'failures', label: 'Failures', color: '#EF4444', values: fails, axis: 'left' },
    { key: 'tests', label: 'Tests', color: '#8B5CF6', values: totals, axis: 'left' },
    { key: 'passRate', label: 'Pass rate %', color: '#22C55E', values: passRates, axis: 'right' }
  ];
}

export function buildResultBreakdown(tests: TestRecord[]) {
  const passed = tests.filter((t) => t.result === 'pass').length;
  const failed = tests.filter((t) => t.result === 'fail').length;
  return { passed, failed, total: passed + failed };
}

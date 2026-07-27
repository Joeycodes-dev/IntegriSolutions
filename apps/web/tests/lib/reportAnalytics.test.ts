import { describe, expect, it } from 'vitest';
import {
  buildResultBreakdown,
  buildTrendSeries,
  buildWeeklyTrend,
  dataSpanDateRange,
  filterTestsForReport,
  niceTicks,
  parseLocalDate,
  weekdayIndex
} from '../../src/lib/reportAnalytics';
import type { TestRecord } from '../../src/types';

const sample: TestRecord[] = [
  {
    id: '1',
    officerId: 1,
    officerName: 'A',
    badgeNumber: 'B1',
    driverName: 'D',
    driverId: 'DL1',
    bacReading: 0.08,
    result: 'fail',
    createdAt: '2026-05-12T10:00:00Z',
    location: JSON.stringify({ roadblock: 'Allandale Slip' })
  },
  {
    id: '2',
    officerId: 2,
    officerName: 'B',
    badgeNumber: 'B2',
    driverName: 'E',
    driverId: 'DL2',
    bacReading: 0,
    result: 'pass',
    createdAt: '2026-05-13T12:00:00Z',
    location: JSON.stringify({ roadblock: 'N3 Midrand' })
  }
];

describe('reportAnalytics', () => {
  it('filters by date range and result', () => {
    const filtered = filterTestsForReport(sample, {
      from: '2026-05-12',
      to: '2026-05-12',
      result: 'fail',
      roadblock: 'ALL'
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('1');
  });

  it('builds weekly trend buckets', () => {
    const series = buildWeeklyTrend(sample);
    expect(series).toHaveLength(3);
    expect(series[0].values.reduce((a, b) => a + b, 0)).toBe(1);
    expect(series[1].values.reduce((a, b) => a + b, 0)).toBe(2);
  });

  it('builds daily trend series across the date range', () => {
    const trend = buildTrendSeries(sample, '2026-05-12', '2026-05-13');
    expect(trend.labels).toHaveLength(2);
    expect(trend.series).toHaveLength(3);
    expect(trend.series[1].values).toEqual([1, 1]);
    expect(trend.series[0].values).toEqual([1, 0]);
    expect(trend.series[2].values).toEqual([0, 100]);
  });

  it('builds weekly trend series for longer ranges', () => {
    const trend = buildTrendSeries(sample, '2026-05-01', '2026-05-31');
    expect(trend.labels.length).toBeGreaterThan(1);
    expect(trend.series[1].values.reduce((a, b) => a + b, 0)).toBe(2);
  });

  it('computes data span from test timestamps', () => {
    expect(dataSpanDateRange(sample)).toEqual({
      from: '2026-05-12',
      to: '2026-05-13'
    });
  });

  it('builds pass/fail breakdown', () => {
    expect(buildResultBreakdown(sample)).toEqual({ passed: 1, failed: 1, total: 2 });
  });

  it('maps weekday index with Monday as 0', () => {
    expect(weekdayIndex('2026-05-11T12:00:00Z')).toBe(0);
  });

  it('parses local calendar dates without UTC shift', () => {
    const d = parseLocalDate('2026-05-12');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4);
    expect(d.getDate()).toBe(12);
  });

  it('produces nice axis ticks that cover the max', () => {
    const ticks = niceTicks(7, 5);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(7);
  });
});

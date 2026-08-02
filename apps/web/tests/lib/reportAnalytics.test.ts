import { describe, expect, it } from 'vitest';
import {
  buildResultBreakdown,
  buildRoadblockStats,
  buildTrendSeries,
  buildWeeklyTrend,
  collectRoadblockOptions,
  dataSpanDateRange,
  filterTestsForReport,
  generateInsights,
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

  it('filters by roadblock', () => {
    const filtered = filterTestsForReport(sample, {
      from: '2026-05-12',
      to: '2026-05-13',
      result: 'all',
      roadblock: 'N3 Midrand'
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('2');
  });

  it('uses the stable roadblock ID for filtering and accountability grouping', () => {
    const tests: TestRecord[] = [
      {
        ...sample[0],
        officerId: 1,
        location: JSON.stringify({
          roadblockId: 'shift-1',
          roadblock: 'N1 Midrand',
          station: 'Midrand SAPS',
          supervisorName: 'Supervisor One',
          shiftStartsAt: '2026-05-12T08:00:00Z',
          shiftEndsAt: '2026-05-12T16:00:00Z'
        })
      },
      {
        ...sample[1],
        id: '3',
        officerId: 2,
        result: 'fail',
        location: JSON.stringify({
          roadblockId: 'shift-1',
          roadblock: 'N1 Midrand',
          station: 'Midrand SAPS',
          supervisorName: 'Supervisor One',
          shiftStartsAt: '2026-05-12T08:00:00Z',
          shiftEndsAt: '2026-05-12T16:00:00Z'
        })
      },
      {
        ...sample[1],
        id: '4',
        location: JSON.stringify({
          roadblockId: 'shift-2',
          roadblock: 'N1 Midrand',
          station: 'Midrand SAPS',
          supervisorName: 'Supervisor Two'
        })
      }
    ];

    const filtered = filterTestsForReport(tests, {
      from: '2026-05-12',
      to: '2026-05-13',
      result: 'all',
      roadblock: 'shift-1'
    });
    const stats = buildRoadblockStats(tests);
    const options = collectRoadblockOptions(tests);

    expect(filtered).toHaveLength(2);
    expect(stats).toHaveLength(2);
    expect(stats[0]).toMatchObject({
      key: 'shift-1',
      roadblockId: 'shift-1',
      name: 'N1 Midrand',
      station: 'Midrand SAPS',
      supervisor: 'Supervisor One',
      total: 2,
      passed: 0,
      failed: 2,
      officerCount: 2
    });
    expect(options.map((option) => option.key)).toEqual(['shift-1', 'shift-2']);
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

  it('raises integrity alerts at the configured threshold', () => {
    const makeInput = (integrityFlags: number) => ({
      metrics: {
        total: 2,
        failed: 1,
        failureRate: 50,
        avgBacOfFailures: 0,
        activeOfficers: 1,
        integrityFlags,
        peakDayLabel: null
      },
      delta: { failureRatePts: 0, volumePct: 0 },
      roadblocks: [],
      heatmap: { fails: [], totals: [], maxFail: 0, peak: null },
      officers: [],
      categories: { professional: 0, general: 1, professionalFailed: 0, generalFailed: 0 }
    });
    const raised = {
      integrityFlagCount: 5,
      failureRateChangePoints: 1,
      roadblockMinimumTests: 3,
      avgFailingBacMultiple: 2
    };

    const atDefault = generateInsights(makeInput(1));
    expect(atDefault.some((insight) => insight.tone === 'critical')).toBe(true);

    const atRaised = generateInsights(makeInput(2), raised);
    expect(atRaised.some((insight) => insight.tone === 'critical')).toBe(false);
  });
});

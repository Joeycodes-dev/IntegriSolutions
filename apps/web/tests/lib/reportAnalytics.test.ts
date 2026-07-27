import { describe, expect, it } from 'vitest';
import {
  buildResultBreakdown,
  buildWeeklyTrend,
  filterTestsForReport,
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
    expect(series[1].values.reduce((a, b) => a + b, 0)).toBe(2);
  });

  it('builds pass/fail breakdown', () => {
    expect(buildResultBreakdown(sample)).toEqual({ passed: 1, failed: 1, total: 2 });
  });

  it('maps weekday index with Monday as 0', () => {
    expect(weekdayIndex('2026-05-11T12:00:00Z')).toBe(0);
  });
});

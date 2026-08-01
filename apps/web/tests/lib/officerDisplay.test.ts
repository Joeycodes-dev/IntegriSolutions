import { describe, expect, it } from 'vitest';
import {
  buildOfficerPerformance,
  buildRosterAssignments,
  computeCoverageHealth,
  countOfficersAddedThisWeek,
  deriveDutyStatus,
  matchesOfficerTest
} from '../../src/lib/officerDisplay';
import type { FieldOfficer, TestRecord } from '../../src/types';

function officer(partial: Partial<FieldOfficer> & Pick<FieldOfficer, 'officerId'>): FieldOfficer {
  return {
    userId: `usr_${partial.officerId}`,
    name: `${partial.firstName ?? 'Ada'} ${partial.surname ?? 'Molefe'}`,
    firstName: partial.firstName ?? 'Ada',
    surname: partial.surname ?? 'Molefe',
    email: partial.email ?? 'ada@example.com',
    serviceNumber: partial.serviceNumber ?? 'SN100',
    rank: partial.rank ?? 'Constable',
    station:
      partial.station ??
      JSON.stringify({ address: 'Allandale Slip', shift: '06:00 - 14:00' }),
    status: partial.status ?? 'Active',
    createdAt: partial.createdAt ?? new Date().toISOString(),
    ...partial
  };
}

describe('officerDisplay', () => {
  it('matches tests by officerId, badge, or full name', () => {
    const o = officer({ officerId: 7, serviceNumber: 'B42', name: 'Thabo Nkosi', firstName: 'Thabo', surname: 'Nkosi' });

    expect(
      matchesOfficerTest(
        {
          id: '1',
          officerId: 7,
          officerName: 'x',
          badgeNumber: '',
          driverName: '',
          driverId: '',
          bacReading: 0,
          result: 'pass',
          createdAt: new Date().toISOString()
        },
        o
      )
    ).toBe(true);

    expect(
      matchesOfficerTest(
        {
          id: '2',
          officerId: null,
          officerName: 'Other',
          badgeNumber: 'B42',
          driverName: '',
          driverId: '',
          bacReading: 0,
          result: 'pass',
          createdAt: new Date().toISOString()
        },
        o
      )
    ).toBe(true);

    expect(
      matchesOfficerTest(
        {
          id: '3',
          officerId: null,
          officerName: 'Thabo Nkosi',
          badgeNumber: '',
          driverName: '',
          driverId: '',
          bacReading: 0,
          result: 'pass',
          createdAt: new Date().toISOString()
        },
        o
      )
    ).toBe(true);
  });

  it('derives duty status from employment and today activity', () => {
    const invited = officer({ officerId: 1, status: 'Invited' });
    const active = officer({ officerId: 2, status: 'Active' });
    expect(deriveDutyStatus(invited, 0)).toBe('Invited');
    expect(deriveDutyStatus(active, 0)).toBe('On Duty');
    expect(deriveDutyStatus(active, 2)).toBe('On Patrol');
  });

  it('prefers persisted duty status from the mobile app', () => {
    const active = officer({ officerId: 3, status: 'Active' });
    expect(deriveDutyStatus({ ...active, dutyStatus: 'Off Duty' }, 4)).toBe('Off Duty');
    expect(deriveDutyStatus({ ...active, dutyStatus: 'Break' }, 4)).toBe('On Break');
    expect(deriveDutyStatus({ ...active, dutyStatus: 'Checkpoint' }, 4)).toBe('On Duty');
    expect(deriveDutyStatus({ ...active, dutyStatus: 'On Patrol' }, 0)).toBe('On Patrol');
  });

  it('builds performance rows including invited officers', () => {
    const officers = [
      officer({ officerId: 1, status: 'Invited', firstName: 'Ivy', surname: 'Invite' }),
      officer({
        officerId: 2,
        status: 'Active',
        serviceNumber: 'SN200',
        station: JSON.stringify({ address: 'N3 Midrand', shift: '14:00 - 22:00' })
      })
    ];
    const tests: TestRecord[] = [
      {
        id: 't1',
        officerId: 2,
        officerName: 'Ada Molefe',
        badgeNumber: 'SN200',
        driverName: 'D',
        driverId: 'DL',
        bacReading: 0.08,
        result: 'fail',
        createdAt: new Date().toISOString()
      }
    ];

    const rows = buildOfficerPerformance(officers, tests);
    expect(rows).toHaveLength(2);
    expect(rows[0].status).toBe('Invited');
    expect(rows[1].testsToday).toBe(1);
    expect(rows[1].failRate).toBe('100%');
    expect(rows[1].status).toBe('On Patrol');
    expect(rows[1].shift).toBe('14:00 - 22:00');
  });

  it('computes roster and coverage from assigned shifts', () => {
    const officers = [
      officer({
        officerId: 1,
        status: 'Active',
        station: JSON.stringify({ address: 'A', shift: '06:00 - 14:00' })
      }),
      officer({
        officerId: 2,
        status: 'Active',
        station: JSON.stringify({ address: 'B', shift: '06:00 - 14:00' })
      }),
      officer({
        officerId: 3,
        status: 'Invited',
        station: JSON.stringify({ address: 'C', shift: '14:00 - 22:00' })
      })
    ];

    const roster = buildRosterAssignments(officers);
    expect(roster[0].assigned).toBe(2);
    expect(roster[1].assigned).toBe(0);

    const coverage = computeCoverageHealth(roster);
    expect(coverage.percent).toBeGreaterThan(0);
    expect(coverage.underTargetLabel).toMatch(/under target/i);
  });

  it('counts officers added this week', () => {
    const now = new Date('2026-07-28T12:00:00');
    const officers = [
      officer({ officerId: 1, createdAt: '2026-07-27T10:00:00Z' }),
      officer({ officerId: 2, createdAt: '2026-07-01T10:00:00Z' })
    ];
    expect(countOfficersAddedThisWeek(officers, now)).toBe(1);
  });
});

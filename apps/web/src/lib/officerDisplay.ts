import type { FieldOfficer, OfficerDutyStatus, TestRecord } from '../types';
import { parseOfficerLocation } from './officerLocation';

export const SHIFT_SLOTS = ['06:00 - 14:00', '14:00 - 22:00', '22:00 - 06:00'] as const;
export type ShiftSlot = (typeof SHIFT_SLOTS)[number];

export function formatConstableName(fullName: string, rank?: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return fullName;

  const initials = parts
    .slice(0, -1)
    .map((p) => `${p.charAt(0).toUpperCase()}.`)
    .join(' ');
  const surname = parts[parts.length - 1];
  const base = `${initials} ${surname}`;

  if (rank?.toLowerCase().includes('constable') || !rank) {
    return `Cst. ${base}`;
  }
  return `${rank} ${base}`;
}

export function parseStationLabel(station: string): string {
  const { address } = parseOfficerLocation(station);
  const short = address.split(',')[0]?.trim();
  return short || address;
}

export function parseShiftLabel(station: string): string {
  const { shift } = parseOfficerLocation(station);
  if (shift && (SHIFT_SLOTS as readonly string[]).includes(shift)) return shift;
  return 'Unassigned';
}

export function isActiveEmployment(status: string): boolean {
  return status.trim().toLowerCase() === 'active';
}

export function isInvitedEmployment(status: string): boolean {
  return status.trim().toLowerCase() === 'invited';
}

export function deriveDutyStatus(
  officer: FieldOfficer,
  testsToday: number
): OfficerDutyStatus {
  const status = officer.status.trim().toLowerCase();
  if (status === 'invited') return 'Invited';
  if (status !== 'active') return 'Inactive';

  // Prefer the officer's persisted duty status set from the mobile app.
  switch (officer.dutyStatus) {
    case 'On Patrol':
      return 'On Patrol';
    case 'Checkpoint':
      return 'On Duty';
    case 'Break':
      return 'On Break';
    case 'Off Duty':
      return 'Off Duty';
  }

  // Fallback for officers without a persisted status yet.
  return testsToday > 0 ? 'On Patrol' : 'On Duty';
}

export function isToday(iso: string): boolean {
  const date = new Date(iso);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export function matchesOfficerTest(test: TestRecord, officer: FieldOfficer): boolean {
  if (test.officerId != null && test.officerId === officer.officerId) return true;

  const badge = test.badgeNumber?.trim();
  if (badge && badge === officer.serviceNumber.trim()) return true;

  const testName = test.officerName?.trim().toLowerCase();
  if (!testName) return false;

  const fullName = officer.name.trim().toLowerCase();
  if (fullName && testName === fullName) return true;

  const composed = `${officer.firstName} ${officer.surname}`.trim().toLowerCase();
  if (composed && testName === composed) return true;

  return false;
}

export interface OfficerPerformanceRow {
  officerId: number;
  displayName: string;
  precinct: string;
  serviceNumber: string;
  shift: string;
  testsToday: number;
  failRate: string;
  employmentStatus: string;
  status: OfficerDutyStatus;
}

export function buildOfficerPerformance(
  officers: FieldOfficer[],
  tests: TestRecord[]
): OfficerPerformanceRow[] {
  const todayTests = tests.filter((t) => isToday(t.createdAt));

  return officers.map((officer) => {
    const officerTests = todayTests.filter((t) => matchesOfficerTest(t, officer));
    const failures = officerTests.filter((t) => t.result === 'fail').length;
    const failRate =
      officerTests.length > 0
        ? `${Math.round((failures / officerTests.length) * 100)}%`
        : '0%';

    return {
      officerId: officer.officerId,
      displayName: formatConstableName(officer.name, officer.rank),
      precinct: parseStationLabel(officer.station),
      serviceNumber: officer.serviceNumber,
      shift: parseShiftLabel(officer.station),
      testsToday: officerTests.length,
      failRate,
      employmentStatus: officer.status,
      status: deriveDutyStatus(officer, officerTests.length)
    };
  });
}

export interface RosterSlot {
  label: ShiftSlot;
  assigned: number;
  target: number;
}

export function buildRosterAssignments(officers: FieldOfficer[]): RosterSlot[] {
  const active = officers.filter((o) => isActiveEmployment(o.status));
  const target = Math.max(1, Math.ceil(Math.max(active.length, 1) / SHIFT_SLOTS.length));

  return SHIFT_SLOTS.map((label) => ({
    label,
    assigned: active.filter((o) => parseShiftLabel(o.station) === label).length,
    target
  }));
}

export function computeCoverageHealth(roster: RosterSlot[]): {
  percent: number;
  underTargetLabel: string | null;
} {
  const targetTotal = roster.reduce((sum, slot) => sum + slot.target, 0);
  if (targetTotal <= 0) return { percent: 0, underTargetLabel: null };

  const covered = roster.reduce((sum, slot) => sum + Math.min(slot.assigned, slot.target), 0);
  const percent = Math.round((covered / targetTotal) * 100);
  const under = roster.find((slot) => slot.assigned < slot.target);
  return {
    percent,
    underTargetLabel: under
      ? `${under.label} under target by ${under.target - under.assigned}`
      : null
  };
}

/** Officers created in the last 7 days (local calendar). */
export function countOfficersAddedThisWeek(officers: FieldOfficer[], now = new Date()): number {
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 7);
  weekAgo.setHours(0, 0, 0, 0);

  return officers.filter((o) => {
    const created = new Date(o.createdAt).getTime();
    return !Number.isNaN(created) && created >= weekAgo.getTime();
  }).length;
}

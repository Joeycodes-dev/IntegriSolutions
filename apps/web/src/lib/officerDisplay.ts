import type { FieldOfficer, OfficerShiftStatus, TestRecord } from '../types';
import { parseOfficerLocation } from './officerLocation';

export const SHIFT_SLOTS = ['06:00 - 14:00', '14:00 - 22:00', '22:00 - 06:00'] as const;

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
  if (shift?.trim()) return shift.trim();
  return 'Unassigned';
}

export function resolveDutyStatus(officer: FieldOfficer): OfficerShiftStatus {
  if (officer.status.toLowerCase() !== 'active') {
    return 'Off Duty';
  }
  return officer.dutyStatus ?? 'Off Duty';
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

export function buildOfficerPerformance(
  officers: FieldOfficer[],
  tests: TestRecord[]
) {
  const todayTests = tests.filter((t) => isToday(t.createdAt));

  return officers.map((officer) => {
    const officerTests = todayTests.filter(
      (t) =>
        t.officerId === officer.officerId ||
        t.badgeNumber === officer.serviceNumber ||
        t.officerName === officer.firstName ||
        t.officerName === officer.name
    );
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
      status: resolveDutyStatus(officer)
    };
  });
}

export function buildRosterAssignments(officers: FieldOfficer[]) {
  const active = officers.filter((o) => o.status.toLowerCase() === 'active');
  const targetPerShift = active.length === 0 ? 0 : Math.ceil(active.length / SHIFT_SLOTS.length);

  return SHIFT_SLOTS.map((label) => {
    const assigned = active.filter((officer) => parseShiftLabel(officer.station) === label).length;
    return {
      label,
      assigned,
      target: targetPerShift
    };
  });
}

export function buildCoverageHealth(officers: FieldOfficer[]) {
  const active = officers.filter((o) => o.status.toLowerCase() === 'active');
  if (active.length === 0) {
    return { percent: 0, onDuty: 0, active: 0 };
  }

  const onDuty = active.filter((o) => {
    const status = resolveDutyStatus(o);
    return status !== 'Off Duty';
  }).length;

  return {
    percent: Math.round((onDuty / active.length) * 100),
    onDuty,
    active: active.length
  };
}

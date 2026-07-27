import type { FieldOfficer, OfficerShiftStatus, TestRecord } from '../types';
import { parseOfficerLocation } from './officerLocation';

const SHIFTS = ['06:00 - 14:00', '14:00 - 22:00', '22:00 - 06:00'] as const;

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

export function parseShiftLabel(station: string, officerId: number): string {
  const { shift } = parseOfficerLocation(station);
  if (shift) return shift;
  return SHIFTS[officerId % SHIFTS.length];
}

export function deriveShiftStatus(officerId: number): OfficerShiftStatus {
  const statuses: OfficerShiftStatus[] = ['On Patrol', 'Checkpoint', 'Break'];
  return statuses[officerId % statuses.length];
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
        t.officerName === officer.firstName
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
      shift: parseShiftLabel(officer.station, officer.officerId),
      testsToday: officerTests.length,
      failRate,
      status: deriveShiftStatus(officer.officerId)
    };
  });
}

export const ROSTER_ASSIGNMENTS = [
  { label: '06:00 - 14:00', assigned: 6, target: 8 },
  { label: '14:00 - 22:00', assigned: 9, target: 9 },
  { label: '22:00 - 06:00', assigned: 7, target: 8 }
] as const;

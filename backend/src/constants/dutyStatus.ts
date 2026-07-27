export const DUTY_STATUSES = ['On Patrol', 'Checkpoint', 'Break', 'Off Duty'] as const;

export type DutyStatus = (typeof DUTY_STATUSES)[number];

export function isDutyStatus(value: unknown): value is DutyStatus {
  return typeof value === 'string' && (DUTY_STATUSES as readonly string[]).includes(value);
}

export function normalizeDutyStatus(value: unknown): DutyStatus {
  if (isDutyStatus(value)) return value;
  return 'Off Duty';
}

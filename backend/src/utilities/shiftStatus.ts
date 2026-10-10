/**
 * Effective roadblock-shift status, derived per API response.
 *
 * The `roadblock_shifts.status` column is only ever *written* as 'scheduled',
 * 'active', 'closed', or 'cancelled' (DB CHECK constraint), and manual writes
 * happen rarely (create + supervisor close/cancel). Nothing updates the column
 * as time passes, so a raw read shows stale 'active'/'scheduled' for shifts
 * whose window has long ended.
 *
 * This helper computes the lifecycle state from the raw status plus the
 * start/end window, so every client (web Shift Board, mobile officer app)
 * shows the truth without a background job:
 *
 *   closed / cancelled  → kept (explicit supervisor action)
 *   now > endsAt        → 'ended'
 *   now < startsAt      → 'scheduled'
 *   otherwise           → 'active'
 */
export type EffectiveShiftStatus = 'scheduled' | 'active' | 'closed' | 'cancelled' | 'ended';

export function effectiveShiftStatus(
  rawStatus: string,
  startsAt: string,
  endsAt: string,
  nowMs: number = Date.now()
): EffectiveShiftStatus {
  if (rawStatus === 'closed' || rawStatus === 'cancelled') return rawStatus;

  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();

  if (Number.isFinite(end) && end < nowMs) return 'ended';
  if (Number.isFinite(start) && start > nowMs) return 'scheduled';
  return 'active';
}

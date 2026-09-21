/**
 * Formats an unacknowledged-alert count for the small badge on the bottom
 * Alerts tab. Caps large values so the badge stays a fixed, unobtrusive
 * size instead of growing to fit an arbitrarily large number — matching
 * the same cap convention as the existing chat unread-count badge.
 */
export function formatAlertBadgeCount(count: number, max = 99): string {
  const safeCount = Math.max(0, count);
  return safeCount > max ? `${max}+` : String(safeCount);
}

/**
 * Shared day-aware timestamp formatting for chat and alerts.
 *
 * Same-day timestamps get the explicit "Today" day name (and "Yesterday" for
 * the previous day) — users reported the date was not visible at all when
 * only the clock time was shown, and a bare date for something sent minutes
 * ago reads worse than naming the day.
 */

const DAY_MS = 86_400_000;

const startOfDayMs = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** 0 = same calendar day as now, 1 = yesterday, 2+ = older. */
export function daysSince(value: Date): number {
  return Math.round((startOfDayMs(new Date()) - startOfDayMs(value)) / DAY_MS);
}

/**
 * "Today, 14:32" / "Yesterday, 14:32" / "10 Oct 2026, 14:32".
 * Falls back to the raw string when the input cannot be parsed.
 */
export function formatDayAwareDateTime(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return iso;
  const time = value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const age = daysSince(value);
  if (age <= 0) return `Today, ${time}`;
  if (age === 1) return `Yesterday, ${time}`;
  const date = value.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
  return `${date}, ${time}`;
}

/**
 * Alerts variant: same day naming, but older timestamps keep the alerts
 * panel's established `YYYY-MM-DD HH:mm` shape.
 */
export function formatDayAwareDateTimeNumeric(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  const time = `${pad(value.getHours())}:${pad(value.getMinutes())}`;
  const age = daysSince(value);
  if (age <= 0) return `Today, ${time}`;
  if (age === 1) return `Yesterday, ${time}`;
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${time}`;
}

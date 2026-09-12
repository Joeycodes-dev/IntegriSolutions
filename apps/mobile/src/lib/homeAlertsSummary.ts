import type { OperationalAlert } from '../types';

export interface HomeAlertsSummary {
  /** The single most urgent alert to feature as a prominent banner, or null
   * if nothing currently needs prominent attention. */
  featuredAlert: OperationalAlert | null;
  /** Count of other eligible alerts not shown as the banner (medium/low
   * priority, or additional high-priority ones beyond the featured one). */
  otherCount: number;
  /** Total alerts eligible for Home at all (featured + other). */
  totalUnacknowledged: number;
}

/**
 * Reduces the officer's active alerts down to what Home should show. Home is
 * "what needs attention now" — a single high-priority unacknowledged alert
 * gets a banner, everything else eligible collapses into a count, and
 * anything not needing attention (acknowledged, or not currently active)
 * is excluded entirely. This never changes alert business rules — the
 * active/expiry filter here just re-applies, defensively, the same rule
 * GET /alerts/active already enforces server-side.
 */
export function summarizeAlertsForHome(alerts: OperationalAlert[]): HomeAlertsSummary {
  const nowMs = Date.now();
  const eligible = alerts.filter((alert) => {
    if (alert.status !== 'active') return false;
    if (alert.acknowledgedAt) return false;
    if (alert.expiresAt) {
      const expiresAtMs = new Date(alert.expiresAt).getTime();
      if (!Number.isNaN(expiresAtMs) && expiresAtMs <= nowMs) return false;
    }
    return true;
  });

  const highPriority = eligible.filter((alert) => alert.priority === 'high');
  const featuredAlert: OperationalAlert | null = highPriority.length > 0 ? highPriority[0] : null;

  const otherCount = eligible.length - (featuredAlert ? 1 : 0);

  return {
    featuredAlert,
    otherCount,
    totalUnacknowledged: eligible.length
  };
}

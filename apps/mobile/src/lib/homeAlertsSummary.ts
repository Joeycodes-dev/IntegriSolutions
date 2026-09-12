import type { OperationalAlert, OperationalAlertPriority } from '../types';

const PRIORITY_ORDER: OperationalAlertPriority[] = ['critical', 'high', 'medium', 'low'];

export interface HomeAlertsSummary {
  /** The single most urgent alert to feature as a prominent banner, or null
   * if nothing currently needs prominent attention. */
  featuredAlert: OperationalAlert | null;
  /** Count of other eligible alerts not shown as the banner (lower-priority
   * ones, or additional alerts in the same tier as the featured one). */
  otherCount: number;
  /** Total alerts eligible for Home at all (featured + other). */
  totalUnacknowledged: number;
}

/**
 * Reduces the officer's active alerts down to what Home should show. Home is
 * "what needs attention now" — a single unacknowledged alert from the
 * highest-priority tier present gets a banner (Critical if any exist, else
 * High, else Medium, else Low), everything else eligible collapses into a
 * count, and anything not needing attention (acknowledged, or not currently
 * active) is excluded entirely. This never changes alert business rules —
 * the active/expiry filter here just re-applies, defensively, the same rule
 * GET /alerts/active already enforces server-side.
 *
 * Priority here controls prominence only, never interruption: this module
 * has no awareness of the officer's current screen/workflow step, and a
 * Critical alert is surfaced exactly the same way (a passive banner/badge
 * update) as any other tier — it never triggers a modal or navigation.
 * Callers (e.g. OfficerDashboardScreen) are responsible for only rendering
 * the banner outside active capture flows.
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

  // Feature the highest-priority tier that actually has an eligible alert —
  // a Low alert is only ever shown when no Critical/High/Medium alert is
  // eligible.
  const topTier = PRIORITY_ORDER.find((priority) => eligible.some((alert) => alert.priority === priority));
  const featuredAlert: OperationalAlert | null = topTier
    ? eligible.find((alert) => alert.priority === topTier) ?? null
    : null;

  const otherCount = eligible.length - (featuredAlert ? 1 : 0);

  return {
    featuredAlert,
    otherCount,
    totalUnacknowledged: eligible.length
  };
}

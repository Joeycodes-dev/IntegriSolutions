import type { OperationalAlert, OperationalAlertPriority } from '../types';
import { distanceMeters, isWithinRadius, type Coordinates } from './geoDistance';

const PRIORITY_ORDER: OperationalAlertPriority[] = ['critical', 'high', 'medium', 'low'];

export interface HomeAlertsSummary {
  /** The single most urgent alert to feature as a prominent banner, or null
   * if nothing currently needs prominent attention. */
  featuredAlert: OperationalAlert | null;
  /** True when the featured alert has location + radius and the officer's
   * last-known position falls inside it. */
  featuredAlertIsNearby: boolean;
  /** Approximate distance in metres from the officer to the featured alert's
   * location, or null when either has no coordinates available. */
  featuredAlertDistanceMeters: number | null;
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
 *
 * officerLocation is optional and, when provided, only affects WHICH alert
 * within the chosen priority tier gets featured (preferring a nearby one,
 * then the nearest) and whether a distance is shown — proximity is only a
 * tie-breaker within a tier, so a nearby lower-priority alert is never
 * featured ahead of a higher-priority one just for being close, and it
 * never bypasses the acknowledged/active/expiry eligibility filter above.
 */
export function summarizeAlertsForHome(
  alerts: OperationalAlert[],
  officerLocation?: Coordinates | null
): HomeAlertsSummary {
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
  // a Low alert is only ever shown when no High or Medium alert is eligible.
  const topTier = PRIORITY_ORDER.find((priority) => eligible.some((alert) => alert.priority === priority));
  const candidates = topTier ? eligible.filter((alert) => alert.priority === topTier) : [];

  let featuredAlert: OperationalAlert | null = null;
  let featuredAlertIsNearby = false;
  let featuredAlertDistanceMeters: number | null = null;

  if (candidates.length > 0) {
    if (officerLocation) {
      let bestDistance: number | null = null;
      let bestNearby = false;

      for (const alert of candidates) {
        const hasCoords = alert.locationLat != null && alert.locationLng != null;
        const distance = hasCoords
          ? distanceMeters(officerLocation, { lat: alert.locationLat as number, lng: alert.locationLng as number })
          : null;
        const nearby =
          hasCoords && alert.locationRadiusMeters != null
            ? isWithinRadius(officerLocation, { lat: alert.locationLat as number, lng: alert.locationLng as number }, alert.locationRadiusMeters)
            : false;

        const isBetter =
          !featuredAlert ||
          (nearby && !bestNearby) ||
          (nearby === bestNearby && distance != null && (bestDistance == null || distance < bestDistance));

        if (isBetter) {
          featuredAlert = alert;
          bestDistance = distance;
          bestNearby = nearby;
        }
      }

      featuredAlertDistanceMeters = bestDistance;
      featuredAlertIsNearby = bestNearby;
    } else {
      featuredAlert = candidates[0];
    }
  }

  const otherCount = eligible.length - (featuredAlert ? 1 : 0);

  return {
    featuredAlert,
    featuredAlertIsNearby,
    featuredAlertDistanceMeters,
    otherCount,
    totalUnacknowledged: eligible.length
  };
}

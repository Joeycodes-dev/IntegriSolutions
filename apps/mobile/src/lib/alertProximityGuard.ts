export interface ProximityCooldownState {
  version: number;
  lastNearbyAt: number;
}

export type ProximityCooldownMap = Map<string, ProximityCooldownState>;

/** How long a "nearby" reading stays sticky after the last true in-radius
 * fix, to smooth out GPS drift flapping the NEARBY badge on and off across
 * Home focuses. Not a re-notification interval — this feature has no
 * notification/sound, just the passive badge in components/OfficerHome.tsx. */
export const PROXIMITY_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Smooths a single alert's raw in-radius reading against GPS drift: once
 * "nearby" goes true, it stays true for PROXIMITY_COOLDOWN_MS after the last
 * true reading even if a jittery fix briefly reads outside the radius. A
 * material alert edit (version bump, see OperationalAlert.version) clears
 * the cooldown immediately so the edited alert can surface as nearby right
 * away rather than waiting out a cooldown computed against stale content.
 *
 * `state` is owned by the caller (a useRef map in OfficerDashboardScreen) and
 * mutated in place — this module holds no state of its own and does no
 * tracking beyond the one alert it's asked about.
 */
export function evaluateNearbyWithCooldown(
  state: ProximityCooldownMap,
  alertId: string,
  version: number,
  rawNearby: boolean,
  now: number = Date.now()
): boolean {
  const stale = state.get(alertId);
  if (stale && stale.version !== version) {
    state.delete(alertId);
  }

  if (rawNearby) {
    state.set(alertId, { version, lastNearbyAt: now });
    return true;
  }

  const current = state.get(alertId);
  if (current && now - current.lastNearbyAt < PROXIMITY_COOLDOWN_MS) {
    return true;
  }

  if (current) {
    state.delete(alertId);
  }
  return false;
}

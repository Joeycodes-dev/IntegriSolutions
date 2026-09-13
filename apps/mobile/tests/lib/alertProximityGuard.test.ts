import { evaluateNearbyWithCooldown, PROXIMITY_COOLDOWN_MS, type ProximityCooldownMap } from '../../src/lib/alertProximityGuard';

describe('evaluateNearbyWithCooldown', () => {
  it('returns true while actually within radius', () => {
    const state: ProximityCooldownMap = new Map();
    expect(evaluateNearbyWithCooldown(state, 'alert-1', 1, true, 0)).toBe(true);
  });

  it('returns false when never nearby', () => {
    const state: ProximityCooldownMap = new Map();
    expect(evaluateNearbyWithCooldown(state, 'alert-1', 1, false, 0)).toBe(false);
  });

  it('stays nearby (sticky) for a drift-out reading within the cooldown window', () => {
    const state: ProximityCooldownMap = new Map();
    evaluateNearbyWithCooldown(state, 'alert-1', 1, true, 0);
    const stillNearby = evaluateNearbyWithCooldown(state, 'alert-1', 1, false, PROXIMITY_COOLDOWN_MS - 1);
    expect(stillNearby).toBe(true);
  });

  it('clears once the cooldown window has fully elapsed', () => {
    const state: ProximityCooldownMap = new Map();
    evaluateNearbyWithCooldown(state, 'alert-1', 1, true, 0);
    const noLongerNearby = evaluateNearbyWithCooldown(state, 'alert-1', 1, false, PROXIMITY_COOLDOWN_MS + 1);
    expect(noLongerNearby).toBe(false);
  });

  it('a real re-entry into radius refreshes the cooldown window', () => {
    const state: ProximityCooldownMap = new Map();
    evaluateNearbyWithCooldown(state, 'alert-1', 1, true, 0);
    evaluateNearbyWithCooldown(state, 'alert-1', 1, true, PROXIMITY_COOLDOWN_MS - 1);
    const stillNearby = evaluateNearbyWithCooldown(state, 'alert-1', 1, false, PROXIMITY_COOLDOWN_MS + 500);
    expect(stillNearby).toBe(true);
  });

  it('a material version change clears the cooldown immediately, ignoring stale sticky state', () => {
    const state: ProximityCooldownMap = new Map();
    evaluateNearbyWithCooldown(state, 'alert-1', 1, true, 0);
    const freshEvaluation = evaluateNearbyWithCooldown(state, 'alert-1', 2, false, 1_000);
    expect(freshEvaluation).toBe(false);
  });

  it('tracks multiple alerts independently', () => {
    const state: ProximityCooldownMap = new Map();
    evaluateNearbyWithCooldown(state, 'alert-1', 1, true, 0);
    expect(evaluateNearbyWithCooldown(state, 'alert-2', 1, false, 0)).toBe(false);
    expect(evaluateNearbyWithCooldown(state, 'alert-1', 1, false, 1_000)).toBe(true);
  });
});

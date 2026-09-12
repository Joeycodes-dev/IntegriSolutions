import { summarizeAlertsForHome } from '../../src/lib/homeAlertsSummary';
import type { OperationalAlert } from '../../src/types';

function makeAlert(overrides: Partial<OperationalAlert> = {}): OperationalAlert {
  return {
    id: 'alert-1',
    alertType: 'general',
    priority: 'medium',
    description: 'Be advised: flooding on N1',
    vehicleRegistration: null,
    vehicleDescription: null,
    personName: null,
    personDescription: null,
    personReference: null,
    photoUrl: null,
    locationLat: null,
    locationLng: null,
    locationLabel: null,
    locationRadiusMeters: null,
    issuedByName: 'supervisor',
    targetScope: 'all_officers',
    sourceType: 'internal',
    sourceAuthority: null,
    sourceReference: null,
    status: 'active',
    expiresAt: null,
    createdAt: '2026-09-11T10:00:00Z',
    acknowledgedAt: null,
    ...overrides
  };
}

describe('summarizeAlertsForHome', () => {
  it('features a high-priority unacknowledged alert as the banner', () => {
    const alert = makeAlert({ id: 'alert-high', priority: 'high', acknowledgedAt: null });
    const summary = summarizeAlertsForHome([alert]);

    expect(summary.featuredAlert).toEqual(alert);
    expect(summary.otherCount).toBe(0);
    expect(summary.totalUnacknowledged).toBe(1);
  });

  it('does not feature an acknowledged high-priority alert (no prominent treatment)', () => {
    const acknowledged = makeAlert({ id: 'alert-acked', priority: 'high', acknowledgedAt: '2026-09-11T10:05:00Z' });
    const summary = summarizeAlertsForHome([acknowledged]);

    expect(summary.featuredAlert).toBeNull();
    expect(summary.otherCount).toBe(0);
    expect(summary.totalUnacknowledged).toBe(0);
  });

  it.each(['expired', 'resolved', 'cancelled'])('excludes a %s alert entirely', (status) => {
    const alert = makeAlert({ id: 'alert-inactive', priority: 'high', status: status as OperationalAlert['status'] });
    const summary = summarizeAlertsForHome([alert]);

    expect(summary.featuredAlert).toBeNull();
    expect(summary.otherCount).toBe(0);
    expect(summary.totalUnacknowledged).toBe(0);
  });

  it('excludes a high-priority alert whose expiresAt has already passed even if status is still active', () => {
    const alert = makeAlert({ id: 'alert-past-due', priority: 'high', status: 'active', expiresAt: '2020-01-01T00:00:00Z' });
    const summary = summarizeAlertsForHome([alert]);

    expect(summary.featuredAlert).toBeNull();
    expect(summary.totalUnacknowledged).toBe(0);
  });

  it('features a Medium-priority alert as the banner when no High alert is eligible', () => {
    const medium = makeAlert({ id: 'alert-medium', priority: 'medium' });
    const low = makeAlert({ id: 'alert-low', priority: 'low' });
    const summary = summarizeAlertsForHome([medium, low]);

    expect(summary.featuredAlert?.id).toBe('alert-medium');
    expect(summary.otherCount).toBe(1);
    expect(summary.totalUnacknowledged).toBe(2);
  });

  it('features a Low-priority alert as the banner when no High or Medium alert is eligible', () => {
    const low = makeAlert({ id: 'alert-low', priority: 'low' });
    const summary = summarizeAlertsForHome([low]);

    expect(summary.featuredAlert?.id).toBe('alert-low');
    expect(summary.otherCount).toBe(0);
    expect(summary.totalUnacknowledged).toBe(1);
  });

  it('always prefers a High-priority alert over Medium/Low ones, regardless of list order', () => {
    const low = makeAlert({ id: 'alert-low', priority: 'low' });
    const high = makeAlert({ id: 'alert-high', priority: 'high' });
    const medium = makeAlert({ id: 'alert-medium', priority: 'medium' });
    const summary = summarizeAlertsForHome([low, high, medium]);

    expect(summary.featuredAlert?.id).toBe('alert-high');
    expect(summary.otherCount).toBe(2);
  });

  it('an acknowledged High-priority alert does not out-rank an eligible Medium one for Home styling', () => {
    const acknowledgedHigh = makeAlert({ id: 'alert-high-acked', priority: 'high', acknowledgedAt: '2026-09-11T10:05:00Z' });
    const medium = makeAlert({ id: 'alert-medium', priority: 'medium' });
    const summary = summarizeAlertsForHome([acknowledgedHigh, medium]);

    expect(summary.featuredAlert?.id).toBe('alert-medium');
    expect(summary.totalUnacknowledged).toBe(1);
  });

  it('selects Critical over High/Medium/Low, regardless of list order — priority order is critical > high > medium > low', () => {
    const low = makeAlert({ id: 'alert-low', priority: 'low' });
    const medium = makeAlert({ id: 'alert-medium', priority: 'medium' });
    const high = makeAlert({ id: 'alert-high', priority: 'high' });
    const critical = makeAlert({ id: 'alert-critical', priority: 'critical' });
    const summary = summarizeAlertsForHome([low, high, medium, critical]);

    expect(summary.featuredAlert?.id).toBe('alert-critical');
    expect(summary.otherCount).toBe(3);
  });

  it('features a Critical-priority alert even when it is the only eligible alert', () => {
    const critical = makeAlert({ id: 'alert-critical', priority: 'critical' });
    const summary = summarizeAlertsForHome([critical]);

    expect(summary.featuredAlert?.id).toBe('alert-critical');
    expect(summary.otherCount).toBe(0);
    expect(summary.totalUnacknowledged).toBe(1);
  });

  it.each(['expired', 'resolved', 'cancelled'] as const)(
    'a %s Critical alert does not drive the Home banner',
    (status) => {
      const inactiveCritical = makeAlert({ id: 'alert-critical-inactive', priority: 'critical', status });
      const summary = summarizeAlertsForHome([inactiveCritical]);

      expect(summary.featuredAlert).toBeNull();
      expect(summary.totalUnacknowledged).toBe(0);
    }
  );

  it('an acknowledged Critical alert does not drive the Home banner', () => {
    const acknowledgedCritical = makeAlert({
      id: 'alert-critical-acked',
      priority: 'critical',
      acknowledgedAt: '2026-09-12T10:05:00Z'
    });
    const summary = summarizeAlertsForHome([acknowledgedCritical]);

    expect(summary.featuredAlert).toBeNull();
    expect(summary.totalUnacknowledged).toBe(0);
  });

  it('an expired Critical alert (expiresAt passed, status still active) does not drive the Home banner', () => {
    const expiredCritical = makeAlert({
      id: 'alert-critical-expired',
      priority: 'critical',
      status: 'active',
      expiresAt: '2020-01-01T00:00:00Z'
    });
    const summary = summarizeAlertsForHome([expiredCritical]);

    expect(summary.featuredAlert).toBeNull();
    expect(summary.totalUnacknowledged).toBe(0);
  });

  it('an ineligible Critical alert does not block a lower-priority eligible alert from being featured', () => {
    const acknowledgedCritical = makeAlert({
      id: 'alert-critical-acked',
      priority: 'critical',
      acknowledgedAt: '2026-09-12T10:05:00Z'
    });
    const low = makeAlert({ id: 'alert-low', priority: 'low' });
    const summary = summarizeAlertsForHome([acknowledgedCritical, low]);

    expect(summary.featuredAlert?.id).toBe('alert-low');
    expect(summary.totalUnacknowledged).toBe(1);
  });

  it('features one high-priority alert and counts the rest (other high + medium/low) as "other"', () => {
    const first = makeAlert({ id: 'alert-high-1', priority: 'high', createdAt: '2026-09-11T10:00:00Z' });
    const second = makeAlert({ id: 'alert-high-2', priority: 'high', createdAt: '2026-09-11T09:00:00Z' });
    const medium = makeAlert({ id: 'alert-medium', priority: 'medium' });
    const summary = summarizeAlertsForHome([first, second, medium]);

    expect(summary.featuredAlert?.id).toBe('alert-high-1');
    expect(summary.otherCount).toBe(2);
    expect(summary.totalUnacknowledged).toBe(3);
  });

  it('returns no featured alert and a zero count when nothing is eligible', () => {
    const summary = summarizeAlertsForHome([]);
    expect(summary.featuredAlert).toBeNull();
    expect(summary.otherCount).toBe(0);
    expect(summary.totalUnacknowledged).toBe(0);
  });

  describe('location-aware selection (officerLocation provided)', () => {
    const officerLocation = { lat: -26.2041, lng: 28.0473 };

    it('detects a nearby high-priority alert and reports it as nearby with a distance', () => {
      const nearby = makeAlert({
        id: 'alert-nearby',
        priority: 'high',
        locationLat: -26.2045,
        locationLng: 28.0475,
        locationRadiusMeters: 500
      });
      const summary = summarizeAlertsForHome([nearby], officerLocation);

      expect(summary.featuredAlert?.id).toBe('alert-nearby');
      expect(summary.featuredAlertIsNearby).toBe(true);
      expect(summary.featuredAlertDistanceMeters).not.toBeNull();
      expect(summary.featuredAlertDistanceMeters as number).toBeLessThan(500);
    });

    it('does not mark a high-priority alert as nearby when the officer is outside its radius', () => {
      const farAway = makeAlert({
        id: 'alert-far',
        priority: 'high',
        locationLat: -25.7479, // Pretoria — well outside a small radius
        locationLng: 28.2293,
        locationRadiusMeters: 500
      });
      const summary = summarizeAlertsForHome([farAway], officerLocation);

      expect(summary.featuredAlert?.id).toBe('alert-far');
      expect(summary.featuredAlertIsNearby).toBe(false);
    });

    it('prefers a nearby high-priority alert over a non-nearby high-priority alert', () => {
      const far = makeAlert({
        id: 'alert-far',
        priority: 'high',
        locationLat: -25.7479,
        locationLng: 28.2293,
        locationRadiusMeters: 500
      });
      const nearby = makeAlert({
        id: 'alert-nearby',
        priority: 'high',
        locationLat: -26.2045,
        locationLng: 28.0475,
        locationRadiusMeters: 500
      });

      const summary = summarizeAlertsForHome([far, nearby], officerLocation);
      expect(summary.featuredAlert?.id).toBe('alert-nearby');
      expect(summary.featuredAlertIsNearby).toBe(true);
      expect(summary.otherCount).toBe(1);
    });

    it('features a nearby Medium-priority alert when no High alert is eligible', () => {
      const nearbyMedium = makeAlert({
        id: 'alert-medium-nearby',
        priority: 'medium',
        locationLat: -26.2045,
        locationLng: 28.0475,
        locationRadiusMeters: 500
      });
      const summary = summarizeAlertsForHome([nearbyMedium], officerLocation);

      expect(summary.featuredAlert?.id).toBe('alert-medium-nearby');
      expect(summary.featuredAlertIsNearby).toBe(true);
      expect(summary.otherCount).toBe(0);
    });

    it('never promotes a nearby Medium-priority alert ahead of a farther High-priority one — priority tier gate is absolute, proximity only breaks ties within a tier', () => {
      const farHigh = makeAlert({
        id: 'alert-high-far',
        priority: 'high',
        locationLat: -25.7479,
        locationLng: 28.2293,
        locationRadiusMeters: 500
      });
      const nearbyMedium = makeAlert({
        id: 'alert-medium-nearby',
        priority: 'medium',
        locationLat: -26.2045,
        locationLng: 28.0475,
        locationRadiusMeters: 500
      });
      const summary = summarizeAlertsForHome([farHigh, nearbyMedium], officerLocation);

      expect(summary.featuredAlert?.id).toBe('alert-high-far');
      expect(summary.otherCount).toBe(1);
    });

    it('never promotes a nearby High-priority alert ahead of a farther Critical one', () => {
      const nearbyHigh = makeAlert({
        id: 'alert-high-nearby',
        priority: 'high',
        locationLat: -26.2045,
        locationLng: 28.0475,
        locationRadiusMeters: 500
      });
      const farCritical = makeAlert({
        id: 'alert-critical-far',
        priority: 'critical',
        locationLat: -25.7479,
        locationLng: 28.2293,
        locationRadiusMeters: 500
      });
      const summary = summarizeAlertsForHome([nearbyHigh, farCritical], officerLocation);

      expect(summary.featuredAlert?.id).toBe('alert-critical-far');
      expect(summary.otherCount).toBe(1);
    });

    it('still excludes acknowledged/expired/inactive alerts even when nearby', () => {
      const acknowledgedNearby = makeAlert({
        id: 'alert-acked-nearby',
        priority: 'high',
        acknowledgedAt: '2026-09-11T10:05:00Z',
        locationLat: -26.2045,
        locationLng: 28.0475,
        locationRadiusMeters: 500
      });
      const summary = summarizeAlertsForHome([acknowledgedNearby], officerLocation);

      expect(summary.featuredAlert).toBeNull();
      expect(summary.totalUnacknowledged).toBe(0);
    });

    it('falls back to the first high-priority alert when officerLocation is not provided (unchanged legacy behavior)', () => {
      const first = makeAlert({ id: 'alert-high-1', priority: 'high' });
      const second = makeAlert({ id: 'alert-high-2', priority: 'high' });
      const summary = summarizeAlertsForHome([first, second]);

      expect(summary.featuredAlert?.id).toBe('alert-high-1');
      expect(summary.featuredAlertIsNearby).toBe(false);
      expect(summary.featuredAlertDistanceMeters).toBeNull();
    });
  });
});

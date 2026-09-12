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
});

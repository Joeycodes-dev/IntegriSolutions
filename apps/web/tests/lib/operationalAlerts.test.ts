import { describe, expect, it } from 'vitest';
import { effectiveAlertStatus, isAlertEffectivelyActive } from '../../src/lib/operationalAlerts';
import type { OperationalAlert } from '../../src/types';

function alert(partial: Partial<OperationalAlert> & Pick<OperationalAlert, 'id'>): OperationalAlert {
  return {
    alertType: 'general',
    priority: 'medium',
    description: 'Be advised',
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
    issuedBySource: 'supervisor_users',
    issuedById: 7,
    issuedByName: 'supervisor',
    targetScope: 'all_officers',
    targetShiftId: null,
    sourceType: 'internal',
    sourceAuthority: null,
    sourceReference: null,
    status: 'active',
    expiresAt: null,
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
    assignedOfficerIds: [],
    acknowledgementCount: 0,
    matchCount: 0,
    version: 1,
    statusReason: null,
    statusReasonBy: null,
    statusReasonAt: null,
    ...partial
  };
}

const PAST = '2020-01-01T00:00:00Z';
const FUTURE = '2999-01-01T00:00:00Z';

describe('effectiveAlertStatus / isAlertEffectivelyActive', () => {
  it('counts a stored-active alert with no expiry as active', () => {
    const a = alert({ id: 'a1', status: 'active', expiresAt: null });
    expect(effectiveAlertStatus(a)).toBe('active');
    expect(isAlertEffectivelyActive(a)).toBe(true);
  });

  it('counts a stored-active alert with a future expiry as active', () => {
    const a = alert({ id: 'a2', status: 'active', expiresAt: FUTURE });
    expect(effectiveAlertStatus(a)).toBe('active');
    expect(isAlertEffectivelyActive(a)).toBe(true);
  });

  it('treats a stored-active alert whose expiry has passed as effectively expired, not active', () => {
    const a = alert({ id: 'a3', status: 'active', expiresAt: PAST });
    expect(effectiveAlertStatus(a)).toBe('expired');
    expect(isAlertEffectivelyActive(a)).toBe(false);
  });

  it('excludes resolved alerts regardless of expiry', () => {
    const resolved = alert({ id: 'a4', status: 'resolved', expiresAt: FUTURE });
    expect(effectiveAlertStatus(resolved)).toBe('resolved');
    expect(isAlertEffectivelyActive(resolved)).toBe(false);
  });

  it('excludes cancelled alerts regardless of expiry', () => {
    const cancelled = alert({ id: 'a5', status: 'cancelled', expiresAt: null });
    expect(effectiveAlertStatus(cancelled)).toBe('cancelled');
    expect(isAlertEffectivelyActive(cancelled)).toBe(false);
  });

  it('leaves an already-expired stored status as expired', () => {
    const a = alert({ id: 'a6', status: 'expired', expiresAt: null });
    expect(effectiveAlertStatus(a)).toBe('expired');
    expect(isAlertEffectivelyActive(a)).toBe(false);
  });

  it('treats an unparseable expiresAt as not-yet-expired (fails safe, matches display logic)', () => {
    const a = alert({ id: 'a7', status: 'active', expiresAt: 'not-a-date' });
    expect(effectiveAlertStatus(a)).toBe('active');
    expect(isAlertEffectivelyActive(a)).toBe(true);
  });
});

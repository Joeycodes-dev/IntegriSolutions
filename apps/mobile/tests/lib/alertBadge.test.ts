import { formatAlertBadgeCount } from '../../src/lib/alertBadge';

describe('formatAlertBadgeCount', () => {
  it('shows the plain number under the cap', () => {
    expect(formatAlertBadgeCount(1)).toBe('1');
    expect(formatAlertBadgeCount(5)).toBe('5');
    expect(formatAlertBadgeCount(42)).toBe('42');
  });

  it('shows the exact number at the cap boundary', () => {
    expect(formatAlertBadgeCount(99)).toBe('99');
  });

  it('caps values beyond the boundary as "99+"', () => {
    expect(formatAlertBadgeCount(100)).toBe('99+');
    expect(formatAlertBadgeCount(250)).toBe('99+');
  });

  it('supports a custom cap', () => {
    expect(formatAlertBadgeCount(9, 9)).toBe('9');
    expect(formatAlertBadgeCount(10, 9)).toBe('9+');
  });

  it('clamps a negative count to zero rather than showing a negative badge', () => {
    expect(formatAlertBadgeCount(-3)).toBe('0');
  });
});

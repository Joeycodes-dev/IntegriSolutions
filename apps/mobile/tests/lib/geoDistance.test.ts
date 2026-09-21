import { distanceMeters, isWithinRadius, formatApproxDistance } from '../../src/lib/geoDistance';

describe('distanceMeters', () => {
  it('returns 0 for identical coordinates', () => {
    expect(distanceMeters({ lat: -26.2041, lng: 28.0473 }, { lat: -26.2041, lng: 28.0473 })).toBeCloseTo(0, 3);
  });

  it('computes a known approximate distance (Johannesburg CBD to OR Tambo, ~24km)', () => {
    const jhb = { lat: -26.2041, lng: 28.0473 };
    const orTambo = { lat: -26.1367, lng: 28.242 };
    const distance = distanceMeters(jhb, orTambo);
    expect(distance).toBeGreaterThan(18_000);
    expect(distance).toBeLessThan(25_000);
  });

  it('is symmetric', () => {
    const a = { lat: -26.2041, lng: 28.0473 };
    const b = { lat: -25.7479, lng: 28.2293 };
    expect(distanceMeters(a, b)).toBeCloseTo(distanceMeters(b, a), 6);
  });
});

describe('isWithinRadius', () => {
  const center = { lat: -26.2041, lng: 28.0473 };

  it('is true when the officer is inside the radius', () => {
    const nearby = { lat: -26.2045, lng: 28.0475 }; // a few tens of metres away
    expect(isWithinRadius(nearby, center, 500)).toBe(true);
  });

  it('is false when the officer is outside the radius', () => {
    const farAway = { lat: -25.7479, lng: 28.2293 }; // Pretoria, ~50km away
    expect(isWithinRadius(farAway, center, 500)).toBe(false);
  });

  it('is false for a zero or negative radius', () => {
    expect(isWithinRadius(center, center, 0)).toBe(false);
    expect(isWithinRadius(center, center, -10)).toBe(false);
  });
});

describe('formatApproxDistance', () => {
  it('formats sub-kilometre distances rounded to the nearest 50m', () => {
    expect(formatApproxDistance(120)).toBe('100m');
    expect(formatApproxDistance(430)).toBe('450m');
  });

  it('formats distances at or above ~1km in km with one decimal', () => {
    expect(formatApproxDistance(1500)).toBe('1.5km');
    expect(formatApproxDistance(24000)).toBe('24.0km');
  });
});

import { isValidLatitude, isValidLongitude, LOCATION_ACCURACY_THRESHOLD_METERS } from '../../src/lib/geo';

describe('isValidLatitude', () => {
  it('accepts values within -90 and 90', () => {
    expect(isValidLatitude(-90)).toBe(true);
    expect(isValidLatitude(0)).toBe(true);
    expect(isValidLatitude(90)).toBe(true);
    expect(isValidLatitude(-26.2041)).toBe(true);
  });

  it('rejects values outside -90 and 90', () => {
    expect(isValidLatitude(90.1)).toBe(false);
    expect(isValidLatitude(-90.1)).toBe(false);
    expect(isValidLatitude(NaN)).toBe(false);
  });
});

describe('isValidLongitude', () => {
  it('accepts values within -180 and 180', () => {
    expect(isValidLongitude(-180)).toBe(true);
    expect(isValidLongitude(0)).toBe(true);
    expect(isValidLongitude(180)).toBe(true);
    expect(isValidLongitude(28.0473)).toBe(true);
  });

  it('rejects values outside -180 and 180', () => {
    expect(isValidLongitude(180.1)).toBe(false);
    expect(isValidLongitude(-180.1)).toBe(false);
    expect(isValidLongitude(NaN)).toBe(false);
  });
});

describe('LOCATION_ACCURACY_THRESHOLD_METERS', () => {
  it('is a positive, finite threshold shared by proximity and current-location reads', () => {
    expect(Number.isFinite(LOCATION_ACCURACY_THRESHOLD_METERS)).toBe(true);
    expect(LOCATION_ACCURACY_THRESHOLD_METERS).toBeGreaterThan(0);
  });
});

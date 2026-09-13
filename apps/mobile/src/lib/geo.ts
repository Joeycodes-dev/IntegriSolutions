export function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

/** A GPS fix worse than this (metres, horizontal accuracy) is too coarse to
 * trust — shared by OfficerDashboardScreen's proximity read and
 * LocationInput's "Use current location" so both apply the same safeguard. */
export const LOCATION_ACCURACY_THRESHOLD_METERS = 100;

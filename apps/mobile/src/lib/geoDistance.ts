export interface Coordinates {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance between two points, in metres (haversine formula).
 * No dependency needed — pure math, same precision class as the app's
 * existing GPS-based location bounds already used for roadblock shifts. */
export function distanceMeters(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_METERS * c;
}

export function isWithinRadius(officer: Coordinates, target: Coordinates, radiusMeters: number): boolean {
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) return false;
  return distanceMeters(officer, target) <= radiusMeters;
}

/** Rounded, approximate distance for display — never claims false precision. */
export function formatApproxDistance(meters: number): string {
  if (meters < 950) {
    return `${Math.max(50, Math.round(meters / 50) * 50)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}

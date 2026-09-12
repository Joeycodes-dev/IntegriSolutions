import type { AlertSighting, AlertSightingFilters, OperationalAlertType } from '../types';

/**
 * Consistent neutral labeling for anything derived from a possible-match
 * report. A reported sighting is an escalation signal, never a confirmed
 * location, wanted/stolen status, or identification — the Map/Heatmap UI
 * must never say "suspect located", "wanted vehicle found", or "confirmed
 * match". See backend/src/routes/alerts.ts's MATCH_ESCALATION_DISCLAIMER for
 * the same rule applied to the chat escalation message.
 */
export const SIGHTING_LABEL = 'Reported sighting';
export const SIGHTING_DISCLAIMER =
  'These are officer-reported possible-match sightings only — not confirmed locations, and not a determination that a person or vehicle is wanted, stolen, arrested, or legally identified.';
export const HEATMAP_DISCLAIMER =
  'This shows where officers have recently reported alert sightings — it does not predict crime or infer where a person or vehicle is likely to be.';

const ALERT_TYPE_LABELS: Record<OperationalAlertType, string> = {
  bolo_person: 'BOLO — Person',
  bolo_vehicle: 'BOLO — Vehicle',
  hazard: 'Hazard',
  general: 'General'
};

export function alertTypeLabel(alertType: OperationalAlertType | string): string {
  return ALERT_TYPE_LABELS[alertType as OperationalAlertType] ?? alertType;
}

/** Compact local date/time for popups and list rows. */
export function formatDateTimeShort(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return isoTimestamp;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

/** Sightings without both coordinates can't be placed on a map — exclude
 * them defensively even though the API already filters server-side. */
export function hasCoordinates(sighting: AlertSighting): boolean {
  return (
    typeof sighting.locationLat === 'number' &&
    Number.isFinite(sighting.locationLat) &&
    typeof sighting.locationLng === 'number' &&
    Number.isFinite(sighting.locationLng)
  );
}

export function filterSightings(sightings: AlertSighting[], filters: AlertSightingFilters): AlertSighting[] {
  const fromMs = filters.from ? new Date(filters.from).getTime() : null;
  const toMs = filters.to ? new Date(filters.to).getTime() : null;

  return sightings.filter((sighting) => {
    if (!hasCoordinates(sighting)) return false;
    if (filters.alertType && sighting.alertType !== filters.alertType) return false;
    if (filters.priority && sighting.priority !== filters.priority) return false;
    if (filters.alertId && sighting.alertId !== filters.alertId) return false;

    if (fromMs != null || toMs != null) {
      const createdMs = new Date(sighting.createdAt).getTime();
      if (Number.isNaN(createdMs)) return false;
      if (fromMs != null && createdMs < fromMs) return false;
      if (toMs != null && createdMs > toMs) return false;
    }

    return true;
  });
}

export interface SightingMapMarker {
  id: number;
  lat: number;
  lng: number;
  label: string;
  alertTypeLabel: string;
  priority: string;
  reportedAt: string;
  officerName: string;
  badgeNumber: string;
  provenanceLabel: string;
  notes: string;
}

function provenanceLabel(sighting: AlertSighting): string {
  return sighting.sourceType === 'external'
    ? `External — ${sighting.sourceAuthority ?? 'Unknown authority'}`
    : 'Internal';
}

/** Transforms raw sightings into map-marker-shaped data. Pure/no Leaflet
 * dependency, so this is unit-testable without rendering a map. */
export function toMapMarkers(sightings: AlertSighting[]): SightingMapMarker[] {
  return sightings.filter(hasCoordinates).map((sighting) => ({
    id: sighting.id,
    lat: sighting.locationLat,
    lng: sighting.locationLng,
    label: SIGHTING_LABEL,
    alertTypeLabel: alertTypeLabel(sighting.alertType),
    priority: sighting.priority,
    reportedAt: sighting.createdAt,
    officerName: sighting.officerName,
    badgeNumber: sighting.badgeNumber,
    provenanceLabel: provenanceLabel(sighting),
    notes: sighting.notes
  }));
}

export interface HeatmapCell {
  key: string;
  lat: number;
  lng: number;
  count: number;
}

/**
 * Grid-bins sightings into density cells for a simple, dependency-free
 * heatmap approximation (round coordinates to a cell, count occurrences per
 * cell) — the same technique already used for the existing DUI-test hotspot
 * map in SupervisorOverview.tsx. This answers "where have officers recently
 * reported sightings", not a predictive crime-density model.
 */
export function buildHeatmapCells(sightings: AlertSighting[], precision = 3): HeatmapCell[] {
  const cells = new Map<string, HeatmapCell>();

  for (const sighting of sightings) {
    if (!hasCoordinates(sighting)) continue;
    const lat = Number(sighting.locationLat.toFixed(precision));
    const lng = Number(sighting.locationLng.toFixed(precision));
    const key = `${lat},${lng}`;

    const existing = cells.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      cells.set(key, { key, lat, lng, count: 1 });
    }
  }

  return Array.from(cells.values()).sort((a, b) => b.count - a.count);
}

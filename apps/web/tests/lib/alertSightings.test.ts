import { describe, expect, it } from 'vitest';
import {
  HEATMAP_DISCLAIMER,
  SIGHTING_DISCLAIMER,
  SIGHTING_LABEL,
  alertTypeLabel,
  buildHeatmapCells,
  filterSightings,
  hasCoordinates,
  toMapMarkers
} from '../../src/lib/alertSightings';
import type { AlertSighting } from '../../src/types';

function sighting(partial: Partial<AlertSighting> & Pick<AlertSighting, 'id'>): AlertSighting {
  return {
    alertId: 'alert-1',
    notes: 'Possible match near intersection',
    locationLat: -26.2041,
    locationLng: 28.0473,
    createdAt: '2026-09-01T10:00:00Z',
    officerId: 1,
    officerName: 'Thabo Nkosi',
    badgeNumber: 'SN100',
    alertType: 'bolo_vehicle',
    alertDescription: 'Stolen vehicle reported',
    priority: 'high',
    alertStatus: 'active',
    sourceType: 'internal',
    sourceAuthority: null,
    ...partial
  };
}

describe('alertSightings', () => {
  describe('labeling stays neutral', () => {
    // These are affirmative/confirmatory phrases the UI must never use. The
    // disclaimers legitimately contain words like "identified" or "locations"
    // as part of *denying* confirmation, so the check targets exact forbidden
    // phrases rather than bare words that would also match that denial text.
    const forbidden = [/suspect located/i, /wanted vehicle found/i, /confirmed match/i];

    it('never uses confirmatory phrases in the label or disclaimers', () => {
      expect(SIGHTING_LABEL).toBe('Reported sighting');
      for (const pattern of forbidden) {
        expect(SIGHTING_LABEL).not.toMatch(pattern);
        expect(SIGHTING_DISCLAIMER).not.toMatch(pattern);
        expect(HEATMAP_DISCLAIMER).not.toMatch(pattern);
      }
    });

    it('disclaimers explicitly deny confirmation of legal status', () => {
      expect(SIGHTING_DISCLAIMER).toMatch(/not confirmed/i);
      expect(SIGHTING_DISCLAIMER).toMatch(/not a determination/i);
      expect(HEATMAP_DISCLAIMER).toMatch(/does not predict/i);
    });

    it('labels alert types with human-readable text', () => {
      expect(alertTypeLabel('bolo_person')).toBe('BOLO — Person');
      expect(alertTypeLabel('bolo_vehicle')).toBe('BOLO — Vehicle');
      expect(alertTypeLabel('hazard')).toBe('Hazard');
      expect(alertTypeLabel('general')).toBe('General');
      expect(alertTypeLabel('unknown_type')).toBe('unknown_type');
    });
  });

  describe('hasCoordinates', () => {
    it('returns true when both lat and lng are finite numbers', () => {
      expect(hasCoordinates(sighting({ id: 1 }))).toBe(true);
    });

    it('returns false when a coordinate is missing or not finite', () => {
      expect(hasCoordinates(sighting({ id: 2, locationLat: null as unknown as number }))).toBe(false);
      expect(hasCoordinates(sighting({ id: 3, locationLng: Number.NaN }))).toBe(false);
    });
  });

  describe('filterSightings', () => {
    const dataset: AlertSighting[] = [
      sighting({ id: 1, alertId: 'a1', alertType: 'bolo_vehicle', priority: 'high', createdAt: '2026-09-01T08:00:00Z' }),
      sighting({ id: 2, alertId: 'a2', alertType: 'hazard', priority: 'low', createdAt: '2026-09-05T08:00:00Z' }),
      sighting({ id: 3, alertId: 'a1', alertType: 'bolo_vehicle', priority: 'medium', createdAt: '2026-09-10T08:00:00Z' }),
      sighting({ id: 4, locationLat: null as unknown as number })
    ];

    it('excludes records without coordinates even with no filters applied', () => {
      const result = filterSightings(dataset, {});
      expect(result.map((s) => s.id)).toEqual([1, 2, 3]);
    });

    it('filters by alert type', () => {
      const result = filterSightings(dataset, { alertType: 'hazard' });
      expect(result.map((s) => s.id)).toEqual([2]);
    });

    it('filters by priority', () => {
      const result = filterSightings(dataset, { priority: 'medium' });
      expect(result.map((s) => s.id)).toEqual([3]);
    });

    it('filters by the critical priority tier', () => {
      const withCritical = [...dataset, sighting({ id: 5, alertId: 'a3', priority: 'critical', createdAt: '2026-09-11T08:00:00Z' })];
      const result = filterSightings(withCritical, { priority: 'critical' });
      expect(result.map((s) => s.id)).toEqual([5]);
    });

    it('filters by specific alert id', () => {
      const result = filterSightings(dataset, { alertId: 'a1' });
      expect(result.map((s) => s.id)).toEqual([1, 3]);
    });

    it('filters by a date-time range', () => {
      const result = filterSightings(dataset, { from: '2026-09-02T00:00:00Z', to: '2026-09-06T00:00:00Z' });
      expect(result.map((s) => s.id)).toEqual([2]);
    });

    it('combines multiple filters', () => {
      const result = filterSightings(dataset, { alertType: 'bolo_vehicle', priority: 'high' });
      expect(result.map((s) => s.id)).toEqual([1]);
    });
  });

  describe('toMapMarkers', () => {
    it('transforms sightings into marker-shaped data with a neutral label', () => {
      const markers = toMapMarkers([
        sighting({ id: 1, locationLat: -25.7, locationLng: 28.2, sourceType: 'internal' })
      ]);
      expect(markers).toHaveLength(1);
      expect(markers[0]).toMatchObject({
        id: 1,
        lat: -25.7,
        lng: 28.2,
        label: 'Reported sighting',
        alertTypeLabel: 'BOLO — Vehicle',
        priority: 'high',
        officerName: 'Thabo Nkosi',
        badgeNumber: 'SN100',
        provenanceLabel: 'Internal'
      });
    });

    it('labels external provenance with the source authority', () => {
      const markers = toMapMarkers([
        sighting({ id: 2, sourceType: 'external', sourceAuthority: 'SAPS Klerksdorp' })
      ]);
      expect(markers[0].provenanceLabel).toBe('External — SAPS Klerksdorp');
    });

    it('excludes sightings without coordinates', () => {
      const markers = toMapMarkers([sighting({ id: 3, locationLat: null as unknown as number })]);
      expect(markers).toHaveLength(0);
    });
  });

  describe('buildHeatmapCells', () => {
    it('bins sightings into cells by rounded coordinates and counts occurrences', () => {
      const cells = buildHeatmapCells([
        sighting({ id: 1, locationLat: -26.20411, locationLng: 28.04731 }),
        sighting({ id: 2, locationLat: -26.20412, locationLng: 28.04732 }),
        sighting({ id: 3, locationLat: -25.0, locationLng: 30.0 })
      ]);

      expect(cells).toHaveLength(2);
      expect(cells[0].count).toBe(2);
      expect(cells[1].count).toBe(1);
    });

    it('excludes sightings without coordinates from the aggregate', () => {
      const cells = buildHeatmapCells([sighting({ id: 1, locationLat: null as unknown as number })]);
      expect(cells).toHaveLength(0);
    });
  });
});

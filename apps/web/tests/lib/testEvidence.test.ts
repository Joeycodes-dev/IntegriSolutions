import { describe, expect, it } from 'vitest';
import {
  buildTestEvidence,
  parseTestLocation,
  resolveEvidencePhotoUrls
} from '../../src/lib/testEvidence';
import type { TestRecord } from '../../src/types';

const courtLocation = {
  lat: -26.2041,
  lng: 28.0473,
  roadblock: 'N1 Midrand roadblock',
  station: 'Midrand SAPS',
  officerRank: 'Constable',
  serviceNumber: 'SAP12345',
  officerNotes: 'Driver smelled of alcohol.',
  driverCategory: 'General Driver (limit 0.05g/100ml)',
  label: 'N1 Midrand roadblock'
};

const baseTest: TestRecord = {
  id: 'test-court-1',
  officerId: 1,
  officerName: 'John Doe',
  badgeNumber: '12345',
  driverName: 'Jane Smith',
  driverId: '9876543210123',
  bacReading: 0.08,
  result: 'fail',
  createdAt: '2026-05-30T10:00:00Z',
  hash: 'abc',
  hashValid: true
};

describe('parseTestLocation', () => {
  it('parses court fields from JSON string', () => {
    const parsed = parseTestLocation(JSON.stringify(courtLocation));
    expect(parsed.roadblock).toBe('N1 Midrand roadblock');
    expect(parsed.station).toBe('Midrand SAPS');
    expect(parsed.officerNotes).toBe('Driver smelled of alcohol.');
  });

  it('parses court fields from object payloads', () => {
    const parsed = parseTestLocation(courtLocation);
    expect(parsed.roadblock).toBe('N1 Midrand roadblock');
    expect(parsed.officerRank).toBe('Constable');
  });

  it('parses double-encoded JSON from legacy sync rows', () => {
    const parsed = parseTestLocation(JSON.stringify(JSON.stringify(courtLocation)));
    expect(parsed.roadblock).toBe('N1 Midrand roadblock');
  });
});

describe('buildTestEvidence', () => {
  it('maps mobile court fields into evidence review data', () => {
    const evidence = buildTestEvidence({
      ...baseTest,
      location: JSON.stringify(courtLocation)
    });

    expect(evidence.roadblock).toBe('N1 Midrand roadblock');
    expect(evidence.station).toBe('Midrand SAPS');
    expect(evidence.officerNotes).toBe('Driver smelled of alcohol.');
    expect(evidence.rank).toBe('Constable');
    expect(evidence.locationLabel).toBe('N1 Midrand roadblock');
  });
});

describe('resolveEvidencePhotoUrls', () => {
  it('returns only real URLs and never stock placeholders', () => {
    expect(resolveEvidencePhotoUrls([])).toEqual([]);
    expect(resolveEvidencePhotoUrls(['https://cdn.example/photo.jpg'])).toEqual([
      'https://cdn.example/photo.jpg'
    ]);
    expect(resolveEvidencePhotoUrls(['', '  '])).toEqual([]);
  });
});

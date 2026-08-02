import {
  buildTestLocation,
  deriveDriverCategory,
  stationFromProfileRegion,
  DRIVER_CATEGORIES
} from '../../src/lib/testLocation';

describe('testLocation helpers', () => {
  it('parses station from plain region text', () => {
    expect(stationFromProfileRegion('Sandton SAPS')).toBe('Sandton SAPS');
  });

  it('parses station from JSON region', () => {
    expect(
      stationFromProfileRegion(JSON.stringify({ address: 'Midrand Station' }))
    ).toBe('Midrand Station');
  });

  it('builds court location payload with GPS and court fields', () => {
    const location = buildTestLocation({
      lat: -26.1,
      lng: 28.05,
      roadblock: 'N1 Midrand',
      station: 'Midrand Station',
      officerRank: 'Constable',
      serviceNumber: 'SAP123',
      officerNotes: 'Night shift',
      driverCategory: DRIVER_CATEGORIES[0]
    });

    expect(location).toMatchObject({
      lat: -26.1,
      lng: 28.05,
      roadblock: 'N1 Midrand',
      station: 'Midrand Station',
      officerRank: 'Constable',
      serviceNumber: 'SAP123',
      officerNotes: 'Night shift',
      label: 'N1 Midrand'
    });
  });

  it('inherits roadblock shift metadata into the test location payload', () => {
    const location = buildTestLocation({
      lat: -26.1,
      lng: 28.05,
      roadblock: '',
      station: '',
      roadblockShift: {
        id: 'shift-123',
        roadblockName: 'R21 Edenvale Checkpoint',
        station: 'Edenvale SAPS',
        supervisorEmail: 'supervisor@example.com',
        supervisorName: 'Supervisor One',
        startsAt: '2026-07-31T08:00:00.000Z',
        endsAt: '2026-07-31T16:00:00.000Z',
        centerLat: -26.15,
        centerLng: 28.2,
        radiusMeters: 500
      },
      officerRank: 'Constable',
      serviceNumber: 'SAP123',
      officerNotes: 'Assigned shift capture',
      driverCategory: DRIVER_CATEGORIES[0]
    });

    expect(location).toMatchObject({
      roadblockId: 'shift-123',
      roadblock: 'R21 Edenvale Checkpoint',
      station: 'Edenvale SAPS',
      supervisorEmail: 'supervisor@example.com',
      supervisorName: 'Supervisor One',
      shiftStartsAt: '2026-07-31T08:00:00.000Z',
      shiftEndsAt: '2026-07-31T16:00:00.000Z',
      label: 'R21 Edenvale Checkpoint',
      locationBounds: {
        centerLat: -26.15,
        centerLng: 28.2,
        radiusMeters: 500
      }
    });
  });

  it('snapshots the effective BAC policy for the captured record', () => {
    const location = buildTestLocation({
      lat: -26.1,
      lng: 28.05,
      roadblock: 'N1 Midrand',
      station: 'Midrand Station',
      officerRank: 'Constable',
      serviceNumber: 'SAP123',
      officerNotes: '',
      driverCategory: 'Professional Driver (limit 0.03g/100ml)',
      driverCategoryKey: 'professional',
      bacLimitG100ml: 0.03,
      bacLimitMg1000ml: 0.12
    });

    expect(location).toMatchObject({
      driverCategory: 'Professional Driver (limit 0.03g/100ml)',
      driverCategoryKey: 'professional',
      bacLimitG100ml: 0.03,
      bacLimitMg1000ml: 0.12
    });
  });
});

describe('deriveDriverCategory', () => {
  it('classifies general licence codes as general', () => {
    expect(deriveDriverCategory('B')).toBe('general');
    expect(deriveDriverCategory('A B')).toBe('general');
    expect(deriveDriverCategory('EB')).toBe('general');
    expect(deriveDriverCategory('')).toBe('general');
  });

  it('classifies professional driving permit and heavy-vehicle codes as professional', () => {
    expect(deriveDriverCategory('P')).toBe('professional');
    expect(deriveDriverCategory('B, C')).toBe('professional');
    expect(deriveDriverCategory('C1')).toBe('professional');
    expect(deriveDriverCategory('EC')).toBe('professional');
    expect(deriveDriverCategory('EC1')).toBe('professional');
    expect(deriveDriverCategory('G')).toBe('professional');
  });

  it('is case-insensitive', () => {
    expect(deriveDriverCategory('b, c')).toBe('professional');
    expect(deriveDriverCategory('b')).toBe('general');
  });
});

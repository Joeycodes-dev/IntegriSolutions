import {
  buildTestLocation,
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
});

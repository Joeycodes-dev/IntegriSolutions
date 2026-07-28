import { hashData } from '../../src/utilities/hash';
import { getTestHashValidity } from '../../src/utilities/testIntegrity';

const baseRow = {
  id: 'test-123',
  officer_id: 1,
  officer_name: 'John Doe',
  badge_number: '12345',
  driver_name: 'Jane Smith',
  driver_id: '9876543210123',
  driver_dob: '1990-01-01',
  bac_reading: 0.08,
  result: 'fail',
  location: JSON.stringify({ lat: -26.2041, lng: 28.0473 }),
  created_at: '2026-05-30T10:00:00Z',
  original_test_id: null
};

describe('getTestHashValidity', () => {
  it('validates records hashed from backend database payloads', () => {
    const hash = hashData({
      officer_id: baseRow.officer_id,
      officer_name: baseRow.officer_name,
      badge_number: baseRow.badge_number,
      driver_name: baseRow.driver_name,
      driver_id: baseRow.driver_id,
      driver_dob: baseRow.driver_dob,
      bac_reading: baseRow.bac_reading,
      result: baseRow.result,
      location: baseRow.location,
      created_at: baseRow.created_at,
      original_test_id: baseRow.original_test_id
    });

    expect(getTestHashValidity({ ...baseRow, hash })).toBe(true);
  });

  it('validates records hashed from mobile capture payloads', () => {
    const hash = hashData({
      officerId: baseRow.officer_id,
      officerName: baseRow.officer_name,
      badgeNumber: baseRow.badge_number,
      driverName: baseRow.driver_name,
      driverId: baseRow.driver_id,
      driverDob: baseRow.driver_dob,
      bacReading: baseRow.bac_reading,
      result: baseRow.result,
      location: JSON.parse(baseRow.location),
      createdAt: baseRow.created_at,
      originalTestId: baseRow.original_test_id
    });

    expect(getTestHashValidity({ ...baseRow, hash })).toBe(true);
  });

  it('validates mobile hashes when Supabase returns numeric and timestamp fields in different formats', () => {
    const hash = hashData({
      officerId: 23,
      officerName: baseRow.officer_name,
      badgeNumber: baseRow.badge_number,
      driverName: baseRow.driver_name,
      driverId: baseRow.driver_id,
      driverDob: baseRow.driver_dob,
      bacReading: 0.062,
      result: baseRow.result,
      location: JSON.parse(baseRow.location),
      createdAt: '2026-05-30T10:00:00.000Z',
      originalTestId: null
    });

    expect(getTestHashValidity({
      ...baseRow,
      officer_id: '23',
      bac_reading: '0.062',
      created_at: '2026-05-30T10:00:00+00:00',
      hash
    })).toBe(true);
  });

  it('validates legacy hashes that did not include originalTestId', () => {
    const hash = hashData({
      officerId: baseRow.officer_id,
      officerName: baseRow.officer_name,
      badgeNumber: baseRow.badge_number,
      driverName: baseRow.driver_name,
      driverId: baseRow.driver_id,
      driverDob: baseRow.driver_dob,
      bacReading: baseRow.bac_reading,
      result: baseRow.result,
      location: JSON.parse(baseRow.location),
      createdAt: baseRow.created_at
    });

    expect(getTestHashValidity({ ...baseRow, hash })).toBe(true);
  });

  it('flags records when protected values change', () => {
    const hash = hashData({
      officer_id: baseRow.officer_id,
      officer_name: baseRow.officer_name,
      badge_number: baseRow.badge_number,
      driver_name: baseRow.driver_name,
      driver_id: baseRow.driver_id,
      driver_dob: baseRow.driver_dob,
      bac_reading: baseRow.bac_reading,
      result: baseRow.result,
      location: baseRow.location,
      created_at: baseRow.created_at,
      original_test_id: baseRow.original_test_id
    });

    expect(getTestHashValidity({ ...baseRow, bac_reading: 0.12, hash })).toBe(false);
  });

  it('returns null when no hash is stored', () => {
    expect(getTestHashValidity({ ...baseRow, hash: null })).toBeNull();
  });
});
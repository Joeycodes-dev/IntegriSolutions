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

  it('validates mobile hashes that include device custody fields', () => {
    const deviceRow = {
      ...baseRow,
      device_transport: 'simulated',
      device_serial: null,
      device_calibration_version: 'mq3-default-v1+clean-air',
      device_calibration_r0: 7524.99,
      device_session_peak_raw: 812,
      device_avg_raw: 640,
      device_raw: 623,
      device_captured_at: '2026-09-21T10:15:00.000Z'
    };

    const hash = hashData({
      officerId: deviceRow.officer_id,
      officerName: deviceRow.officer_name,
      badgeNumber: deviceRow.badge_number,
      driverName: deviceRow.driver_name,
      driverId: deviceRow.driver_id,
      driverDob: deviceRow.driver_dob,
      bacReading: deviceRow.bac_reading,
      result: deviceRow.result,
      location: JSON.parse(baseRow.location),
      createdAt: deviceRow.created_at,
      originalTestId: null,
      deviceTransport: 'simulated',
      deviceCalibrationVersion: 'mq3-default-v1+clean-air',
      deviceCalibrationR0: 7524.99,
      deviceSessionPeakRaw: 812,
      deviceAvgRaw: 640,
      deviceRaw: 623,
      deviceCapturedAt: '2026-09-21T10:15:00.000Z'
    });

    expect(getTestHashValidity({ ...deviceRow, hash })).toBe(true);
  });

  it('validates mobile device hashes when Supabase returns numeric values as strings', () => {
    const deviceRow = {
      ...baseRow,
      device_transport: 'ble',
      device_serial: 'MQ3-0042',
      device_calibration_version: 'mq3-default-v1',
      device_calibration_r0: '7524.99',
      device_session_peak_raw: '812',
      device_avg_raw: '640',
      device_raw: '623',
      device_captured_at: '2026-09-21T10:15:00.000Z'
    };

    const hash = hashData({
      officerId: deviceRow.officer_id,
      officerName: deviceRow.officer_name,
      badgeNumber: deviceRow.badge_number,
      driverName: deviceRow.driver_name,
      driverId: deviceRow.driver_id,
      driverDob: deviceRow.driver_dob,
      bacReading: deviceRow.bac_reading,
      result: deviceRow.result,
      location: JSON.parse(baseRow.location),
      createdAt: deviceRow.created_at,
      originalTestId: null,
      deviceTransport: 'ble',
      deviceSerial: 'MQ3-0042',
      deviceCalibrationVersion: 'mq3-default-v1',
      deviceCalibrationR0: 7524.99,
      deviceSessionPeakRaw: 812,
      deviceAvgRaw: 640,
      deviceRaw: 623,
      deviceCapturedAt: '2026-09-21T10:15:00.000Z'
    });

    expect(getTestHashValidity({ ...deviceRow, hash })).toBe(true);
  });

  it('validates backend database hashes that include device custody fields', () => {
    const deviceRow = {
      ...baseRow,
      device_transport: 'ble',
      device_serial: 'MQ3-0042',
      device_calibration_version: 'mq3-default-v1',
      device_calibration_r0: 7524.99,
      device_session_peak_raw: 812,
      device_avg_raw: 640,
      device_raw: 623,
      device_captured_at: '2026-09-21T10:15:00.000Z'
    };

    const hash = hashData({
      officer_id: deviceRow.officer_id,
      officer_name: deviceRow.officer_name,
      badge_number: deviceRow.badge_number,
      driver_name: deviceRow.driver_name,
      driver_id: deviceRow.driver_id,
      driver_dob: deviceRow.driver_dob,
      bac_reading: deviceRow.bac_reading,
      result: deviceRow.result,
      location: deviceRow.location,
      created_at: deviceRow.created_at,
      original_test_id: deviceRow.original_test_id,
      device_transport: 'ble',
      device_serial: 'MQ3-0042',
      device_calibration_version: 'mq3-default-v1',
      device_calibration_r0: 7524.99,
      device_session_peak_raw: 812,
      device_avg_raw: 640,
      device_raw: 623,
      device_captured_at: '2026-09-21T10:15:00.000Z'
    });

    expect(getTestHashValidity({ ...deviceRow, hash })).toBe(true);
  });

  it('flags records when device custody fields change', () => {
    const deviceRow = {
      ...baseRow,
      device_transport: 'ble',
      device_serial: null,
      device_calibration_version: 'mq3-default-v1',
      device_calibration_r0: 7524.99,
      device_session_peak_raw: 812,
      device_avg_raw: 640,
      device_raw: 623,
      device_captured_at: '2026-09-21T10:15:00.000Z'
    };

    const hash = hashData({
      officerId: deviceRow.officer_id,
      officerName: deviceRow.officer_name,
      badgeNumber: deviceRow.badge_number,
      driverName: deviceRow.driver_name,
      driverId: deviceRow.driver_id,
      driverDob: deviceRow.driver_dob,
      bacReading: deviceRow.bac_reading,
      result: deviceRow.result,
      location: JSON.parse(baseRow.location),
      createdAt: deviceRow.created_at,
      originalTestId: null,
      deviceTransport: 'ble',
      deviceCalibrationVersion: 'mq3-default-v1',
      deviceCalibrationR0: 7524.99,
      deviceSessionPeakRaw: 812,
      deviceAvgRaw: 640,
      deviceRaw: 623,
      deviceCapturedAt: '2026-09-21T10:15:00.000Z'
    });

    expect(getTestHashValidity({ ...deviceRow, device_session_peak_raw: 300, hash })).toBe(false);
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
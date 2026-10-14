import { hashData } from '../../src/utilities/hash';
import { getTestHashValidity } from '../../src/utilities/testIntegrity';
import { mapDeviceCustodyRow, parseCustodySerial } from '../../src/utilities/deviceCustody';

describe('device custody hash contract', () => {
  it('verifies the payload shape the mobile app hashes for device-captured tests', () => {
    const createdAt = '2026-09-21T14:09:24.519Z';
    const location = {
      lat: -26.1,
      lng: 28.05,
      roadblock: 'N1 Midrand',
      station: 'Midrand SAPS',
      label: 'N1 Midrand'
    };

    const mobilePayload = {
      officerId: 1,
      officerName: 'Officer One',
      badgeNumber: 'B001',
      driverName: 'Driver A',
      driverId: 'enc:DL*01:3fe9a4c8c82c514df62eb2e4',
      driverDob: '1990-01-01',
      bacReading: 0.08,
      result: 'fail',
      location,
      createdAt,
      originalTestId: null,
      deviceTransport: 'simulated',
      deviceCalibrationVersion: 'mq3-default-v1',
      deviceCalibrationR0: 7532,
      deviceSessionPeakRaw: 812,
      deviceAvgRaw: 640,
      deviceRaw: 623,
      deviceCapturedAt: '2026-09-21T10:15:00.000Z'
    };

    const hash = hashData(mobilePayload);

    expect(
      getTestHashValidity({
        officer_id: 1,
        officer_name: 'Officer One',
        badge_number: 'B001',
        driver_name: 'Driver A',
        driver_id: 'enc:DL*01:3fe9a4c8c82c514df62eb2e4',
        driver_dob: '1990-01-01',
        bac_reading: 0.08,
        result: 'fail',
        location: JSON.stringify(location),
        created_at: createdAt,
        original_test_id: null,
        device_transport: 'simulated',
        device_serial: null,
        device_calibration_version: 'mq3-default-v1',
        device_calibration_r0: 7532,
        device_session_peak_raw: 812,
        device_avg_raw: 640,
        device_raw: 623,
        device_captured_at: '2026-09-21T10:15:00.000Z',
        hash
      })
    ).toBe(true);
  });

  it('verifies a device-captured payload that includes a serial number', () => {
    const createdAt = '2026-09-21T14:09:24.519Z';
    const location = { lat: -26.1, lng: 28.05, label: 'N1 Midrand' };

    const mobilePayload = {
      officerId: 1,
      officerName: 'Officer One',
      badgeNumber: 'B001',
      driverName: 'Driver A',
      driverId: 'enc:DL*01:3fe9a4c8c82c514df62eb2e4',
      driverDob: '1990-01-01',
      bacReading: 0.062,
      result: 'fail',
      location,
      createdAt,
      originalTestId: null,
      deviceTransport: 'ble',
      deviceSerial: 'MQ3-0042',
      deviceCalibrationVersion: 'mq3-default-v1+clean-air',
      deviceCalibrationR0: 7524.99,
      deviceSessionPeakRaw: 812,
      deviceAvgRaw: 640,
      deviceRaw: 623,
      deviceCapturedAt: '2026-09-21T10:15:00.000Z'
    };

    const hash = hashData(mobilePayload);

    expect(
      getTestHashValidity({
        officer_id: 1,
        officer_name: 'Officer One',
        badge_number: 'B001',
        driver_name: 'Driver A',
        driver_id: 'enc:DL*01:3fe9a4c8c82c514df62eb2e4',
        driver_dob: '1990-01-01',
        bac_reading: 0.062,
        result: 'fail',
        location: JSON.stringify(location),
        created_at: createdAt,
        original_test_id: null,
        device_transport: 'ble',
        device_serial: 'MQ3-0042',
        device_calibration_version: 'mq3-default-v1+clean-air',
        device_calibration_r0: 7524.99,
        device_session_peak_raw: 812,
        device_avg_raw: 640,
        device_raw: 623,
        device_captured_at: '2026-09-21T10:15:00.000Z',
        hash
      })
    ).toBe(true);
  });

  it('keeps legacy payloads verifiable after the device fields were introduced', () => {
    const createdAt = '2026-08-01T10:00:00Z';
    const location = { lat: -26.1, lng: 28.05, label: 'N1 Midrand' };

    const legacyHash = hashData({
      officerId: 1,
      officerName: 'Officer One',
      badgeNumber: 'B001',
      driverName: 'Driver A',
      driverId: 'enc:DL*01:3fe9a4c8c82c514df62eb2e4',
      driverDob: '1990-01-01',
      bacReading: 0.08,
      result: 'fail',
      location,
      createdAt,
      originalTestId: null
    });

    expect(
      getTestHashValidity({
        officer_id: 1,
        officer_name: 'Officer One',
        badge_number: 'B001',
        driver_name: 'Driver A',
        driver_id: 'enc:DL*01:3fe9a4c8c82c514df62eb2e4',
        driver_dob: '1990-01-01',
        bac_reading: 0.08,
        result: 'fail',
        location: JSON.stringify(location),
        created_at: createdAt,
        original_test_id: null,
        hash: legacyHash
      })
    ).toBe(true);
  });

  it('verifies a Bluetooth Classic capture whose serial embeds a paired MAC', () => {
    const createdAt = '2026-09-21T14:09:24.519Z';
    const location = { lat: -26.1, lng: 28.05, label: 'N1 Midrand' };

    const mobilePayload = {
      officerId: 1,
      officerName: 'Officer One',
      badgeNumber: 'B001',
      driverName: 'Driver A',
      driverId: 'enc:DL*01:3fe9a4c8c82c514df62eb2e4',
      driverDob: '1990-01-01',
      bacReading: 0.062,
      result: 'fail',
      location,
      createdAt,
      originalTestId: null,
      deviceTransport: 'bluetooth_classic',
      deviceSerial: 'MQ3-0001@98:D3:31:FD:42:10',
      deviceCalibrationVersion: 'mq3-default-v1+clean-air',
      deviceCalibrationR0: 7524.99,
      deviceSessionPeakRaw: 812,
      deviceAvgRaw: 640,
      deviceRaw: 623,
      deviceCapturedAt: '2026-09-21T10:15:00.000Z'
    };

    const hash = hashData(mobilePayload);

    // The backend hashes/verifies against the exact stored serial string
    // (including the `@<MAC>` suffix), so an end-to-end capture round-trips.
    expect(
      getTestHashValidity({
        officer_id: 1,
        officer_name: 'Officer One',
        badge_number: 'B001',
        driver_name: 'Driver A',
        driver_id: 'enc:DL*01:3fe9a4c8c82c514df62eb2e4',
        driver_dob: '1990-01-01',
        bac_reading: 0.062,
        result: 'fail',
        location: JSON.stringify(location),
        created_at: createdAt,
        original_test_id: null,
        device_transport: 'bluetooth_classic',
        device_serial: 'MQ3-0001@98:D3:31:FD:42:10',
        device_calibration_version: 'mq3-default-v1+clean-air',
        device_calibration_r0: 7524.99,
        device_session_peak_raw: 812,
        device_avg_raw: 640,
        device_raw: 623,
        device_captured_at: '2026-09-21T10:15:00.000Z',
        hash
      })
    ).toBe(true);
  });

  it('extracts the paired MAC from a composite serial without mutating the serial', () => {
    const custody = mapDeviceCustodyRow({
      device_transport: 'bluetooth_classic',
      device_serial: 'MQ3-0001@98:D3:31:FD:42:10',
      device_calibration_version: 'mq3-default-v1',
      device_calibration_r0: 7532,
      device_session_peak_raw: 812,
      device_avg_raw: 640,
      device_raw: 623,
      device_captured_at: '2026-09-21T10:15:00.000Z'
    });

    expect(custody?.deviceAddress).toBe('98:D3:31:FD:42:10');
    // Consumers (and the hash contract) still see the exact stored string.
    expect(custody?.serial).toBe('MQ3-0001@98:D3:31:FD:42:10');
  });

  it('parses composite, MAC-only, plain, and null serials', () => {
    expect(parseCustodySerial('MQ3-0001@98:D3:31:FD:42:10')).toEqual({
      serial: 'MQ3-0001',
      deviceAddress: '98:D3:31:FD:42:10'
    });
    expect(parseCustodySerial('@98:D3:31:FD:42:10')).toEqual({
      serial: null,
      deviceAddress: '98:D3:31:FD:42:10'
    });
    expect(parseCustodySerial('MQ3-0042')).toEqual({
      serial: 'MQ3-0042',
      deviceAddress: null
    });
    expect(parseCustodySerial(null)).toEqual({ serial: null, deviceAddress: null });
  });

  it('does not treat a non-MAC @ segment as a device address', () => {
    expect(mapDeviceCustodyRow({
      device_transport: 'simulated',
      device_serial: 'serial@bot',
      device_calibration_version: 'mq3-default-v1',
      device_calibration_r0: 7532,
      device_session_peak_raw: 812,
      device_avg_raw: 640,
      device_raw: 623,
      device_captured_at: '2026-09-21T10:15:00.000Z'
    })).toMatchObject({ serial: 'serial@bot' });
    expect(mapDeviceCustodyRow({
      device_transport: 'simulated',
      device_serial: 'serial@bot',
      device_calibration_version: 'mq3-default-v1',
      device_calibration_r0: 7532,
      device_session_peak_raw: 812,
      device_avg_raw: 640,
      device_raw: 623,
      device_captured_at: '2026-09-21T10:15:00.000Z'
    })).not.toHaveProperty('deviceAddress');
  });
});

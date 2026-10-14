import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  buildRecordPayload,
  computeHash,
  saveLocally,
  syncPendingRecords
} from '../../src/services/sync';
import * as repository from '../../src/db/repository';
import * as api from '../../src/services/api';
import * as auth from '../../src/services/auth';
import * as audit from '../../src/services/audit';
import {
  DEFAULT_BREATHALYZER_CALIBRATION,
  type DeviceEvidencePayload
} from '../../src/services/breathalyzer';
// `deviceCustody` only type-imports its types, so it loads cleanly under the
// jest-expo runtime. The backend's crypto-backed `hashData`/`getTestHashValidity`
// cannot be imported here (the RN Babel transform emits `@babel/runtime` helpers
// that do not resolve from the backend tree), so the authoritative hash/verify
// contract for `serial@MAC` lives in the backend contract test; this file proves
// the mobile side preserves the composite serial and that the shared row mapper
// extracts the paired MAC.
import { mapDeviceCustodyRow } from '../../../../backend/src/utilities/deviceCustody';

jest.mock('../../src/services/auth', () => ({
  getAccessToken: jest.fn()
}));

jest.mock('../../src/services/api', () => ({
  syncRecords: jest.fn(),
  uploadEvidencePhoto: jest.fn(),
  isNetworkRequestError: jest.fn((err: unknown) => err instanceof Error && /^Network error requesting/.test(err.message)),
  isRateLimitError: jest.fn((err: unknown) => err instanceof Error && err.name === 'RateLimitError')
}));

jest.mock('../../src/services/audit', () => ({
  logAuditEvent: jest.fn()
}));

jest.mock('../../src/db/repository', () => ({
  insertTest: jest.fn(),
  insertEvidenceAttachment: jest.fn(),
  getPendingSync: jest.fn(),
  getTestById: jest.fn(),
  markSyncSuccess: jest.fn(),
  recordSyncAttempt: jest.fn(),
  getPendingAttachments: jest.fn(),
  markAttachmentSyncSuccess: jest.fn(),
  recordAttachmentSyncAttempt: jest.fn()
}));

const repositoryMock = repository as jest.Mocked<typeof repository>;
const apiMock = api as jest.Mocked<typeof api>;
const authMock = auth as jest.Mocked<typeof auth>;
const auditMock = audit as jest.Mocked<typeof audit>;

const location = {
  lat: -26.1,
  lng: 28.05,
  roadblock: 'N1 Midrand',
  station: 'Midrand SAPS',
  label: 'N1 Midrand'
};

const device: DeviceEvidencePayload = {
  transport: 'simulated',
  serial: null,
  calibrationVersion: 'mq3-default-v1',
  calibrationCleanAirResistanceOhms: DEFAULT_BREATHALYZER_CALIBRATION.cleanAirResistanceOhms,
  sessionPeakRaw: 812,
  avgRaw: 640,
  raw: 623,
  capturedAt: '2026-09-21T10:15:00.000Z'
};

const baseRecord = {
  id: 'test-1',
  officerId: 1,
  officerName: 'Officer One',
  badgeNumber: 'B001',
  driverName: 'Driver A',
  driverId: 'DL001',
  driverDob: '1990-01-01',
  bacReading: 0.08,
  result: 'fail',
  location,
  createdAt: '2026-08-01T10:00:00Z'
};

describe('record hash payloads', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps legacy payloads unchanged when no device captured the reading', () => {
    const payload = buildRecordPayload({ ...baseRecord, device: null });

    expect(payload).toEqual({
      officerId: 1,
      officerName: 'Officer One',
      badgeNumber: 'B001',
      driverName: 'Driver A',
      driverId: 'DL001',
      driverDob: '1990-01-01',
      bacReading: 0.08,
      result: 'fail',
      location,
      createdAt: '2026-08-01T10:00:00Z',
      originalTestId: null
    });
    expect(JSON.stringify(payload)).not.toContain('device');
  });

  it('adds device custody fields and omits an unknown serial', () => {
    const payload = buildRecordPayload({ ...baseRecord, device });

    expect(payload).toMatchObject({
      deviceTransport: 'simulated',
      deviceCalibrationVersion: 'mq3-default-v1',
      deviceCalibrationR0: DEFAULT_BREATHALYZER_CALIBRATION.cleanAirResistanceOhms,
      deviceSessionPeakRaw: 812,
      deviceAvgRaw: 640,
      deviceRaw: 623,
      deviceCapturedAt: '2026-09-21T10:15:00.000Z'
    });
    expect(Object.keys(payload)).not.toContain('deviceSerial');

    const withSerial = buildRecordPayload({
      ...baseRecord,
      device: { ...device, serial: 'MQ3-0042' }
    });
    expect(withSerial.deviceSerial).toBe('MQ3-0042');
  });
});

describe('saveLocally device custody', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('hashes and stores device evidence with the record', async () => {
    await saveLocally({ ...baseRecord, device, officerId: 1 });

    expect(repositoryMock.insertTest).toHaveBeenCalledTimes(1);
    const record = repositoryMock.insertTest.mock.calls[0][0] as {
      hash: string;
      createdAt: string;
      driverId: string;
      deviceTransport: string | null;
      deviceSerial: string | null;
      deviceCalibrationR0: number | null;
      deviceSessionPeakRaw: number | null;
      deviceAvgRaw: number | null;
      deviceRaw: number | null;
      deviceCapturedAt: string | null;
    };

    expect(record.deviceTransport).toBe('simulated');
    expect(record.deviceSerial).toBeNull();
    expect(record.deviceCalibrationR0).toBe(
      DEFAULT_BREATHALYZER_CALIBRATION.cleanAirResistanceOhms
    );
    expect(record.deviceSessionPeakRaw).toBe(812);
    expect(record.deviceAvgRaw).toBe(640);
    expect(record.deviceRaw).toBe(623);
    expect(record.deviceCapturedAt).toBe('2026-09-21T10:15:00.000Z');

    const expectedHash = computeHash(
      buildRecordPayload({
        ...baseRecord,
        driverId: record.driverId,
        createdAt: record.createdAt,
        device
      })
    );
    expect(record.hash).toBe(expectedHash);
    expect(auditMock.logAuditEvent).toHaveBeenCalled();
  });

  it('stores records without device columns when no device was used', async () => {
    await saveLocally({ ...baseRecord, officerId: 1 });

    const record = repositoryMock.insertTest.mock.calls[0][0] as {
      deviceTransport: string | null;
      deviceRaw: number | null;
    };
    expect(record.deviceTransport).toBeNull();
    expect(record.deviceRaw).toBeNull();
  });
});

describe('syncPendingRecords device custody', () => {
  const pendingBase = {
    ...baseRecord,
    driverId: 'enc:DL**1:digest',
    location: JSON.stringify(location),
    hash: 'hash-1',
    syncStatus: 'pending_sync' as const,
    syncedAt: null,
    retryCount: 0,
    photoUri: null,
    originalTestId: null
  };

  beforeEach(() => {
    jest.clearAllMocks();
    authMock.getAccessToken.mockResolvedValue('token');
    repositoryMock.getPendingAttachments.mockResolvedValue([]);
    apiMock.syncRecords.mockResolvedValue({ synced: [], failed: [], duplicates: [] });
  });

  it('sends device custody fields in camelCase for device records', async () => {
    repositoryMock.getPendingSync.mockResolvedValue([
      {
        ...pendingBase,
        deviceTransport: 'simulated',
        deviceSerial: 'MQ3-0042',
        deviceCalibrationVersion: 'mq3-default-v1',
        deviceCalibrationR0: 7532,
        deviceSessionPeakRaw: 812,
        deviceAvgRaw: 640,
        deviceRaw: 623,
        deviceCapturedAt: '2026-09-21T10:15:00.000Z'
      }
    ]);

    await syncPendingRecords(1);

    expect(apiMock.syncRecords).toHaveBeenCalledTimes(1);
    const sent = apiMock.syncRecords.mock.calls[0][0][0] as Record<string, unknown>;
    expect(sent).toMatchObject({
      deviceTransport: 'simulated',
      deviceSerial: 'MQ3-0042',
      deviceCalibrationVersion: 'mq3-default-v1',
      deviceCalibrationR0: 7532,
      deviceSessionPeakRaw: 812,
      deviceAvgRaw: 640,
      deviceRaw: 623,
      deviceCapturedAt: '2026-09-21T10:15:00.000Z'
    });
  });

  it('chunks pending records into API-safe batches of 50', async () => {
    const records = Array.from({ length: 51 }, (_, index) => ({
      ...pendingBase,
      id: `test-${index + 1}`
    }));
    repositoryMock.getPendingSync.mockResolvedValue(records);
    apiMock.syncRecords.mockImplementation(async (batch: Array<Record<string, unknown>>) => ({
      synced: batch.map((record) => String(record.id)),
      failed: [],
      duplicates: []
    }));

    const result = await syncPendingRecords(1);

    expect(apiMock.syncRecords).toHaveBeenCalledTimes(2);
    expect(apiMock.syncRecords.mock.calls[0][0]).toHaveLength(50);
    expect(apiMock.syncRecords.mock.calls[1][0]).toHaveLength(1);
    expect(result.synced).toHaveLength(51);
  });

  it('omits device fields for legacy pending records', async () => {
    repositoryMock.getPendingSync.mockResolvedValue([{ ...pendingBase }]);

    await syncPendingRecords(1);

    const sent = apiMock.syncRecords.mock.calls[0][0][0] as Record<string, unknown>;
    expect(JSON.stringify(sent)).not.toContain('device');
  });
});

describe('Bluetooth Classic serial@MAC custody', () => {
  const bluetoothClassicDevice: DeviceEvidencePayload = {
    transport: 'bluetooth_classic',
    serial: 'MQ3-0001@98:D3:31:FD:42:10',
    calibrationVersion: 'mq3-default-v1',
    calibrationCleanAirResistanceOhms: DEFAULT_BREATHALYZER_CALIBRATION.cleanAirResistanceOhms,
    sessionPeakRaw: 812,
    avgRaw: 640,
    raw: 623,
    capturedAt: '2026-09-21T10:15:00.000Z'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    authMock.getAccessToken.mockResolvedValue('token');
    repositoryMock.getPendingAttachments.mockResolvedValue([]);
    apiMock.syncRecords.mockResolvedValue({ synced: [], failed: [], duplicates: [] });
  });

  it('hashes the composite serial@MAC into the custody payload', () => {
    const payload = buildRecordPayload({ ...baseRecord, device: bluetoothClassicDevice });

    // The full composite serial (serial + `@<MAC>`) is what gets hashed and
    // uploaded, so the backend can verify it against the stored device_serial.
    expect(payload.deviceSerial).toBe('MQ3-0001@98:D3:31:FD:42:10');
    expect(
      computeHash(buildRecordPayload({ ...baseRecord, device: bluetoothClassicDevice }))
    ).toBe(computeHash(payload));
    expect(computeHash(payload)).not.toBe(
      computeHash(
        buildRecordPayload({
          ...baseRecord,
          device: { ...bluetoothClassicDevice, serial: 'MQ3-0001@98:D3:31:FD:42:11' }
        })
      )
    );
  });

  it('stores a composite serial@MAC and binds it into the stored hash', async () => {
    await saveLocally({ ...baseRecord, device: bluetoothClassicDevice, officerId: 1 });

    const record = repositoryMock.insertTest.mock.calls[0][0] as {
      hash: string;
      createdAt: string;
      driverId: string;
      deviceSerial: string | null;
    };

    expect(record.deviceSerial).toBe('MQ3-0001@98:D3:31:FD:42:10');

    const expectedHash = computeHash(
      buildRecordPayload({
        ...baseRecord,
        driverId: record.driverId,
        createdAt: record.createdAt,
        device: bluetoothClassicDevice
      })
    );
    expect(record.hash).toBe(expectedHash);
  });

  it('forwards the composite serial@MAC in the synced camelCase payload', async () => {
    repositoryMock.getPendingSync.mockResolvedValue([
      {
        id: 'bt-1',
        officerId: 1,
        officerName: 'Officer One',
        badgeNumber: 'B001',
        driverName: 'Driver A',
        driverId: 'enc:DL**1:digest',
        driverDob: '1990-01-01',
        bacReading: 0.08,
        result: 'fail',
        location: JSON.stringify(location),
        hash: 'hash-bt-1',
        receiptNumber: 'BT-1',
        createdAt: '2026-08-01T10:00:00Z',
        syncStatus: 'pending_sync' as const,
        syncedAt: null,
        retryCount: 0,
        photoUri: null,
        originalTestId: null,
        deviceTransport: 'bluetooth_classic',
        deviceSerial: 'MQ3-0001@98:D3:31:FD:42:10',
        deviceCalibrationVersion: 'mq3-default-v1',
        deviceCalibrationR0: 7532,
        deviceSessionPeakRaw: 812,
        deviceAvgRaw: 640,
        deviceRaw: 623,
        deviceCapturedAt: '2026-09-21T10:15:00.000Z'
      }
    ]);

    await syncPendingRecords(1);

    expect(apiMock.syncRecords).toHaveBeenCalledTimes(1);
    const sent = apiMock.syncRecords.mock.calls[0][0][0] as Record<string, unknown>;
    expect(sent.deviceTransport).toBe('bluetooth_classic');
    expect(sent.deviceSerial).toBe('MQ3-0001@98:D3:31:FD:42:10');
  });

  it('mapDeviceCustodyRow extracts the paired MAC from a composite serial', () => {
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
    // Consumers still see the exact stored composite serial.
    expect(custody?.serial).toBe('MQ3-0001@98:D3:31:FD:42:10');
  });

  it('mapDeviceCustodyRow surfaces the MAC even from a serial-less capture', () => {
    const custody = mapDeviceCustodyRow({
      device_transport: 'bluetooth_classic',
      device_serial: '@98:D3:31:FD:42:10',
      device_calibration_version: 'mq3-default-v1',
      device_calibration_r0: 7532,
      device_session_peak_raw: 812,
      device_avg_raw: 640,
      device_raw: 623,
      device_captured_at: '2026-09-21T10:15:00.000Z'
    });

    expect(custody?.deviceAddress).toBe('98:D3:31:FD:42:10');
    expect(custody?.serial).toBe('@98:D3:31:FD:42:10');
  });
});

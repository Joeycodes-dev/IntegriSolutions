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

jest.mock('../../src/services/auth', () => ({
  getAccessToken: jest.fn()
}));

jest.mock('../../src/services/api', () => ({
  syncRecords: jest.fn(),
  uploadEvidencePhoto: jest.fn()
}));

jest.mock('../../src/services/audit', () => ({
  logAuditEvent: jest.fn()
}));

jest.mock('../../src/db/repository', () => ({
  insertTest: jest.fn(),
  insertEvidenceAttachment: jest.fn(),
  getPendingSync: jest.fn(),
  updateSyncStatus: jest.fn(),
  getPendingAttachments: jest.fn(),
  updateAttachmentSyncStatus: jest.fn()
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

  it('omits device fields for legacy pending records', async () => {
    repositoryMock.getPendingSync.mockResolvedValue([{ ...pendingBase }]);

    await syncPendingRecords(1);

    const sent = apiMock.syncRecords.mock.calls[0][0][0] as Record<string, unknown>;
    expect(JSON.stringify(sent)).not.toContain('device');
  });
});

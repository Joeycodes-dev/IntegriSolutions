import {
  DEFAULT_BREATHALYZER_CALIBRATION,
  type BreathalyzerSnapshot
} from '../../src/services/breathalyzer';
import type { LocalTestRecord } from '../../src/db/repository';
import {
  DEFAULT_BREATHALYZER_DEVICE_PREFERENCES
} from '../../src/services/breathalyzerDeviceStorage';
import {
  buildCaptureReadiness,
  buildDeviceDiagnosticReport,
  calibrationPreview,
  createManualCalibration,
  summarizeDeviceHistory,
  targetRawForBac,
  toCalibrationDraft,
  validateCalibrationDraft
} from '../../src/lib/deviceSettings';

function makeSnapshot(overrides: Partial<BreathalyzerSnapshot> = {}): BreathalyzerSnapshot {
  return {
    connection: 'connected',
    error: null,
    transportKind: 'bluetooth_classic',
    transportLabel: 'HC-06 Classic • HC-06',
    warm: false,
    over: false,
    alarm: false,
    raw: 512,
    avg: 500,
    devicePeak: 640,
    sessionPeak: 620,
    liveBacGdl: 0.04,
    peakBacGdl: 0.052,
    deviceSerial: 'MQ3-0042',
    readings: 12,
    lastReceivedAt: new Date().toISOString(),
    captured: null,
    calibration: DEFAULT_BREATHALYZER_CALIBRATION,
    ...overrides
  };
}

function makeRecord(overrides: Partial<LocalTestRecord> = {}): LocalTestRecord {
  return {
    id: 'test-1',
    officerId: 1,
    officerName: 'Thabo Mokoena',
    badgeNumber: 'B-42',
    driverName: 'Test Driver',
    driverId: '9001015800087',
    driverDob: '1990-01-01',
    bacReading: 0.04,
    result: 'pass',
    location: 'N1 Midrand',
    hash: 'hash',
    syncStatus: 'synced',
    createdAt: '2026-09-24T09:00:00.000Z',
    syncedAt: '2026-09-24T09:01:00.000Z',
    retryCount: 0,
    photoUri: null,
    originalTestId: null,
    deviceTransport: 'bluetooth_classic',
    deviceSerial: 'MQ3-0042',
    deviceCalibrationVersion: DEFAULT_BREATHALYZER_CALIBRATION.version,
    deviceCalibrationR0: DEFAULT_BREATHALYZER_CALIBRATION.cleanAirResistanceOhms,
    deviceSessionPeakRaw: 620,
    deviceAvgRaw: 500,
    deviceRaw: 512,
    deviceCapturedAt: '2026-09-24T09:00:00.000Z',
    ...overrides
  };
}

describe('deviceSettings helpers', () => {
  it('validates and normalizes manual calibration drafts', () => {
    const result = validateCalibrationDraft({
      loadResistorOhms: '1000',
      cleanAirResistanceOhms: '7,532.25',
      mgPerLAtRatioOne: '0.45',
      curveSlope: '-0.7',
      cleanAirRatio: '60'
    });

    expect(result).toEqual({
      ok: true,
      value: {
        loadResistorOhms: 1000,
        cleanAirResistanceOhms: 7532.25,
        mgPerLAtRatioOne: 0.45,
        curveSlope: -0.7,
        cleanAirRatio: 60
      }
    });
  });

  it('rejects unsafe calibration values', () => {
    expect(
      validateCalibrationDraft({
        ...toCalibrationDraft(DEFAULT_BREATHALYZER_CALIBRATION),
        loadResistorOhms: '0'
      }).ok,
    ).toBe(false);
    expect(
      validateCalibrationDraft({
        ...toCalibrationDraft(DEFAULT_BREATHALYZER_CALIBRATION),
        curveSlope: '0'
      }).ok,
    ).toBe(false);
  });

  it('creates an auditable manual calibration version', () => {
    const result = createManualCalibration(
      { ...DEFAULT_BREATHALYZER_CALIBRATION, version: 'mq3-default-v1+clean-air' },
      toCalibrationDraft(DEFAULT_BREATHALYZER_CALIBRATION),
      new Date('2026-09-24T14:35:00.000Z'),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.version).toBe('mq3-default-v1+manual-20260924-1435');
    }
  });

  it('summarizes local device custody by serial and transport', () => {
    const summary = summarizeDeviceHistory([
      makeRecord(),
      makeRecord({
        id: 'test-2',
        syncStatus: 'pending_sync',
        deviceSerial: 'MQ3-0042',
        deviceSessionPeakRaw: 700,
        deviceCapturedAt: '2026-09-24T10:00:00.000Z'
      }),
      makeRecord({
        id: 'test-3',
        syncStatus: 'failed',
        deviceTransport: 'simulated',
        deviceSerial: null,
        deviceSessionPeakRaw: 300,
        deviceCapturedAt: '2026-09-24T11:00:00.000Z'
      }),
      makeRecord({
        id: 'legacy',
        deviceTransport: null,
        deviceSerial: null,
        deviceSessionPeakRaw: null,
        deviceCapturedAt: null
      })
    ]);

    expect(summary.totalLocalRecords).toBe(4);
    expect(summary.deviceCapturedRecords).toBe(3);
    expect(summary.pendingLocalRecords).toBe(1);
    expect(summary.failedLocalRecords).toBe(1);
    expect(summary.byTransport).toEqual([
      { transport: 'bluetooth_classic', count: 2, lastCapturedAt: '2026-09-24T10:00:00.000Z' },
      { transport: 'simulated', count: 1, lastCapturedAt: '2026-09-24T11:00:00.000Z' }
    ]);
    expect(summary.bySerial[0]).toMatchObject({
      serial: 'MQ3-0042',
      count: 2,
      averageSessionPeakRaw: 660
    });
  });

  it('builds capture readiness from the live snapshot', () => {
    const checks = buildCaptureReadiness(makeSnapshot());
    expect(checks.every((check) => check.ok)).toBe(true);

    const waiting = buildCaptureReadiness(makeSnapshot({ warm: true, sessionPeak: null, readings: 0 }));
    expect(waiting.find((check) => check.key === 'warmup')?.ok).toBe(false);
    expect(waiting.find((check) => check.key === 'peak')?.ok).toBe(false);
  });

  it('produces a diagnostic report that preserves custody values and firmware limits', () => {
    const report = buildDeviceDiagnosticReport({
      platformLabel: 'android',
      snapshot: makeSnapshot(),
      preferences: {
        ...DEFAULT_BREATHALYZER_DEVICE_PREFERENCES,
        preferredDeviceAddress: 'AA:BB:CC:DD:EE:FF',
        preferredDeviceName: 'HC-06'
      },
      history: summarizeDeviceHistory([makeRecord()]),
      pairedDevice: {
        address: 'AA:BB:CC:DD:EE:FF',
        name: 'HC-06',
        type: 'CLASSIC',
        bonded: true
      },
      runtimeBacLimits: [{ label: 'General', limitG100ml: 0.05 }]
    });

    expect(report).toContain('Device serial: MQ3-0042');
    expect(report).toContain('Preferred address: AA:BB:CC:DD:EE:FF');
    expect(report).toContain('Bluetooth Classic (SPP)');
    expect(report).toContain('General: 0.050 g/100ml');
    expect(report).toContain('does not accept remote configuration commands');
  });

  it('converts a raw ADC preview through the active calibration profile', () => {
    const preview = calibrationPreview(512, DEFAULT_BREATHALYZER_CALIBRATION);
    expect(preview.rsOhms).not.toBeNull();
    expect(preview.mgPerL).not.toBeNull();
    expect(preview.bacGdl).not.toBeNull();
    expect(targetRawForBac(0.05, DEFAULT_BREATHALYZER_CALIBRATION)).toBeGreaterThanOrEqual(0);
    expect(targetRawForBac(0.05, DEFAULT_BREATHALYZER_CALIBRATION)).toBeLessThanOrEqual(1023);
  });
});

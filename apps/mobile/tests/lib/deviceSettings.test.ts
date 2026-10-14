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
  buildSetupSteps,
  blowStateGuidance,
  calibrationBlockReason,
  calibrationPreview,
  createManualCalibration,
  isBaselineSet,
  sensorFaultMessage,
  statusFromSnapshot,
  summarizeDeviceHistory,
  targetRawForBac,
  toCalibrationDraft,
  validateCalibrationDraft,
  warmupSecondsRemaining,
  type SetupStep
} from '../../src/lib/deviceSettings';

/**
 * Firmware telemetry fields the upgraded HC-06 stream adds. Declared locally so
 * these tests compile against the legacy snapshot shape too.
 */
type TelemetryOverrides = Partial<{
  fault: string | null;
  sampleStable: boolean | null;
  peakReceivedAt: string | null;
  blowState: string | null;
  vccMv: number | null;
  spread: number | null;
  seq: number | null;
  droppedFrames: number | null;
  deviceAddress: string | null;
  uptimeMs: number | null;
}>;

function makeSnapshot(
  overrides: Partial<BreathalyzerSnapshot> & TelemetryOverrides = {},
): BreathalyzerSnapshot {
  return {
    connection: 'connected',
    error: null,
    transportKind: 'bluetooth_classic',
    transportLabel: 'HC-06 Classic • HC-06',
    connectedAt: new Date().toISOString(),
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
    deviceAddress: 'AA:BB:CC:DD:EE:FF',
    peakReceivedAt: new Date().toISOString(),
    readings: 12,
    lastReceivedAt: new Date().toISOString(),
    sampleStable: true,
    blowState: 'idle',
    vccMv: 4987,
    spread: 8,
    fault: null,
    seq: 4211,
    droppedFrames: 0,
    captured: null,
    calibration: DEFAULT_BREATHALYZER_CALIBRATION,
    ...overrides
  } as BreathalyzerSnapshot;
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

  it('writes capture readiness copy in plain English', () => {
    const ready = buildCaptureReadiness(makeSnapshot());
    expect(ready.map((check) => [check.key, check.label])).toEqual([
      ['connection', 'Breathalyser connected'],
      ['stream', 'Live data'],
      ['warmup', 'Sensor warmed up'],
      ['sensor', 'Sensor healthy'],
      ['sample', 'Breath sample received'],
      ['peak', 'Subject peak recorded']
    ]);
    expect(ready[0].detail).toBe('HC-06 Classic • HC-06');
    expect(ready[1].detail).toBe('Receiving readings.');
    expect(ready[2].detail).toBe('Warm-up finished.');
    expect(ready[3].detail).toBe('No sensor fault and the signal is steady.');
    expect(ready[4].detail).toBe('12 sample(s) received.');
    expect(ready[5].detail).toBe('Peak reading 620.');

    const idle = buildCaptureReadiness(
      makeSnapshot({
        connection: 'idle',
        readings: 0,
        lastReceivedAt: null,
        sessionPeak: null
      }),
    );
    expect(idle[0].detail).toBe('Connect a breathalyser first.');
    expect(idle[1].detail).toBe('No recent readings yet. Waiting for the next one.');
    expect(idle[2].detail).toBe('Wait for warm-up to finish.');
    expect(idle[3].detail).toBe('Checked once the breathalyser is connected.');
    expect(idle[4].detail).toBe('Ask the subject to blow steadily to create a sample.');
    expect(idle[5].detail).toBe('The first reading after warm-up sets the subject peak.');

    const warming = buildCaptureReadiness(
      makeSnapshot({ warm: true, uptimeMs: 30_000 }),
    );
    expect(warming[2].detail).toBe('About 30 s left.');
  });

  it('separates a silent socket from a warming sensor', () => {
    // A connected socket with no samples is not the same state as a sensor that
    // is still completing its warm-up.
    const silent = statusFromSnapshot(makeSnapshot({ readings: 0, warm: true }));
    expect(silent.label).toBe('Waiting for data');
    expect(silent.tone).toBe('warning');
    expect(silent.detail).toBe(
      'Connected, but no readings have arrived yet. Check the breathalyser is switched on and in range.'
    );

    const warming = statusFromSnapshot(makeSnapshot({ readings: 9, warm: true }));
    expect(warming.label).toBe('Warming up');
    expect(warming.tone).toBe('warning');
    expect(warming.detail).toBe('Sensor warming up. Readings are not reliable until it finishes.');

    const counting = statusFromSnapshot(
      makeSnapshot({ readings: 9, warm: true, uptimeMs: 42_500 }),
    );
    expect(counting.detail).toBe(
      'Sensor warming up, about 18 s left. Readings are not reliable until it finishes.'
    );

    const settling = statusFromSnapshot(makeSnapshot({ readings: 9, sampleStable: false }));
    expect(settling.label).toBe('Settling');
    expect(settling.tone).toBe('warning');
    expect(settling.detail).toBe(
      'The signal is still settling. Keep the sensor still and in clean air.'
    );

    const live = statusFromSnapshot(makeSnapshot({ readings: 9, warm: false }));
    expect(live.label).toBe('Ready');
    expect(live.tone).toBe('success');
    expect(live.detail).toBe(
      'Connected to HC-06 Classic • HC-06. Warm-up finished and the signal is steady.'
    );

    const fallback = statusFromSnapshot(makeSnapshot({ readings: 9, transportLabel: null }));
    expect(fallback.detail).toBe(
      'Connected to the breathalyser. Warm-up finished and the signal is steady.'
    );
  });

  it('describes every connection state in plain language', () => {
    const connecting = statusFromSnapshot(makeSnapshot({ connection: 'connecting' }));
    expect(connecting).toEqual({
      label: 'Connecting',
      tone: 'warning',
      detail: 'Opening the Bluetooth connection to the breathalyser…'
    });

    const errored = statusFromSnapshot(
      makeSnapshot({ connection: 'error', error: 'Socket unavailable' }),
    );
    expect(errored).toEqual({
      label: 'Connection problem',
      tone: 'danger',
      detail: 'Socket unavailable'
    });

    expect(statusFromSnapshot(makeSnapshot({ connection: 'error', error: null })).detail).toBe(
      'Reconnect the breathalyser and try again.'
    );

    expect(statusFromSnapshot(makeSnapshot({ connection: 'idle', readings: 0 }))).toEqual({
      label: 'Not connected',
      tone: 'neutral',
      detail: 'Connect a breathalyser to start live readings.'
    });
  });

  it('reports a firmware sensor fault instead of a live reading', () => {
    const faulted = statusFromSnapshot(makeSnapshot({ fault: 'short' }));
    expect(faulted.label).toBe('Sensor fault');
    expect(faulted.tone).toBe('danger');
    expect(faulted.detail).toBe('The sensor reads zero. Check the sensor wiring to A0 and GND.');

    // `ok` is the healthy code and must never surface as a fault.
    expect(statusFromSnapshot(makeSnapshot({ fault: 'ok' })).label).toBe('Ready');
  });

  it('fails the sensor readiness check on a hardware fault or unsettled signal', () => {
    const faulted = buildCaptureReadiness(makeSnapshot({ fault: 'stuck' }));
    const sensor = faulted.find((check) => check.key === 'sensor');
    expect(sensor?.ok).toBe(false);
    expect(sensor?.tone).toBe('error');
    expect(sensor?.detail).toBe(
      'The sensor value is not changing. Check the sensor and its wiring.'
    );

    const settling = buildCaptureReadiness(makeSnapshot({ sampleStable: false }));
    const settlingSensor = settling.find((check) => check.key === 'sensor');
    expect(settlingSensor?.ok).toBe(false);
    expect(settlingSensor?.tone).toBe('warning');
    expect(settlingSensor?.detail).toBe(
      'The signal is still settling. Keep the sensor still in clean air.'
    );

    const healthy = buildCaptureReadiness(
      makeSnapshot({ fault: 'ok', sampleStable: true }),
    );
    expect(healthy.find((check) => check.key === 'sensor')?.ok).toBe(true);

    const disconnected = buildCaptureReadiness(
      makeSnapshot({ connection: 'idle', readings: 0, fault: 'stuck' }),
    );
    expect(disconnected.find((check) => check.key === 'sensor')?.ok).toBe(false);
  });

  it('produces a diagnostic report that preserves custody values and firmware limits', () => {
    const report = buildDeviceDiagnosticReport({
      platformLabel: 'android',
      snapshot: makeSnapshot({
        fault: 'rail',
        vccMv: 4987,
        spread: 12,
        seq: 4211,
        droppedFrames: 2,
        deviceAddress: 'AA:BB:CC:DD:EE:FF'
      }),
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
    expect(report).toContain('Sensor fault: rail');
    expect(report).toContain('Rail voltage: 4.987 V (4987 mV)');
    expect(report).toContain('Signal spread: 12 ADC counts');
    expect(report).toContain('Frame sequence: 4211');
    expect(report).toContain('Dropped frames: 2');
    expect(report).toContain('Device address: AA:BB:CC:DD:EE:FF');
    // The failed sensor check must be visible in the readiness section.
    expect(report).toContain('WAIT — Sensor healthy');
    expect(report).toContain(
      'The sensor reads at its maximum. Check the sensor wiring and supply.'
    );
    // The report must not claim a certified measurement.
    expect(report).toContain('Screening estimate');
    expect(report).not.toContain('evidential reading');
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

function stepsByKey(steps: SetupStep[]): Record<string, SetupStep> {
  return Object.fromEntries(steps.map((step) => [step.key, step]));
}

describe('warmupSecondsRemaining', () => {
  it('returns null when the sensor is not warming up', () => {
    expect(warmupSecondsRemaining(makeSnapshot({ warm: false, uptimeMs: 1_000 }))).toBeNull();
    expect(warmupSecondsRemaining(makeSnapshot({ warm: true, uptimeMs: 60_000 }))).toBeNull();
    expect(warmupSecondsRemaining(makeSnapshot({ warm: true, uptimeMs: 90_000 }))).toBeNull();
  });

  it('returns null when the firmware never reported an uptime', () => {
    expect(warmupSecondsRemaining(makeSnapshot({ warm: true, uptimeMs: null }))).toBeNull();
    expect(warmupSecondsRemaining(makeSnapshot({ warm: true }))).toBeNull();
    expect(
      warmupSecondsRemaining(makeSnapshot({ warm: true, uptimeMs: Number.NaN })),
    ).toBeNull();
  });

  it('rounds the remaining warm-up up to whole seconds', () => {
    expect(warmupSecondsRemaining(makeSnapshot({ warm: true, uptimeMs: 0 }))).toBe(60);
    expect(warmupSecondsRemaining(makeSnapshot({ warm: true, uptimeMs: 42_500 }))).toBe(18);
    expect(warmupSecondsRemaining(makeSnapshot({ warm: true, uptimeMs: 59_100 }))).toBe(1);
  });

  it('returns null once the warm-up budget is spent', () => {
    expect(warmupSecondsRemaining(makeSnapshot({ warm: true, uptimeMs: 60_000 }))).toBeNull();
  });
});

describe('sensorFaultMessage', () => {
  it('explains every firmware fault code in plain language', () => {
    expect(sensorFaultMessage('short')).toBe(
      'The sensor reads zero. Check the sensor wiring to A0 and GND.'
    );
    expect(sensorFaultMessage('rail')).toBe(
      'The sensor reads at its maximum. Check the sensor wiring and supply.'
    );
    expect(sensorFaultMessage('vcc')).toBe(
      'The supply voltage is outside the safe range. Check the 5 V power supply.'
    );
    expect(sensorFaultMessage('stuck')).toBe(
      'The sensor value is not changing. Check the sensor and its wiring.'
    );
  });

  it('reports no fault for the healthy code and for absent telemetry', () => {
    expect(sensorFaultMessage('ok')).toBe('No sensor fault.');
    expect(sensorFaultMessage(null)).toBe('No sensor fault.');
    expect(sensorFaultMessage(undefined)).toBe('No sensor fault.');
  });
});

describe('isBaselineSet', () => {
  it('detects a clean-air baseline in the calibration version', () => {
    expect(
      isBaselineSet({ ...DEFAULT_BREATHALYZER_CALIBRATION, version: 'mq3-default-v1+clean-air' }),
    ).toBe(true);
    expect(isBaselineSet(DEFAULT_BREATHALYZER_CALIBRATION)).toBe(false);
    expect(
      isBaselineSet({ ...DEFAULT_BREATHALYZER_CALIBRATION, version: 'mq3-custom+manual-20260924' }),
    ).toBe(false);
  });
});

describe('buildSetupSteps', () => {
  it('returns the four steps in order with their tabs', () => {
    const steps = buildSetupSteps(makeSnapshot());
    expect(steps.map((step) => step.key)).toEqual(['connect', 'warmup', 'sensor', 'baseline']);
    expect(steps.map((step) => step.label)).toEqual(['Connect', 'Warm up', 'Sensor', 'Baseline']);
    expect(steps.map((step) => step.tab)).toEqual(['connect', 'live', 'live', 'calibrate']);
  });

  it('marks a healthy connected stream as done', () => {
    const steps = stepsByKey(buildSetupSteps(makeSnapshot()));
    expect(steps.connect.state).toBe('done');
    expect(steps.connect.detail).toBe('Receiving readings from HC-06 Classic • HC-06');
    expect(steps.warmup.state).toBe('done');
    expect(steps.warmup.detail).toBe('Warm-up finished.');
    expect(steps.sensor.state).toBe('done');
    expect(steps.sensor.detail).toBe('Sensor healthy and signal steady.');
    expect(steps.baseline.state).toBe('optional');
  });

  it('asks the officer to connect while idle', () => {
    const steps = stepsByKey(buildSetupSteps(makeSnapshot({ connection: 'idle', readings: 0 })));
    expect(steps.connect.state).toBe('current');
    expect(steps.connect.detail).toBe('Not connected. Tap to connect.');
    expect(steps.warmup.state).toBe('waiting');
    expect(steps.warmup.detail).toBe('Starts once the breathalyser is connected.');
    expect(steps.sensor.state).toBe('waiting');
    expect(steps.sensor.detail).toBe('Checked once readings arrive.');
  });

  it('marks the connect step current while the socket is opening', () => {
    const steps = stepsByKey(
      buildSetupSteps(makeSnapshot({ connection: 'connecting', readings: 0 })),
    );
    expect(steps.connect.state).toBe('current');
    expect(steps.connect.detail).toBe('Connecting…');
  });

  it('waits for the first reading on a silent socket', () => {
    const steps = stepsByKey(buildSetupSteps(makeSnapshot({ readings: 0 })));
    expect(steps.connect.state).toBe('current');
    expect(steps.connect.detail).toBe('Connected. Waiting for the first reading.');
    expect(steps.warmup.state).toBe('waiting');
    expect(steps.sensor.state).toBe('waiting');
  });

  it('raises the connect step for attention on a connection error', () => {
    const withMessage = stepsByKey(
      buildSetupSteps(makeSnapshot({ connection: 'error', error: 'Socket unavailable' })),
    );
    expect(withMessage.connect.state).toBe('attention');
    expect(withMessage.connect.detail).toBe('Socket unavailable');

    const withoutMessage = stepsByKey(
      buildSetupSteps(makeSnapshot({ connection: 'error', error: null })),
    );
    expect(withoutMessage.connect.state).toBe('attention');
    expect(withoutMessage.connect.detail).toBe('Connection problem. Tap to reconnect.');
  });

  it('shows the warm-up countdown once readings are flowing', () => {
    const known = stepsByKey(
      buildSetupSteps(makeSnapshot({ warm: true, uptimeMs: 20_000 })),
    );
    expect(known.warmup.state).toBe('current');
    expect(known.warmup.detail).toBe('Warming up, 40 s left.');
    expect(known.sensor.state).toBe('waiting');
    expect(known.sensor.detail).toBe('Checked after warm-up.');

    const unknown = stepsByKey(
      buildSetupSteps(makeSnapshot({ warm: true, uptimeMs: null })),
    );
    expect(unknown.warmup.state).toBe('current');
    expect(unknown.warmup.detail).toBe('Warming up.');
  });

  it('raises the sensor step for a hardware fault', () => {
    const steps = stepsByKey(buildSetupSteps(makeSnapshot({ fault: 'rail', warm: false })));
    expect(steps.sensor.state).toBe('attention');
    expect(steps.sensor.detail).toBe(
      'The sensor reads at its maximum. Check the sensor wiring and supply.'
    );
  });

  it('marks the sensor step current while the signal settles', () => {
    const steps = stepsByKey(buildSetupSteps(makeSnapshot({ sampleStable: false })));
    expect(steps.sensor.state).toBe('current');
    expect(steps.sensor.detail).toBe('Signal settling. Keep the sensor still in clean air.');
  });

  it('marks the baseline step done once a clean-air baseline exists', () => {
    const steps = stepsByKey(
      buildSetupSteps(
        makeSnapshot({
          calibration: {
            ...DEFAULT_BREATHALYZER_CALIBRATION,
            version: 'mq3-default-v1+clean-air'
          }
        }),
      ),
    );
    expect(steps.baseline.state).toBe('done');
    expect(steps.baseline.detail).toBe('Clean-air baseline set on this phone.');

    const unset = stepsByKey(buildSetupSteps(makeSnapshot()));
    expect(unset.baseline.state).toBe('optional');
    expect(unset.baseline.detail).toBe(
      'Recommended. Using factory defaults until you set a clean-air baseline.'
    );
  });
});

describe('calibrationBlockReason', () => {
  it('blocks calibration while a roadside test is active', () => {
    expect(calibrationBlockReason(makeSnapshot(), { locked: true })).toBe(
      'Locked while a roadside test is active.'
    );
    // The lock wins over every other reason.
    expect(
      calibrationBlockReason(makeSnapshot({ connection: 'idle', readings: 0 }), { locked: true }),
    ).toBe('Locked while a roadside test is active.');
  });

  it('blocks calibration while the breathalyser is not connected', () => {
    expect(
      calibrationBlockReason(makeSnapshot({ connection: 'idle', readings: 0 }), { locked: false }),
    ).toBe('Connect the breathalyser first.');
    expect(
      calibrationBlockReason(makeSnapshot({ connection: 'connecting', readings: 0 }), {
        locked: false,
      }),
    ).toBe('Connect the breathalyser first.');
  });

  it('blocks calibration until the first reading arrives', () => {
    expect(calibrationBlockReason(makeSnapshot({ readings: 0 }), { locked: false })).toBe(
      'Waiting for the first reading.'
    );
  });

  it('blocks calibration while the sensor warms up', () => {
    expect(
      calibrationBlockReason(
        makeSnapshot({ warm: true, uptimeMs: 45_000, fault: 'short' }),
        { locked: false },
      ),
    ).toBe('Warming up. Wait for the sensor to finish. About 15 s left.');

    expect(
      calibrationBlockReason(makeSnapshot({ warm: true, uptimeMs: null }), { locked: false }),
    ).toBe('Warming up. Wait for the sensor to finish.');
  });

  it('blocks calibration while the firmware reports a fault', () => {
    expect(
      calibrationBlockReason(makeSnapshot({ fault: 'vcc', sampleStable: false }), { locked: false }),
    ).toBe('Fix the sensor fault before setting a baseline.');
  });

  it('blocks calibration while the signal is still settling', () => {
    expect(
      calibrationBlockReason(makeSnapshot({ sampleStable: false, over: true }), { locked: false }),
    ).toBe('The signal is still settling. Keep the sensor still in clean air.');
  });

  it('blocks calibration while alcohol vapour is over the reading', () => {
    expect(calibrationBlockReason(makeSnapshot({ over: true }), { locked: false })).toBe(
      'Move the sensor away from alcohol vapour and wait for the reading to fall.'
    );
    expect(calibrationBlockReason(makeSnapshot({ alarm: true }), { locked: false })).toBe(
      'Move the sensor away from alcohol vapour and wait for the reading to fall.'
    );
  });

  it('allows calibration when every guard is satisfied', () => {
    expect(calibrationBlockReason(makeSnapshot(), { locked: false })).toBeNull();
  });
});

describe('blowStateGuidance', () => {
  it('explains every firmware blow state', () => {
    expect(blowStateGuidance(makeSnapshot({ blowState: 'warming' }))).toEqual({
      title: 'Warming up',
      detail: 'Wait for the sensor to finish warming up.',
      tone: 'warning'
    });
    expect(blowStateGuidance(makeSnapshot({ blowState: 'idle' }))).toEqual({
      title: 'Ready for a breath sample',
      detail: 'Ask the subject to blow steadily into the mouthpiece.',
      tone: 'success'
    });
    expect(blowStateGuidance(makeSnapshot({ blowState: 'blowing' }))).toEqual({
      title: 'Breath detected',
      detail: 'Keep the breath going until the reading levels off.',
      tone: 'success'
    });
    expect(blowStateGuidance(makeSnapshot({ blowState: 'peak_ready' }))).toEqual({
      title: 'Peak reached',
      detail: 'Capture when the reading holds steady.',
      tone: 'success'
    });
    expect(blowStateGuidance(makeSnapshot({ blowState: 'fault', fault: 'short' }))).toEqual({
      title: 'Sensor fault',
      detail: 'The sensor reads zero. Check the sensor wiring to A0 and GND.',
      tone: 'danger'
    });
  });

  it('asks the officer to connect before reading the blow state', () => {
    expect(blowStateGuidance(makeSnapshot({ connection: 'idle', blowState: 'blowing' }))).toEqual({
      title: 'No breathalyser connected',
      detail: 'Connect a breathalyser to start live readings.',
      tone: 'neutral'
    });
    expect(
      blowStateGuidance(makeSnapshot({ connection: 'connecting', blowState: 'idle' })),
    ).toEqual({
      title: 'No breathalyser connected',
      detail: 'Connect a breathalyser to start live readings.',
      tone: 'neutral'
    });
  });
});

import {
  BreathalyzerSession,
  DEFAULT_BREATHALYZER_CALIBRATION,
  adcToVolts,
  bacGdlToRaw,
  calibrationFromCleanAir,
  cleanAirRaw,
  formatBacGdl,
  isBreathalyzerReadingFresh,
  parseBreathalyzerLine,
  rawToBacGdl,
  rawToRs,
  toDeviceEvidence,
  voltsToRs,
  type CapturedBreathalyzerReading
} from '../../src/services/breathalyzer';
import { createSimulatedTransport } from '../../src/services/breathalyzerSimulator';

async function waitFor(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const startedAt = Date.now();
  while (!condition()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('breathalyzer protocol parsing', () => {
  it('parses a firmware reading line', () => {
    const line =
      '{"raw":512,"avg":498,"peak":640,"vout":2.503,"rs":998,"over":true,"alarm":true,"warm":false}\n';

    expect(parseBreathalyzerLine(line)).toMatchObject({
      raw: 512,
      avg: 498,
      peak: 640,
      vout: 2.503,
      over: true,
      alarm: true,
      warm: false
    });
  });

  it('extracts the JSON payload when serial boot text is present', () => {
    const line =
      'MQ-3 Alcohol Sensor\nSensor warming up...\n{"raw":120,"avg":118,"peak":120,"over":false,"alarm":false,"warm":true}';

    expect(parseBreathalyzerLine(line)).toMatchObject({ raw: 120, warm: true });
  });

  it('rejects malformed or unrelated lines', () => {
    expect(parseBreathalyzerLine('MQ-3 Reading: 1023')).toBeNull();
    expect(parseBreathalyzerLine('{not json}')).toBeNull();
    expect(parseBreathalyzerLine('{"avg":100}')).toBeNull();
  });

  it('captures the device serial when the payload reports one', () => {
    expect(
      parseBreathalyzerLine('{"raw":120,"avg":118,"peak":120,"sn":"MQ3-0042","warm":false}')
    ).toMatchObject({ serial: 'MQ3-0042' });
    expect(parseBreathalyzerLine('{"raw":120,"avg":118,"peak":120}')).toMatchObject({
      serial: null
    });
  });
});

describe('breathalyzer calibration math', () => {
  it('converts ADC counts to volts', () => {
    expect(adcToVolts(0)).toBe(0);
    expect(adcToVolts(1023)).toBe(5);
    expect(adcToVolts(512)).toBeCloseTo(2.502, 2);
  });

  it('guards against railed or floating voltages', () => {
    expect(voltsToRs(0, 1000)).toBeNull();
    expect(voltsToRs(5, 1000)).toBeNull();
    expect(voltsToRs(2.5, 1000)).toBeCloseTo(1000, 5);
  });

  it('computes clean-air sensor resistance from a baseline reading', () => {
    const next = calibrationFromCleanAir(120, DEFAULT_BREATHALYZER_CALIBRATION);
    expect(next).not.toBeNull();
    expect(Math.abs((next as { cleanAirResistanceOhms: number }).cleanAirResistanceOhms - 7532)).toBeLessThan(20);
  });

  it('derives the raw value that corresponds to a BAC target', () => {
    const target = 0.05;
    const raw = bacGdlToRaw(target, DEFAULT_BREATHALYZER_CALIBRATION);
    const roundTrip = rawToBacGdl(raw, DEFAULT_BREATHALYZER_CALIBRATION);

    expect(roundTrip).not.toBeNull();
    expect(Math.abs((roundTrip as number) - target)).toBeLessThan(0.002);
  });

  it('reports near-zero BAC in clean air and rises with sensor output', () => {
    const baseline = rawToBacGdl(cleanAirRaw(DEFAULT_BREATHALYZER_CALIBRATION), DEFAULT_BREATHALYZER_CALIBRATION);
    const elevated = rawToBacGdl(400, DEFAULT_BREATHALYZER_CALIBRATION);
    const heavy = rawToBacGdl(800, DEFAULT_BREATHALYZER_CALIBRATION);

    expect(baseline).not.toBeNull();
    expect(baseline as number).toBeGreaterThanOrEqual(0);
    expect(baseline as number).toBeLessThan(0.01);
    expect(elevated as number).toBeGreaterThan(baseline as number);
    expect(heavy as number).toBeGreaterThan(elevated as number);
    expect(heavy as number).toBeGreaterThan(0.05);
  });

  it('derives sensor resistance from raw counts', () => {
    expect(rawToRs(0, DEFAULT_BREATHALYZER_CALIBRATION)).toBeNull();
    expect(rawToRs(1023, DEFAULT_BREATHALYZER_CALIBRATION)).toBeNull();
    expect(rawToRs(120, DEFAULT_BREATHALYZER_CALIBRATION)).toBeCloseTo(7525, -1);
  });

  it('formats BAC values for display', () => {
    expect(formatBacGdl(null)).toBe('--');
    expect(formatBacGdl(0.0621)).toBe('0.062');
  });
});

describe('breathalyzer session', () => {
  function fastSimulator() {
    return createSimulatedTransport({
      calibration: DEFAULT_BREATHALYZER_CALIBRATION,
      targetBacGdl: 0.08,
      sampleIntervalMs: 5,
      warmupMs: 0,
      cycleMs: 800
    });
  }

  it('streams simulated readings and captures the session peak', async () => {
    const session = new BreathalyzerSession();

    await session.connect(fastSimulator());
    expect(session.getSnapshot().connection).toBe('connected');

    await waitFor(() => session.getSnapshot().readings > 5);
    expect(session.getSnapshot().avg).not.toBeNull();

    await waitFor(() => (session.getSnapshot().peakBacGdl ?? 0) > 0.04);

    const captured = session.capture();
    expect(captured).not.toBeNull();
    expect((captured as { bacGdl: number }).bacGdl).toBeGreaterThan(0.04);
    expect(session.getSnapshot().captured).toEqual(captured);

    await session.disconnect();
    expect(session.getSnapshot().connection).toBe('idle');
    expect(session.getSnapshot().raw).toBeNull();
  });

  it('resets peak state between subjects without dropping the connection', async () => {
    const session = new BreathalyzerSession();

    await session.connect(fastSimulator());
    await waitFor(() => (session.getSnapshot().peakBacGdl ?? 0) > 0.04);
    session.capture();
    expect(session.getSnapshot().captured).not.toBeNull();

    session.startNewSubject();
    expect(session.getSnapshot().captured).toBeNull();
    expect(session.getSnapshot().peakBacGdl).toBeNull();
    expect(session.getSnapshot().connection).toBe('connected');

    await session.disconnect();
  });

  it('does not include warm-up readings in the subject peak', async () => {
    const session = new BreathalyzerSession();
    const transport = {
      kind: 'bluetooth_classic' as const,
      label: 'HC-06 Classic',
      async connect() {},
      async disconnect() {},
      onLine(listener: (line: string) => void) {
        listener('{"raw":900,"avg":850,"peak":850,"warm":true}');
        listener('{"raw":300,"avg":280,"peak":280,"warm":false}');
        return () => {};
      }
    };

    await session.connect(transport);

    expect(session.getSnapshot().sessionPeak).toBe(280);
    expect(session.getSnapshot().peakBacGdl).not.toBeNull();
  });

  it('rejects captures when the latest device reading is stale', async () => {
    const session = new BreathalyzerSession();
    const transport = {
      kind: 'bluetooth_classic' as const,
      label: 'HC-06 Classic',
      async connect() {},
      async disconnect() {},
      onLine(listener: (line: string) => void) {
        listener('{"raw":300,"avg":280,"peak":280,"warm":false}');
        return () => {};
      }
    };

    await session.connect(transport);
    const receivedAt = session.getSnapshot().lastReceivedAt;
    expect(isBreathalyzerReadingFresh(receivedAt)).toBe(true);
    expect(session.capture(Date.parse((receivedAt as string) ?? '') + 3_001)).toBeNull();
  });

  it('disconnects the previous transport before replacing it', async () => {
    const session = new BreathalyzerSession();
    const firstDisconnect = jest.fn().mockResolvedValue(undefined);
    const firstTransport = {
      kind: 'bluetooth_classic' as const,
      label: 'First HC-06',
      async connect() {},
      disconnect: firstDisconnect,
      onLine() {
        return () => {};
      }
    };
    const secondTransport = {
      kind: 'bluetooth_classic' as const,
      label: 'Second HC-06',
      async connect() {},
      async disconnect() {},
      onLine() {
        return () => {};
      }
    };

    await session.connect(firstTransport);
    await session.connect(secondTransport);

    expect(firstDisconnect).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().transportLabel).toBe('Second HC-06');
  });

  it('clears measurements from the previous device when replacing it', async () => {
    const session = new BreathalyzerSession();
    const firstTransport = {
      kind: 'bluetooth_classic' as const,
      label: 'First HC-06',
      async connect() {},
      async disconnect() {},
      onLine(listener: (line: string) => void) {
        listener(
          '{"raw":700,"avg":650,"peak":700,"sn":"FIRST-01","over":false,"alarm":false,"warm":false}'
        );
        return () => {};
      }
    };
    const secondTransport = {
      kind: 'bluetooth_classic' as const,
      label: 'Second HC-06',
      async connect() {},
      async disconnect() {},
      onLine() {
        return () => {};
      }
    };

    await session.connect(firstTransport);
    expect(session.getSnapshot().sessionPeak).toBe(650);
    expect(session.getSnapshot().deviceSerial).toBe('FIRST-01');

    await session.connect(secondTransport);

    expect(session.getSnapshot()).toMatchObject({
      connection: 'connected',
      transportLabel: 'Second HC-06',
      warm: true,
      raw: null,
      avg: null,
      devicePeak: null,
      sessionPeak: null,
      liveBacGdl: null,
      peakBacGdl: null,
      deviceSerial: null,
      captured: null,
      readings: 0,
      lastReceivedAt: null
    });
  });

  it('does not mark a connection successful after an immediate transport error', async () => {
    const session = new BreathalyzerSession();
    const handlers: { error?: (message: string) => void } = {};
    const transport = {
      kind: 'bluetooth_classic' as const,
      label: 'Unstable HC-06',
      async connect() {
        handlers.error?.('HC-06 disconnected immediately.');
      },
      async disconnect() {},
      onLine() {
        return () => {};
      },
      onError(listener: (message: string) => void) {
        handlers.error = listener;
        return () => {
          handlers.error = undefined;
        };
      }
    };

    await session.connect(transport);

    expect(session.getSnapshot().connection).toBe('error');
    expect(session.getSnapshot().error).toBe('HC-06 disconnected immediately.');
  });

  it('expires a connected session when telemetry becomes stale', async () => {
    const session = new BreathalyzerSession();
    const disconnect = jest.fn().mockResolvedValue(undefined);
    const transport = {
      kind: 'bluetooth_classic' as const,
      label: 'HC-06',
      async connect() {},
      disconnect,
      onLine(listener: (line: string) => void) {
        listener('{"raw":300,"avg":280,"peak":280,"warm":false}');
        return () => {};
      }
    };

    await session.connect(transport);
    const receivedAt = session.getSnapshot().lastReceivedAt as string;
    session.expireIfStale(Date.parse(receivedAt) + 3_001);

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().connection).toBe('error');
    expect(session.getSnapshot().sessionPeak).toBeNull();
  });

  it('surfaces asynchronous transport disconnects as connection errors', async () => {
    const session = new BreathalyzerSession();
    const handlers: { error?: (message: string) => void } = {};
    const transport = {
      kind: 'bluetooth_classic' as const,
      label: 'HC-06 Classic',
      async connect() {},
      async disconnect() {},
      onLine() {
        return () => {};
      },
      onError(listener: (message: string) => void) {
        handlers.error = listener;
        return () => {
          handlers.error = undefined;
        };
      }
    };

    await session.connect(transport);
    handlers.error?.('HC-06 disconnected.');

    expect(session.getSnapshot().connection).toBe('error');
    expect(session.getSnapshot().error).toBe('HC-06 disconnected.');
  });

  it('ignores malformed lines without breaking the stream', async () => {
    const session = new BreathalyzerSession();
    const transport = {
      kind: 'simulated' as const,
      label: 'Test transport',
      async connect() {},
      async disconnect() {},
      onLine(listener: (line: string) => void) {
        listener('MQ-3 Reading: 1023');
        listener('{"raw":300,"avg":290,"peak":300,"over":false,"alarm":false,"warm":false}');
        return () => {};
      }
    };

    await session.connect(transport);

    expect(session.getSnapshot().readings).toBe(1);
    expect(session.getSnapshot().raw).toBe(300);
    expect(session.getSnapshot().sessionPeak).toBe(290);
  });

  it('can recalibrate the baseline from a connected sensor', async () => {
    const session = new BreathalyzerSession();
    const transport = {
      kind: 'simulated' as const,
      label: 'Test transport',
      async connect() {},
      async disconnect() {},
      onLine(listener: (line: string) => void) {
        listener('{"raw":140,"avg":138,"peak":140,"over":false,"alarm":false,"warm":false}');
        return () => {};
      }
    };

    await session.connect(transport);
    const baselineBefore = session.getSnapshot().calibration.cleanAirResistanceOhms;
    const next = session.calibrateFromCleanAir();

    expect(next).not.toBeNull();
    expect(next?.cleanAirResistanceOhms).not.toBe(baselineBefore);
    expect(session.getSnapshot().calibration).toEqual(next);
  });

  it('does not calibrate while the alarm threshold is exceeded', async () => {
    const session = new BreathalyzerSession();
    const transport = {
      kind: 'simulated' as const,
      label: 'Test transport',
      async connect() {},
      async disconnect() {},
      onLine(listener: (line: string) => void) {
        listener('{"raw":700,"avg":690,"peak":700,"over":true,"alarm":true,"warm":false}');
        return () => {};
      }
    };

    await session.connect(transport);
    expect(session.calibrateFromCleanAir()).toBeNull();
  });
});

describe('breathalyzer device evidence', () => {
  it('builds custody evidence from a captured device reading', async () => {
    const session = new BreathalyzerSession();
    const transport = {
      kind: 'simulated' as const,
      label: 'Test transport',
      async connect() {},
      async disconnect() {},
      onLine(listener: (line: string) => void) {
        listener(
          '{"raw":500,"avg":480,"peak":512,"sn":"MQ3-0001","over":true,"alarm":true,"warm":false}'
        );
        return () => {};
      }
    };

    await session.connect(transport);
    const captured = session.capture();
    expect(captured).not.toBeNull();

    const evidence = toDeviceEvidence(captured as CapturedBreathalyzerReading);
    expect(evidence).toMatchObject({
      transport: 'simulated',
      serial: 'MQ3-0001',
      calibrationVersion: DEFAULT_BREATHALYZER_CALIBRATION.version,
      calibrationCleanAirResistanceOhms:
        DEFAULT_BREATHALYZER_CALIBRATION.cleanAirResistanceOhms,
      sessionPeakRaw: 480,
      avgRaw: 480,
      raw: 500
    });
    expect(evidence?.capturedAt).toBe(captured?.capturedAt);
  });

  it('omits evidence when transport or live raw values are missing', () => {
    const base: CapturedBreathalyzerReading = {
      bacGdl: 0.05,
      sessionPeakRaw: 500,
      rawAtCapture: 480,
      avgAtCapture: 470,
      liveBacGdlAtCapture: 0.04,
      capturedAt: '2026-09-21T10:15:00.000Z',
      transport: 'ble',
      deviceSerial: null,
      calibration: DEFAULT_BREATHALYZER_CALIBRATION
    };

    expect(toDeviceEvidence(base)).not.toBeNull();
    expect(toDeviceEvidence({ ...base, transport: null })).toBeNull();
    expect(toDeviceEvidence({ ...base, rawAtCapture: null })).toBeNull();
    expect(toDeviceEvidence({ ...base, avgAtCapture: null })).toBeNull();
  });
});

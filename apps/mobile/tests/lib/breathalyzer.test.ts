import {
  BreathalyzerSession,
  BREATHALYZER_WARMUP_MS,
  DEFAULT_BREATHALYZER_CALIBRATION,
  MAX_BREATHALYZER_READING_AGE_MS,
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

/**
 * A transport that lets a test push frames into the session whenever it wants,
 * instead of only while `onLine` is being registered.
 */
function deferredTransport(label = 'HC-06') {
  const listeners: Array<(line: string) => void> = [];
  const sendCommand = jest.fn().mockResolvedValue(undefined);
  return {
    kind: 'bluetooth_classic' as const,
    label,
    async connect() {},
    async disconnect() {},
    sendCommand,
    onLine(listener: (line: string) => void) {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    },
    emit(line: string) {
      for (const listener of [...listeners]) listener(line);
    }
  };
}

/**
 * Replaces `Date` with a clock the test can step forwards deterministically.
 * The parser stamps every reading with `new Date()`, so this keeps the
 * freshness-window arithmetic exact without slowing the suite down.
 */
function installClock(startIso: string): {
  advance: (ms: number) => void;
  now: () => number;
  restore: () => void;
} {
  const RealDate = Date;
  let current = new RealDate(startIso).getTime();

  class FakeDate extends RealDate {
    constructor(...args: any[]) {
      if (args.length === 0) {
        super(current);
      } else {
        super(...(args as [string | number | Date]));
      }
    }

    static now(): number {
      return current;
    }
  }

  const host = globalThis as unknown as { Date: DateConstructor };
  host.Date = FakeDate as unknown as DateConstructor;

  return {
    advance(ms: number) {
      current += ms;
    },
    now() {
      return current;
    },
    restore() {
      host.Date = RealDate;
    }
  };
}

/**
 * Builds a telemetry line exactly like `firmware/breathalyzer/breathalyzer.ino`:
 * the JSON payload followed by `,"crc":"XX"`, where `XX` is the 8-bit XOR of
 * every character after the opening `{` up to the `"crc"` separator.
 */
interface FirmwareLineOptions {
  prefix?: string;
  crc?: boolean;
  corrupt?: boolean;
}

/**
 * The sketch writes the record without the closing brace so the `,"crc"` field
 * can be appended in front of it, mirroring `snprintf(line + length, ...)`.
 */
function serializePayload(fields: Record<string, unknown>): string {
  return JSON.stringify(fields).slice(0, -1);
}

/**
 * 8-bit XOR of every character after the opening `{` up to the `,"crc"`
 * separator, exactly as the firmware computes it before appending the field.
 */
function crcOf(fields: Record<string, unknown>): string {
  const body = serializePayload(fields);
  let checksum = 0;
  for (let index = 1; index < body.length; index += 1) {
    checksum ^= body.charCodeAt(index) & 0xff;
  }
  return checksum.toString(16).toUpperCase().padStart(2, '0');
}

function firmwareLine(
  fields: Record<string, unknown>,
  options: FirmwareLineOptions = {}
): string {
  const prefix = options.prefix ?? '';
  const body = serializePayload(fields);
  if (options.crc === false) return `${prefix}${body}}`;

  const computed = crcOf(fields);
  const emitted = options.corrupt
    ? (Number.parseInt(computed, 16) ^ 0xff)
        .toString(16)
        .toUpperCase()
        .padStart(2, '0')
    : computed;
  return `${prefix}${body},"crc":"${emitted}"}`;
}

const FULL_FIRMWARE_FIELDS = {
  raw: 120,
  avg: 118,
  peak: 119,
  sn: 'MQ3-0001',
  vout: 0.587,
  rs: 7525,
  over: false,
  alarm: false,
  warm: false,
  seq: 42,
  up: 96500,
  vcc: 4990,
  spread: 2,
  r0: 7532,
  fault: 'ok',
  state: 'IDLE'
} satisfies Record<string, unknown>;


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

describe('breathalyzer extended firmware fields', () => {
  it('parses every optional field of the upgraded firmware line', () => {
    const reading = parseBreathalyzerLine(firmwareLine(FULL_FIRMWARE_FIELDS));

    expect(reading).toMatchObject({
      raw: 120,
      avg: 118,
      peak: 119,
      serial: 'MQ3-0001',
      rs: 7525,
      seq: 42,
      uptimeMs: 96500,
      vccMv: 4990,
      spread: 2,
      deviceR0Ohms: 7532,
      fault: 'ok',
      deviceState: 'IDLE',
      crcValid: true
    });
  });

  it('accepts the checksum even when boot text precedes the payload', () => {
    const line = firmwareLine(FULL_FIRMWARE_FIELDS, {
      prefix: 'MQ-3 Alcohol Sensor\nSensor warming...\n'
    });

    expect(parseBreathalyzerLine(line)).toMatchObject({ crcValid: true, raw: 120 });
  });

  it('rejects a frame whose checksum does not match', () => {
    const line = firmwareLine(FULL_FIRMWARE_FIELDS, { corrupt: true });

    expect(parseBreathalyzerLine(line)).toBeNull();
  });

  it('accepts a legacy nine-field line and reports that no checksum was present', () => {
    const legacy =
      '{"raw":512,"avg":498,"peak":640,"vout":2.503,"rs":998,"over":true,"alarm":true,"warm":false}';

    expect(parseBreathalyzerLine(legacy)).toMatchObject({
      raw: 512,
      avg: 498,
      rs: 998,
      seq: null,
      uptimeMs: null,
      vccMv: null,
      spread: null,
      deviceR0Ohms: null,
      fault: null,
      deviceState: null,
      crcValid: null
    });
  });

  it('rejects raw values outside the ADC range', () => {
    expect(parseBreathalyzerLine('{"raw":-1,"avg":10,"peak":10}')).toBeNull();
    expect(parseBreathalyzerLine('{"raw":1024,"avg":10,"peak":10}')).toBeNull();
    expect(parseBreathalyzerLine('{"raw":4000,"avg":10,"peak":10}')).toBeNull();
    expect(parseBreathalyzerLine('{"raw":1023,"avg":1023,"peak":1023}')).not.toBeNull();
  });

  it('clamps avg and peak into the ADC range', () => {
    expect(parseBreathalyzerLine('{"raw":500,"avg":5000,"peak":-40}')).toMatchObject({
      raw: 500,
      avg: 1023,
      peak: 0
    });
  });

  it('discards optional telemetry that is physically impossible', () => {
    const reading = parseBreathalyzerLine(
      '{"raw":500,"avg":480,"peak":490,"rs":-1,"seq":-3,"up":-5,"vcc":0,"spread":-2,"r0":0,"fault":"melted","state":"EXPLODING"}'
    );

    expect(reading).toMatchObject({
      rs: null,
      seq: null,
      uptimeMs: null,
      vccMv: null,
      spread: null,
      deviceR0Ohms: null,
      fault: null,
      deviceState: null
    });
  });

  it('clamps a reported spread into the ADC range', () => {
    expect(
      parseBreathalyzerLine('{"raw":500,"avg":480,"peak":490,"spread":4096}')
    ).toMatchObject({ spread: 1023 });
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

  it('clears only subject state, leaving the live stream running', async () => {
    const session = new BreathalyzerSession();
    const transport = deferredTransport();

    await session.connect(transport);
    transport.emit(
      '{"raw":900,"avg":850,"peak":850,"sn":"MQ3-0001","warm":false,"over":true,"alarm":true,"seq":12,"up":96500}'
    );

    // The latched over-alarm state is reported by the firmware frame, so it is
    // stream state: the reset must leave it (and everything else) alone until
    // the next frame arrives.
    expect(session.getSnapshot().over).toBe(true);
    expect(session.getSnapshot().alarm).toBe(true);

    const before = session.getSnapshot();
    session.startNewSubject();

    const after = session.getSnapshot();
    // Subject-level state is cleared.
    expect(after.sessionPeak).toBeNull();
    expect(after.peakBacGdl).toBeNull();
    expect(after.captured).toBeNull();
    expect(after.peakReceivedAt).toBeNull();
    // Stream state survives the reset untouched.
    expect(after.connection).toBe('connected');
    expect(after.readings).toBe(before.readings);
    expect(after.lastReceivedAt).toBe(before.lastReceivedAt);
    expect(after.raw).toBe(900);
    expect(after.avg).toBe(850);
    expect(after.over).toBe(true);
    expect(after.alarm).toBe(true);
    expect(after.seq).toBe(12);
    expect(after.uptimeMs).toBe(96_500);
    expect(after.deviceSerial).toBe('MQ3-0001');
    expect(after.connectedAt).toBe(before.connectedAt);
    // The firmware is still asked to drop its own latched peak/alarm state.
    expect(transport.sendCommand).toHaveBeenCalledWith('RST');
  });

  it('keeps a healthy stream alive when the next record arrives late', async () => {
    const clock = installClock('2026-10-14T09:00:00.000Z');
    try {
      const session = new BreathalyzerSession();
      const transport = deferredTransport();

      await session.connect(transport);
      const connectedAt = Date.parse(session.getSnapshot().connectedAt as string);

      // A frame lands two seconds after the socket connected.
      clock.advance(2_000);
      transport.emit(
        '{"raw":300,"avg":280,"peak":280,"warm":false,"seq":3,"up":120000}'
      );
      const lastReceivedAt = Date.parse(session.getSnapshot().lastReceivedAt as string);
      expect(lastReceivedAt - connectedAt).toBe(2_000);

      session.startNewSubject();

      // The next record is late: this is 2.9 s after the last frame, which is
      // 4.9 s after the socket connected. Restarting the freshness clock at
      // connect time used to tear this healthy link down.
      clock.advance(MAX_BREATHALYZER_READING_AGE_MS - 100);
      session.expireIfStale(clock.now());

      expect(session.getSnapshot().connection).toBe('connected');
      expect(session.getSnapshot().readings).toBe(1);
      expect(session.getSnapshot().lastReceivedAt).toBe(new Date(lastReceivedAt).toISOString());
    } finally {
      clock.restore();
    }
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

  it('does not calibrate while the sensor is still warming up', async () => {
    const session = new BreathalyzerSession();
    const transport = {
      kind: 'simulated' as const,
      label: 'Test transport',
      async connect() {},
      async disconnect() {},
      onLine(listener: (line: string) => void) {
        listener('{"raw":140,"avg":138,"peak":140,"over":false,"alarm":false,"warm":true}');
        return () => {};
      }
    };

    await session.connect(transport);
    expect(session.getSnapshot().warm).toBe(true);
    expect(session.calibrateFromCleanAir()).toBeNull();
  });

  it('does not calibrate while the hardware reports a fault', async () => {
    const session = new BreathalyzerSession();
    const transport = {
      kind: 'simulated' as const,
      label: 'Test transport',
      async connect() {},
      async disconnect() {},
      onLine(listener: (line: string) => void) {
        listener(
          '{"raw":140,"avg":138,"peak":140,"warm":false,"fault":"rail","state":"IDLE"}'
        );
        return () => {};
      }
    };

    await session.connect(transport);
    expect(session.getSnapshot().fault).toBe('rail');
    expect(session.calibrateFromCleanAir()).toBeNull();
  });

  it('does not calibrate while the smoothing window is still thrashing', async () => {
    const session = new BreathalyzerSession();
    const transport = {
      kind: 'simulated' as const,
      label: 'Test transport',
      async connect() {},
      async disconnect() {},
      onLine(listener: (line: string) => void) {
        listener('{"raw":140,"avg":100,"peak":140,"warm":false,"spread":40}');
        listener('{"raw":140,"avg":180,"peak":180,"warm":false,"spread":40}');
        return () => {};
      }
    };

    await session.connect(transport);
    expect(session.getSnapshot().sampleStable).toBe(false);
    expect(session.calibrateFromCleanAir()).toBeNull();
  });
});

describe('breathalyzer connection lifecycle gates', () => {
  function silentTransport() {
    return {
      kind: 'bluetooth_classic' as const,
      label: 'HC-06 Classic • HC-06',
      address: 'AA:BB:CC:DD:EE:FF',
      async connect() {},
      async disconnect() {},
      onLine() {
        return () => {};
      }
    };
  }

  it('captures the device address from the transport', async () => {
    const session = new BreathalyzerSession();

    await session.connect(silentTransport());

    expect(session.getSnapshot().deviceAddress).toBe('AA:BB:CC:DD:EE:FF');
    expect(session.getSnapshot().connectedAt).not.toBeNull();
    expect(session.getSnapshot().blowState).toBe('warming');
  });

  it('keeps a silent socket alive until the connect window elapses', async () => {
    const session = new BreathalyzerSession();
    const disconnect = jest.fn().mockResolvedValue(undefined);

    await session.connect({ ...silentTransport(), disconnect });
    const connectedAt = Date.parse(session.getSnapshot().connectedAt as string);

    session.expireIfStale(connectedAt + 2_000);
    expect(session.getSnapshot().connection).toBe('connected');
    expect(disconnect).not.toHaveBeenCalled();

    session.expireIfStale(connectedAt + 3_001);
    expect(session.getSnapshot().connection).toBe('error');
    expect(session.getSnapshot().error).toBe(
      'Connected to the breathalyzer, but no telemetry arrived. Check power and TX/RX wiring.'
    );
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('ignores a stale snapshot from a connection that never completed', async () => {
    const session = new BreathalyzerSession();

    await session.connect(silentTransport());
    // A transport that fails its own connect() never records `connectedAt`.
    const failing = {
      kind: 'bluetooth_classic' as const,
      label: 'HC-06 Classic • HC-06',
      async connect() {
        throw new Error('Socket unavailable');
      },
      async disconnect() {},
      onLine() {
        return () => {};
      }
    };
    await session.connect(failing);

    session.expireIfStale();
    expect(session.getSnapshot().connection).toBe('error');
    expect(session.getSnapshot().error).toBe('Socket unavailable');
  });

  it('reports stale telemetry once at least one frame has arrived', async () => {
    const session = new BreathalyzerSession();
    const transport = {
      kind: 'bluetooth_classic' as const,
      label: 'HC-06',
      async connect() {},
      async disconnect() {},
      onLine(listener: (line: string) => void) {
        listener('{"raw":300,"avg":280,"peak":280,"warm":false}');
        return () => {};
      }
    };

    await session.connect(transport);
    const receivedAt = session.getSnapshot().lastReceivedAt as string;

    session.expireIfStale(Date.parse(receivedAt) + 3_001);
    expect(session.getSnapshot().error).toBe(
      'HC-06 stopped sending live data. Reconnect the device and try again.'
    );
  });
});

describe('breathalyzer sendCommand', () => {
  function commandTransport() {
    const sendCommand = jest.fn().mockResolvedValue(undefined);
    return {
      kind: 'bluetooth_classic' as const,
      label: 'HC-06 Classic • HC-06',
      address: '11:22:33:44:55:66',
      async connect() {},
      async disconnect() {},
      sendCommand,
      onLine() {
        return () => {};
      }
    };
  }

  it('forwards commands to a connected transport', async () => {
    const session = new BreathalyzerSession();
    const transport = commandTransport();

    await session.connect(transport);

    expect(await session.sendCommand('RST')).toBe(true);
    expect(transport.sendCommand).toHaveBeenCalledWith('RST');
  });

  it('reports failure when no command channel exists', async () => {
    const session = new BreathalyzerSession();
    const transport = {
      kind: 'bluetooth_classic' as const,
      label: 'HC-06 Classic • HC-06',
      async connect() {},
      async disconnect() {},
      onLine() {
        return () => {};
      }
    };

    await session.connect(transport);

    expect(await session.sendCommand('RST')).toBe(false);
  });

  it('reports failure when the device rejects the command', async () => {
    const session = new BreathalyzerSession();
    const transport = {
      kind: 'bluetooth_classic' as const,
      label: 'HC-06 Classic • HC-06',
      async connect() {},
      async disconnect() {},
      sendCommand: jest.fn().mockRejectedValue(new Error('Socket closed')),
      onLine() {
        return () => {};
      }
    };

    await session.connect(transport);

    expect(await session.sendCommand('RST')).toBe(false);
  });

  it('refuses to send commands while disconnected', async () => {
    const session = new BreathalyzerSession();
    const transport = commandTransport();

    expect(await session.sendCommand('RST')).toBe(false);
    expect(transport.sendCommand).not.toHaveBeenCalled();

    await session.connect(transport);
    await session.disconnect();

    expect(await session.sendCommand('RST')).toBe(false);
  });

  it('asks the firmware to reset its latched state for a new subject', async () => {
    const session = new BreathalyzerSession();
    const transport = commandTransport();
    const lines: Array<(line: string) => void> = [];
    const emitting = {
      ...transport,
      onLine(listener: (line: string) => void) {
        lines.push(listener);
        return () => {
          const index = lines.indexOf(listener);
          if (index >= 0) lines.splice(index, 1);
        };
      }
    };

    await session.connect(emitting);
    for (const listener of lines) {
      listener('{"raw":300,"avg":280,"peak":280,"warm":false,"seq":4}');
    }

    expect(session.getSnapshot().readings).toBe(1);
    expect(session.getSnapshot().peakReceivedAt).not.toBeNull();

    session.startNewSubject();

    expect(transport.sendCommand).toHaveBeenCalledWith('RST');
    expect(session.getSnapshot().peakReceivedAt).toBeNull();
    // The live stream keeps its frame bookkeeping across the reset.
    expect(session.getSnapshot().readings).toBe(1);
    expect(session.getSnapshot().seq).toBe(4);
    expect(session.getSnapshot().sampleStable).toBe(true);
    expect(session.getSnapshot().lastReceivedAt).not.toBeNull();
    expect(session.getSnapshot().connection).toBe('connected');
  });
});

describe('breathalyzer extended telemetry handling', () => {
  it('exposes the firmware uptime only once a frame has arrived', async () => {
    const session = new BreathalyzerSession();
    const transport = deferredTransport();

    // Optional field: nothing has arrived yet, so it stays null.
    await session.connect(transport);
    expect(session.getSnapshot().uptimeMs ?? null).toBeNull();

    transport.emit(
      firmwareLine({ ...FULL_FIRMWARE_FIELDS, raw: 300, avg: 280, peak: 290, up: 42_500 })
    );
    expect(session.getSnapshot().uptimeMs).toBe(42_500);

    // Each frame carries the value it reported: a legacy line without `up`
    // resets it, rather than keeping a stale uptime on screen.
    transport.emit('{"raw":310,"avg":290,"peak":300,"warm":false}');
    expect(session.getSnapshot().uptimeMs ?? null).toBeNull();
  });

  it('clears the uptime again when a new connection starts', async () => {
    const session = new BreathalyzerSession();
    const first = deferredTransport('First HC-06');
    await session.connect(first);
    first.emit('{"raw":300,"avg":280,"peak":280,"warm":false,"up":40000}');
    expect(session.getSnapshot().uptimeMs).toBe(40_000);

    await session.connect(deferredTransport('Second HC-06'));
    expect(session.getSnapshot().uptimeMs ?? null).toBeNull();
  });

  it('mirrors the firmware warm-up constant', () => {
    expect(BREATHALYZER_WARMUP_MS).toBe(60_000);
  });

  it('derives the blow state from the firmware state machine', async () => {
    const session = new BreathalyzerSession();
    const lines = [
      '{"raw":140,"avg":138,"peak":140,"warm":true,"fault":"ok","state":"WARM"}',
      '{"raw":500,"avg":480,"peak":480,"warm":false,"fault":"ok","state":"BLOW"}',
      '{"raw":560,"avg":540,"peak":540,"warm":false,"fault":"ok","state":"PEAK"}'
    ];
    const transport = {
      kind: 'bluetooth_classic' as const,
      label: 'HC-06',
      async connect() {},
      async disconnect() {},
      onLine(listener: (line: string) => void) {
        for (const line of lines) listener(line);
        return () => {};
      }
    };

    await session.connect(transport);

    expect(session.getSnapshot().blowState).toBe('peak_ready');
  });

  it('marks a hardware fault as a fault blow state', async () => {
    const session = new BreathalyzerSession();
    const transport = {
      kind: 'bluetooth_classic' as const,
      label: 'HC-06',
      async connect() {},
      async disconnect() {},
      onLine(listener: (line: string) => void) {
        listener('{"raw":0,"avg":0,"peak":0,"warm":false,"fault":"short","state":"IDLE"}');
        return () => {};
      }
    };

    await session.connect(transport);

    expect(session.getSnapshot().blowState).toBe('fault');
    expect(session.getSnapshot().sampleStable).toBe(false);
  });

  it('falls back to clean-air deflection when no device state arrives', async () => {
    const session = new BreathalyzerSession();
    const transport = {
      kind: 'bluetooth_classic' as const,
      label: 'HC-06',
      async connect() {},
      async disconnect() {},
      onLine(listener: (line: string) => void) {
        listener('{"raw":110,"avg":105,"peak":105,"warm":false}');
        return () => {};
      }
    };

    await session.connect(transport);

    // ~120 counts is clean air, so 105 counts is still baseline noise.
    expect(session.getSnapshot().blowState).toBe('idle');
  });

  it('treats an unsettled window above clean air as blowing', async () => {
    const session = new BreathalyzerSession();
    const transport = {
      kind: 'bluetooth_classic' as const,
      label: 'HC-06',
      async connect() {},
      async disconnect() {},
      onLine(listener: (line: string) => void) {
        listener('{"raw":500,"avg":300,"peak":300,"warm":false,"spread":40}');
        listener('{"raw":500,"avg":480,"peak":480,"warm":false,"spread":40}');
        return () => {};
      }
    };

    await session.connect(transport);

    expect(session.getSnapshot().sampleStable).toBe(false);
    expect(session.getSnapshot().blowState).toBe('blowing');
  });

  it('accumulates frames the firmware dropped', async () => {
    const session = new BreathalyzerSession();
    const transport = {
      kind: 'bluetooth_classic' as const,
      label: 'HC-06',
      async connect() {},
      async disconnect() {},
      onLine(listener: (line: string) => void) {
        listener('{"raw":300,"avg":280,"peak":280,"warm":false,"seq":10}');
        listener('{"raw":310,"avg":290,"peak":290,"warm":false,"seq":11}');
        listener('{"raw":320,"avg":300,"peak":300,"warm":false,"seq":16}');
        return () => {};
      }
    };

    await session.connect(transport);

    expect(session.getSnapshot().seq).toBe(16);
    expect(session.getSnapshot().droppedFrames).toBe(4);
  });

  it('ignores a sequence restart rather than inventing dropped frames', async () => {
    const session = new BreathalyzerSession();
    const transport = {
      kind: 'bluetooth_classic' as const,
      label: 'HC-06',
      async connect() {},
      async disconnect() {},
      onLine(listener: (line: string) => void) {
        listener('{"raw":300,"avg":280,"peak":280,"warm":false,"seq":90}');
        listener('{"raw":310,"avg":290,"peak":290,"warm":false,"seq":1}');
        return () => {};
      }
    };

    await session.connect(transport);

    expect(session.getSnapshot().droppedFrames).toBe(0);
  });

  it('refuses to capture while the device reports a fault', async () => {
    const session = new BreathalyzerSession();
    const transport = {
      kind: 'bluetooth_classic' as const,
      label: 'HC-06',
      async connect() {},
      async disconnect() {},
      onLine(listener: (line: string) => void) {
        listener('{"raw":300,"avg":280,"peak":300,"warm":false,"fault":"stuck"}');
        return () => {};
      }
    };

    await session.connect(transport);

    expect(session.getSnapshot().sessionPeak).toBe(280);
    expect(session.capture()).toBeNull();
  });

  it('records capture provenance from the firmware telemetry', async () => {
    const session = new BreathalyzerSession();
    const transport = {
      kind: 'bluetooth_classic' as const,
      label: 'HC-06 Classic • HC-06',
      address: 'AA:BB:CC:DD:EE:FF',
      async connect() {},
      async disconnect() {},
      onLine(listener: (line: string) => void) {
        listener(
          firmwareLine({
            raw: 640,
            avg: 610,
            peak: 640,
            sn: 'MQ3-0042',
            over: true,
            alarm: true,
            warm: false,
            seq: 7,
            fault: 'ok',
            state: 'PEAK'
          })
        );
        return () => {};
      }
    };

    await session.connect(transport);
    const captured = session.capture();

    expect(captured).not.toBeNull();
    expect(captured).toMatchObject({
      deviceAddress: 'AA:BB:CC:DD:EE:FF',
      overAtCapture: true,
      alarmAtCapture: true,
      peakReceivedAt: session.getSnapshot().lastReceivedAt,
      sessionPeakRaw: 610
    });
    expect((captured as CapturedBreathalyzerReading).mgPerLAtCapture).toBeGreaterThan(0);
    expect((captured as CapturedBreathalyzerReading).bacGdl).toBeCloseTo(
      (captured as CapturedBreathalyzerReading).mgPerLAtCapture * 0.21,
      10
    );
    expect(captured).toEqual(session.getSnapshot().captured);
  });

  it('forgets the provenance after a connection is replaced', async () => {
    const session = new BreathalyzerSession();
    const first = {
      kind: 'bluetooth_classic' as const,
      label: 'HC-06 Classic • HC-06',
      address: 'AA:BB:CC:DD:EE:FF',
      async connect() {},
      async disconnect() {},
      onLine(listener: (line: string) => void) {
        listener('{"raw":400,"avg":390,"peak":400,"warm":false,"seq":3}');
        return () => {};
      }
    };
    const second = {
      kind: 'bluetooth_classic' as const,
      label: 'HC-06 Classic • HC-06',
      address: '99:88:77:66:55:44',
      async connect() {},
      async disconnect() {},
      onLine() {
        return () => {};
      }
    };

    await session.connect(first);
    await session.connect(second);

    expect(session.getSnapshot()).toMatchObject({
      connection: 'connected',
      deviceAddress: '99:88:77:66:55:44',
      connectedAt: expect.any(String),
      peakReceivedAt: null,
      sessionPeak: null,
      sampleStable: false,
      blowState: 'warming',
      vccMv: null,
      spread: null,
      fault: null,
      seq: null,
      droppedFrames: 0
    });
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
      calibration: DEFAULT_BREATHALYZER_CALIBRATION,
      peakReceivedAt: null,
      deviceAddress: null,
      mgPerLAtCapture: 2.4,
      overAtCapture: false,
      alarmAtCapture: false
    };

    expect(toDeviceEvidence(base)).not.toBeNull();
    expect(toDeviceEvidence({ ...base, transport: null })).toBeNull();
    expect(toDeviceEvidence({ ...base, rawAtCapture: null })).toBeNull();
    expect(toDeviceEvidence({ ...base, avgAtCapture: null })).toBeNull();
  });

  it('binds the device address into the evidence serial', () => {
    const base: CapturedBreathalyzerReading = {
      bacGdl: 0.05,
      sessionPeakRaw: 500,
      rawAtCapture: 480,
      avgAtCapture: 470,
      liveBacGdlAtCapture: 0.04,
      capturedAt: '2026-09-21T10:15:00.000Z',
      transport: 'bluetooth_classic',
      deviceSerial: 'MQ3-0042',
      calibration: DEFAULT_BREATHALYZER_CALIBRATION,
      peakReceivedAt: null,
      deviceAddress: 'AA:BB:CC:DD:EE:FF',
      mgPerLAtCapture: 2.4,
      overAtCapture: false,
      alarmAtCapture: false
    };

    expect(toDeviceEvidence(base)).toMatchObject({ serial: 'MQ3-0042@AA:BB:CC:DD:EE:FF' });
    expect(
      toDeviceEvidence({ ...base, deviceSerial: null })
    ).toMatchObject({ serial: '@AA:BB:CC:DD:EE:FF' });
    expect(
      toDeviceEvidence({ ...base, deviceAddress: null })
    ).toMatchObject({ serial: 'MQ3-0042' });
    expect(
      toDeviceEvidence({ ...base, deviceAddress: '   ' })
    ).toMatchObject({ serial: 'MQ3-0042' });
    expect(
      toDeviceEvidence({ ...base, deviceSerial: '  ', deviceAddress: ' AA:BB:CC:DD:EE:FF ' })
    ).toMatchObject({ serial: '@AA:BB:CC:DD:EE:FF' });
  });
});

describe('simulated MQ-3 transport', () => {
  it('emits the extended firmware field set with a valid checksum', async () => {
    const transport = createSimulatedTransport({
      calibration: DEFAULT_BREATHALYZER_CALIBRATION,
      sampleIntervalMs: 5,
      warmupMs: 0,
      cycleMs: 10_000
    });

    const lines: string[] = [];
    transport.onLine((line) => lines.push(line));
    await transport.connect();
    await waitFor(() => lines.length > 2);
    await transport.disconnect();

    const reading = parseBreathalyzerLine(lines[lines.length - 1]);
    expect(reading).not.toBeNull();
    expect(reading).toMatchObject({
      serial: 'MQ3-SIM1',
      vccMv: 5000,
      spread: 2,
      deviceR0Ohms: 7532,
      fault: 'ok',
      crcValid: true
    });
    expect(typeof reading?.seq).toBe('number');
    expect(typeof reading?.uptimeMs).toBe('number');
    expect(['WARM', 'IDLE', 'BLOW', 'PEAK']).toContain(reading?.deviceState);
  });

  it('folds the latched peak back onto the smoothed value on RST', async () => {
    const transport = createSimulatedTransport({
      calibration: DEFAULT_BREATHALYZER_CALIBRATION,
      targetBacGdl: 0.09,
      alarmThresholdRaw: 250,
      sampleIntervalMs: 5,
      warmupMs: 0,
      cycleMs: 600
    });

    const lines: string[] = [];
    transport.onLine((line) => lines.push(line));
    await transport.connect();
    // Poll until the tracked peak has clearly separated from the smoothed
    // value, rather than assuming a fixed number of frames have arrived.
    await waitFor(() => {
      const reading = lines.length
        ? parseBreathalyzerLine(lines[lines.length - 1])
        : null;
      if (!reading) return false;
      return (reading.peak as number) - (reading.avg as number) > 50;
    });

    const before = parseBreathalyzerLine(lines[lines.length - 1]);
    expect(before).not.toBeNull();

    const mark = lines.length;
    await (
      transport as { sendCommand(command: string): Promise<void> }
    ).sendCommand('RST');
    await waitFor(() => lines.length > mark);

    // RST folds the latched peak back onto the smoothed value that was live
    // when the command arrived, so the very next record starts from that value.
    const after = parseBreathalyzerLine(lines[mark]);
    expect(after).not.toBeNull();
    expect(
      Math.abs((after?.peak as number) - (before?.avg as number))
    ).toBeLessThanOrEqual(3);

    await transport.disconnect();
  });

  it('keeps streaming telemetry after an unsupported command', async () => {
    const transport = createSimulatedTransport({
      calibration: DEFAULT_BREATHALYZER_CALIBRATION,
      sampleIntervalMs: 5,
      warmupMs: 0
    });

    const lines: string[] = [];
    transport.onLine((line) => lines.push(line));
    await transport.connect();
    await waitFor(() => lines.length > 1);
    const mark = lines.length;

    await (
      transport as { sendCommand(command: string): Promise<void> }
    ).sendCommand('PING');
    await waitFor(() => lines.length > mark);

    expect(parseBreathalyzerLine(lines[mark])).not.toBeNull();
    await transport.disconnect();
  });

  it('connects to a session and derives a blow state', async () => {
    const transport = createSimulatedTransport({
      calibration: DEFAULT_BREATHALYZER_CALIBRATION,
      sampleIntervalMs: 5,
      warmupMs: 0,
      cycleMs: 10_000
    });

    const session = new BreathalyzerSession();
    await session.connect(transport);
    await waitFor(() => session.getSnapshot().readings > 0);

    const snapshot = session.getSnapshot();
    expect(snapshot.connection).toBe('connected');
    expect(snapshot.deviceSerial).toBe('MQ3-SIM1');
    // The simulated transport carries no radio address.
    expect(session.sendCommand('RST')).toBeInstanceOf(Promise);

    await session.disconnect();
  });
});

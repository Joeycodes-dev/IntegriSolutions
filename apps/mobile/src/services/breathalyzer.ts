export interface BreathalyzerCalibration {
  version: string;
  loadResistorOhms: number;
  cleanAirResistanceOhms: number;
  mgPerLAtRatioOne: number;
  curveSlope: number;
  cleanAirRatio: number;
}

export const DEFAULT_BREATHALYZER_CALIBRATION: BreathalyzerCalibration = {
  version: 'mq3-default-v1',
  loadResistorOhms: 1000,
  cleanAirResistanceOhms: 7532,
  mgPerLAtRatioOne: 0.45,
  curveSlope: -0.7,
  cleanAirRatio: 60
};

export const MQ3_ADC_MAX = 1023;
export const MQ3_VCC = 5;
export const BREATH_TO_BLOOD_FACTOR = 0.21;
export const MAX_BREATHALYZER_READING_AGE_MS = 3_000;

/**
 * Mirrors the firmware `WARMUP_MS` constant: the MQ-3 sensor's warm-up floor.
 * The firmware clears its own `warm` flag once this budget has elapsed, so the
 * app derives the remaining warm-up from the same number instead of inventing
 * a second copy of it.
 */
export const BREATHALYZER_WARMUP_MS = 60_000;

/**
 * Device-reported fault codes from the upgraded firmware. `ok` is a healthy
 * sample; any other value indicates a hardware condition that blocks capture.
 */
export type BreathalyzerFault = 'ok' | 'short' | 'rail' | 'stuck' | 'vcc';

/**
 * Firmware state machine snapshot. Drives the roadside "blow state" badge.
 */
export type BreathalyzerDeviceState = 'WARM' | 'IDLE' | 'BLOW' | 'PEAK';

/**
 * Derived guidance shown on the roadside reading card while a subject blows.
 */
export type BreathalyzerBlowState =
  | 'warming'
  | 'idle'
  | 'blowing'
  | 'peak_ready'
  | 'fault';

const FAULT_CODES: readonly BreathalyzerFault[] = [
  'ok',
  'short',
  'rail',
  'stuck',
  'vcc'
];

const DEVICE_STATE_CODES: readonly BreathalyzerDeviceState[] = [
  'WARM',
  'IDLE',
  'BLOW',
  'PEAK'
];

function isFaultCode(value: unknown): value is BreathalyzerFault {
  return typeof value === 'string' && FAULT_CODES.includes(value as BreathalyzerFault);
}

function isDeviceStateCode(value: unknown): value is BreathalyzerDeviceState {
  return (
    typeof value === 'string' &&
    DEVICE_STATE_CODES.includes(value as BreathalyzerDeviceState)
  );
}

/**
 * The upgraded firmware appends a trailing `,"crc":"XX"` field: an 8-bit XOR of
 * every character between the opening `{` (exclusive) and the `,"crc":"`
 * separator (exclusive), formatted as two uppercase hex digits. Legacy 9-field
 * lines omit `crc` entirely and stay accepted for backward compatibility.
 */
function verifyLineChecksum(line: string, jsonStart: number): boolean | null {
  const crcMatch = new RegExp('"crc"\\s*:\\s*"([0-9A-Fa-f]{2})"').exec(line);
  if (!crcMatch) return null;

  const crcIndex = crcMatch.index;
  // The payload the firmware hashed excludes the comma that precedes "crc".
  const markerIndex = line.lastIndexOf(',', crcIndex);
  if (markerIndex < jsonStart) return null;

  const payloadStart = jsonStart + 1;
  const payloadEnd = markerIndex;
  let checksum = 0;
  for (let index = payloadStart; index < payloadEnd; index += 1) {
    checksum ^= line.charCodeAt(index) & 0xff;
  }

  const expected = Number.parseInt(crcMatch[1], 16);
  return Number.isFinite(expected) && checksum === expected;
}

function clampAdc(value: number): number {
  return Math.max(0, Math.min(MQ3_ADC_MAX, value));
}

export interface BreathalyzerReading {
  raw: number;
  avg: number;
  peak: number;
  vout: number | null;
  serial: string | null;
  over: boolean;
  alarm: boolean;
  warm: boolean;
  receivedAt: string;
  /** Sensor resistance in ohms, null when the firmware reports `rs < 0`. */
  rs: number | null;
  /** Monotonic per-boot sequence number used to detect dropped frames. */
  seq: number | null;
  /** Milliseconds since the device booted (`up`). */
  uptimeMs: number | null;
  /** Rail voltage in millivolts (`vcc`). */
  vccMv: number | null;
  /** Min/max spread of the smoothing window in ADC counts (`spread`). */
  spread: number | null;
  /** Device-reported clean-air resistance (`r0`). */
  deviceR0Ohms: number | null;
  /** Hardware fault code, null when the firmware does not report one. */
  fault: BreathalyzerFault | null;
  /** Firmware state, null when the firmware does not report one. */
  deviceState: BreathalyzerDeviceState | null;
  /** null when no `crc` field was present (legacy line). */
  crcValid: boolean | null;
}

export type BreathalyzerTransportKind = 'ble' | 'bluetooth_classic' | 'simulated';

export interface BreathalyzerTransport {
  readonly kind: BreathalyzerTransportKind;
  readonly label: string;
  /** Bluetooth MAC (or BLE address) when the transport is bound to a device. */
  readonly address?: string | null;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Optional device command channel (for example the firmware `RST` verb). */
  sendCommand?(command: string): Promise<void>;
  onLine(listener: (line: string) => void): () => void;
  onError?(listener: (message: string) => void): () => void;
}

export type BreathalyzerConnection = 'idle' | 'connecting' | 'connected' | 'error';

export interface CapturedBreathalyzerReading {
  bacGdl: number;
  sessionPeakRaw: number;
  rawAtCapture: number | null;
  avgAtCapture: number | null;
  liveBacGdlAtCapture: number | null;
  capturedAt: string;
  transport: BreathalyzerTransportKind | null;
  deviceSerial: string | null;
  calibration: BreathalyzerCalibration;
  /** When the session peak sample arrived. */
  peakReceivedAt: string | null;
  /** Bluetooth MAC / BLE address the reading came from, when known. */
  deviceAddress: string | null;
  /** Breath-alcohol concentration at the peak, in mg/L. */
  mgPerLAtCapture: number;
  /** Alarm latch state at capture. */
  overAtCapture: boolean;
  alarmAtCapture: boolean;
}

export interface DeviceEvidencePayload {
  transport: BreathalyzerTransportKind;
  serial: string | null;
  calibrationVersion: string;
  calibrationCleanAirResistanceOhms: number;
  sessionPeakRaw: number;
  avgRaw: number;
  raw: number;
  capturedAt: string;
}

export interface BreathalyzerSnapshot {
  connection: BreathalyzerConnection;
  error: string | null;
  transportKind: BreathalyzerTransportKind | null;
  transportLabel: string | null;
  /** When the current connection reached the `connected` state. */
  connectedAt: string | null;
  warm: boolean;
  over: boolean;
  alarm: boolean;
  raw: number | null;
  avg: number | null;
  devicePeak: number | null;
  sessionPeak: number | null;
  liveBacGdl: number | null;
  peakBacGdl: number | null;
  deviceSerial: string | null;
  /** Bluetooth MAC / BLE address of the connected device. */
  deviceAddress: string | null;
  /** When the current session peak sample arrived. */
  peakReceivedAt: string | null;
  readings: number;
  lastReceivedAt: string | null;
  /** True when the smoothing window is settled enough to trust the sample. */
  sampleStable: boolean;
  /** Derived roadside guidance shown while a subject blows. */
  blowState: BreathalyzerBlowState;
  /** Measured supply rail in millivolts, null when the firmware omits it. */
  vccMv: number | null;
  /** Min/max spread of the firmware smoothing window in ADC counts. */
  spread: number | null;
  /** Last device-reported fault code. */
  fault: BreathalyzerFault | null;
  /** Monotonic per-boot sequence number of the newest accepted frame. */
  seq: number | null;
  /** Frames the firmware skipped since the connection started. */
  droppedFrames: number;
  /**
   * Device uptime from the firmware `up` field, in ms. Null before the first
   * reading (and on legacy firmware that does not report it).
   */
  uptimeMs?: number | null;
  captured: CapturedBreathalyzerReading | null;
  calibration: BreathalyzerCalibration;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function parseBreathalyzerLine(line: string): BreathalyzerReading | null {
  const start = line.indexOf('{');
  const end = line.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(line.slice(start, end + 1));
  } catch {
    return null;
  }

  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const raw = toFiniteNumber(record.raw);
  if (raw === null || raw < 0 || raw > MQ3_ADC_MAX) return null;

  const crcValid = verifyLineChecksum(line, start);
  // A bad checksum means the frame was truncated or corrupted on the wire, so
  // the payload must not be trusted. A missing `crc` is a legacy 9-field line.
  if (crcValid === false) return null;

  const serial =
    typeof record.sn === 'string' && record.sn.trim() ? record.sn.trim() : null;

  const rawRs = toFiniteNumber(record.rs);
  const rs = rawRs !== null && rawRs >= 0 ? rawRs : null;

  const rawSeq = toFiniteNumber(record.seq);
  const seq = rawSeq !== null && rawSeq >= 0 ? Math.trunc(rawSeq) : null;

  const rawUp = toFiniteNumber(record.up);
  const uptimeMs = rawUp !== null && rawUp >= 0 ? Math.trunc(rawUp) : null;

  const rawVcc = toFiniteNumber(record.vcc);
  const vccMv = rawVcc !== null && rawVcc > 0 ? Math.trunc(rawVcc) : null;

  const rawSpread = toFiniteNumber(record.spread);
  const spread =
    rawSpread !== null && rawSpread >= 0 ? clampAdc(Math.trunc(rawSpread)) : null;

  const rawR0 = toFiniteNumber(record.r0);
  const deviceR0Ohms = rawR0 !== null && rawR0 > 0 ? rawR0 : null;

  return {
    raw,
    avg: clampAdc(toFiniteNumber(record.avg) ?? raw),
    peak: clampAdc(toFiniteNumber(record.peak) ?? raw),
    vout: toFiniteNumber(record.vout),
    serial,
    over: record.over === true,
    alarm: record.alarm === true,
    warm: record.warm === true,
    receivedAt: new Date().toISOString(),
    rs,
    seq,
    uptimeMs,
    vccMv,
    spread,
    deviceR0Ohms,
    fault: isFaultCode(record.fault) ? record.fault : null,
    deviceState: isDeviceStateCode(record.state) ? record.state : null,
    crcValid
  };
}

export function adcToVolts(raw: number): number {
  return (raw * MQ3_VCC) / MQ3_ADC_MAX;
}

export function voltsToRs(vout: number, loadResistorOhms: number): number | null {
  if (!Number.isFinite(vout) || vout <= 0.01 || vout >= MQ3_VCC) return null;
  return (loadResistorOhms * (MQ3_VCC - vout)) / vout;
}

export function rawToRs(raw: number, calibration: BreathalyzerCalibration): number | null {
  return voltsToRs(adcToVolts(raw), calibration.loadResistorOhms);
}

export function mgPerLToBacGdl(mgPerL: number): number {
  return mgPerL * BREATH_TO_BLOOD_FACTOR;
}

export function mgPerLFromRatio(ratio: number, calibration: BreathalyzerCalibration): number {
  return calibration.mgPerLAtRatioOne * Math.pow(ratio, calibration.curveSlope);
}

export function rawToMgPerL(raw: number, calibration: BreathalyzerCalibration): number | null {
  const rs = rawToRs(raw, calibration);
  if (rs === null || calibration.cleanAirResistanceOhms <= 0) return null;
  const ratio =
    (rs / calibration.cleanAirResistanceOhms) * calibration.cleanAirRatio;
  return mgPerLFromRatio(ratio, calibration);
}

export function rawToBacGdl(raw: number, calibration: BreathalyzerCalibration): number | null {
  const mgPerL = rawToMgPerL(raw, calibration);
  if (mgPerL === null) return null;
  return mgPerLToBacGdl(mgPerL);
}

export function bacGdlToRaw(bacGdl: number, calibration: BreathalyzerCalibration): number {
  const mgPerL = bacGdl / BREATH_TO_BLOOD_FACTOR;
  const ratio = Math.pow(
    mgPerL / calibration.mgPerLAtRatioOne,
    1 / calibration.curveSlope
  );
  const rs = (ratio / calibration.cleanAirRatio) * calibration.cleanAirResistanceOhms;
  const vout = (MQ3_VCC * calibration.loadResistorOhms) / (rs + calibration.loadResistorOhms);
  return Math.max(0, Math.min(MQ3_ADC_MAX, (vout * MQ3_ADC_MAX) / MQ3_VCC));
}

export function calibrationFromCleanAir(
  raw: number,
  calibration: BreathalyzerCalibration = DEFAULT_BREATHALYZER_CALIBRATION
): BreathalyzerCalibration | null {
  const rs = rawToRs(raw, calibration);
  if (rs === null || !Number.isFinite(rs) || rs <= 0) return null;
  return {
    ...calibration,
    version: `${calibration.version.split('+clean-air')[0]}+clean-air`,
    cleanAirResistanceOhms: Number(rs.toFixed(2))
  };
}

export function cleanAirRaw(
  calibration: BreathalyzerCalibration = DEFAULT_BREATHALYZER_CALIBRATION
): number {
  const vout =
    (MQ3_VCC * calibration.loadResistorOhms) /
    (calibration.cleanAirResistanceOhms + calibration.loadResistorOhms);
  return (vout * MQ3_ADC_MAX) / MQ3_VCC;
}

export function formatBacGdl(bacGdl: number | null): string {
  if (bacGdl === null || !Number.isFinite(bacGdl)) return '--';
  return bacGdl.toFixed(3);
}

export function isBreathalyzerReadingFresh(
  lastReceivedAt: string | null,
  now = Date.now(),
): boolean {
  if (!lastReceivedAt) return false;
  const receivedAt = Date.parse(lastReceivedAt);
  if (!Number.isFinite(receivedAt)) return false;
  const age = now - receivedAt;
  return age >= 0 && age <= MAX_BREATHALYZER_READING_AGE_MS;
}

export function toDeviceEvidence(
  captured: CapturedBreathalyzerReading
): DeviceEvidencePayload | null {
  if (!captured.transport) return null;
  if (captured.rawAtCapture === null || captured.avgAtCapture === null) return null;

  // Bind the transport address into the serial so custody evidence cannot be
  // replayed against a different physical device that shares a serial string.
  const address =
    typeof captured.deviceAddress === 'string' && captured.deviceAddress.trim()
      ? captured.deviceAddress.trim()
      : null;
  const baseSerial =
    typeof captured.deviceSerial === 'string' && captured.deviceSerial.trim()
      ? captured.deviceSerial.trim()
      : null;
  const serial = address
    ? baseSerial
      ? `${baseSerial}@${address}`
      : `@${address}`
    : baseSerial;

  return {
    transport: captured.transport,
    serial,
    calibrationVersion: captured.calibration.version,
    calibrationCleanAirResistanceOhms: captured.calibration.cleanAirResistanceOhms,
    sessionPeakRaw: captured.sessionPeakRaw,
    avgRaw: captured.avgAtCapture,
    raw: captured.rawAtCapture,
    capturedAt: captured.capturedAt
  };
}

export class BreathalyzerSession {
  private snapshot: BreathalyzerSnapshot;
  private listeners = new Set<() => void>();
  private transport: BreathalyzerTransport | null = null;
  private unsubscribeLine: (() => void) | null = null;
  private unsubscribeError: (() => void) | null = null;
  private sessionPeak: number | null = null;
  private recentAvgWindow: number[] = [];
  private peakReceivedAt: string | null = null;

  constructor(calibration: BreathalyzerCalibration = DEFAULT_BREATHALYZER_CALIBRATION) {
    this.snapshot = {
      connection: 'idle',
      error: null,
      transportKind: null,
      transportLabel: null,
      connectedAt: null,
      warm: true,
      over: false,
      alarm: false,
      raw: null,
      avg: null,
      devicePeak: null,
      sessionPeak: null,
      liveBacGdl: null,
      peakBacGdl: null,
      deviceSerial: null,
      deviceAddress: null,
      peakReceivedAt: null,
      readings: 0,
      lastReceivedAt: null,
      sampleStable: false,
      blowState: 'warming',
      vccMv: null,
      spread: null,
      fault: null,
      seq: null,
      droppedFrames: 0,
      uptimeMs: null,
      captured: null,
      calibration
    };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): BreathalyzerSnapshot => this.snapshot;

  getCalibration(): BreathalyzerCalibration {
    return this.snapshot.calibration;
  }

  setCalibration(calibration: BreathalyzerCalibration): void {
    const next = {
      calibration,
      liveBacGdl: this.snapshot.avg === null ? null : rawToBacGdl(this.snapshot.avg, calibration),
      peakBacGdl:
        this.sessionPeak === null ? null : rawToBacGdl(this.sessionPeak, calibration)
    };
    this.update(next);
  }

  calibrateFromCleanAir(): BreathalyzerCalibration | null {
    if (this.snapshot.warm === true) return null;
    if (this.snapshot.avg === null) return null;
    if (this.snapshot.over || this.snapshot.alarm) return null;
    if (this.snapshot.fault !== null && this.snapshot.fault !== 'ok') return null;
    if (!this.snapshot.sampleStable) return null;
    const next = calibrationFromCleanAir(this.snapshot.avg, this.snapshot.calibration);
    if (!next) return null;
    this.setCalibration(next);
    return next;
  }

  /**
   * Sends a firmware command verb to the connected device. Resolves `false`
   * when there is no command channel, or when the device rejects the write, so
   * callers can retry without unwinding the connection.
   */
  async sendCommand(command: string): Promise<boolean> {
    if (this.snapshot.connection !== 'connected' || !this.transport?.sendCommand) {
      return false;
    }
    try {
      await this.transport.sendCommand(command);
      return true;
    } catch {
      return false;
    }
  }

  async connect(transport: BreathalyzerTransport): Promise<void> {
    const previousTransport = this.transport;
    this.disposeTransport();
    this.resetLiveState({
      connection: 'connecting',
      error: null,
      transportKind: transport.kind,
      transportLabel: transport.label,
      deviceAddress: transport.address ?? null
    });

    if (previousTransport) {
      try {
        await previousTransport.disconnect();
      } catch {
        // A failed replacement teardown must not prevent trying the new device.
      }
    }

    this.unsubscribeLine = transport.onLine((line) => this.handleLine(line));
    this.unsubscribeError = transport.onError?.((message) => {
      if (this.transport !== transport) return;
      this.disposeTransport();
      void transport.disconnect().catch(() => undefined);
      this.resetLiveState({ connection: 'error', error: message });
    }) ?? null;

    // Register the transport before awaiting the native connect. The native
    // reader can emit an immediate disconnect/error before its promise
    // resolves; that event must not be mistaken for a stale callback.
    this.transport = transport;

    try {
      await transport.connect();
    } catch (error) {
      if (this.transport !== transport) return;
      this.disposeTransport();
      this.resetLiveState({
        connection: 'error',
        error: error instanceof Error ? error.message : String(error)
      });
      return;
    }

    if (this.transport !== transport) return;
    this.update({
      connection: 'connected',
      error: null,
      connectedAt: new Date().toISOString()
    });
  }

  async disconnect(): Promise<void> {
    const transport = this.transport;
    this.disposeTransport();
    if (transport) {
      try {
        await transport.disconnect();
      } catch {
        // Transport teardown is best-effort; state is reset regardless.
      }
    }
    this.resetLiveState({
      connection: 'idle',
      error: null,
      transportKind: null,
      transportLabel: null
    });
  }

  expireIfStale(now = Date.now()): void {
    if (this.snapshot.connection !== 'connected') return;

    if (this.snapshot.lastReceivedAt === null) {
      // The socket is up but nothing has arrived. Give the device the normal
      // freshness window measured from the moment it connected before failing.
      if (
        !this.snapshot.connectedAt ||
        isBreathalyzerReadingFresh(this.snapshot.connectedAt, now)
      ) {
        return;
      }

      const transport = this.transport;
      this.disposeTransport();
      if (transport) {
        void transport.disconnect().catch(() => undefined);
      }
      this.resetLiveState({
        connection: 'error',
        error:
          'Connected to the breathalyzer, but no telemetry arrived. Check power and TX/RX wiring.'
      });
      return;
    }

    if (isBreathalyzerReadingFresh(this.snapshot.lastReceivedAt, now)) return;

    const transport = this.transport;
    this.disposeTransport();
    if (transport) {
      void transport.disconnect().catch(() => undefined);
    }
    this.resetLiveState({
      connection: 'error',
      error: 'HC-06 stopped sending live data. Reconnect the device and try again.'
    });
  }

  /**
   * Prepares the session for the next subject. Only *subject*-level state is
   * cleared here: the live stream (connection, frames, smoothing window) keeps
   * running untouched, because a late next record must not be mistaken for a
   * dead socket by `expireIfStale`.
   */
  startNewSubject(): void {
    this.sessionPeak = null;
    this.peakReceivedAt = null;
    this.update({
      sessionPeak: null,
      peakBacGdl: null,
      captured: null,
      peakReceivedAt: null
    });

    // Ask the firmware to drop its own latched peak/alarm state so the next
    // subject starts from a clean baseline on both sides of the link.
    void this.sendCommand('RST');
  }

  capture(at = Date.now()): CapturedBreathalyzerReading | null {
    if (this.snapshot.connection !== 'connected') return null;
    if (this.sessionPeak === null) return null;
    if (this.snapshot.warm) return null;
    if (this.snapshot.fault !== null && this.snapshot.fault !== 'ok') return null;
    if (!isBreathalyzerReadingFresh(this.snapshot.lastReceivedAt, at)) return null;
    const bacGdl = rawToBacGdl(this.sessionPeak, this.snapshot.calibration);
    if (bacGdl === null) return null;
    const mgPerLAtCapture =
      rawToMgPerL(this.sessionPeak, this.snapshot.calibration) ?? 0;

    const captured: CapturedBreathalyzerReading = {
      bacGdl,
      sessionPeakRaw: this.sessionPeak,
      rawAtCapture: this.snapshot.raw,
      avgAtCapture: this.snapshot.avg,
      liveBacGdlAtCapture: this.snapshot.liveBacGdl,
      capturedAt: new Date(at).toISOString(),
      transport: this.snapshot.transportKind,
      deviceSerial: this.snapshot.deviceSerial,
      calibration: this.snapshot.calibration,
      peakReceivedAt: this.peakReceivedAt ?? this.snapshot.lastReceivedAt,
      deviceAddress: this.snapshot.deviceAddress,
      mgPerLAtCapture,
      overAtCapture: this.snapshot.over,
      alarmAtCapture: this.snapshot.alarm
    };

    this.update({ captured });
    return captured;
  }

  private resetLiveState(patch: Partial<BreathalyzerSnapshot> = {}): void {
    this.sessionPeak = null;
    this.recentAvgWindow = [];
    this.peakReceivedAt = null;
    this.update({
      warm: true,
      over: false,
      alarm: false,
      raw: null,
      avg: null,
      devicePeak: null,
      sessionPeak: null,
      liveBacGdl: null,
      peakBacGdl: null,
      deviceSerial: null,
      deviceAddress: null,
      connectedAt: null,
      peakReceivedAt: null,
      sampleStable: false,
      blowState: 'warming',
      vccMv: null,
      spread: null,
      fault: null,
      seq: null,
      droppedFrames: 0,
      uptimeMs: null,
      captured: null,
      readings: 0,
      lastReceivedAt: null,
      ...patch
    });
  }

  private disposeTransport(): void {
    this.unsubscribeLine?.();
    this.unsubscribeError?.();
    this.unsubscribeLine = null;
    this.unsubscribeError = null;
    this.transport = null;
  }

  private handleLine(line: string): void {
    const reading = parseBreathalyzerLine(line);
    if (!reading) return;

    if (!reading.warm) {
      this.recentAvgWindow.push(reading.avg);
      if (this.recentAvgWindow.length > 4) {
        this.recentAvgWindow = this.recentAvgWindow.slice(-4);
      }
    }

    // A sample is only trustworthy once warm-up is over, the hardware is
    // healthy, and the firmware smoothing window is not thrashing.
    const blocked =
      reading.warm ||
      (reading.fault !== null && reading.fault !== 'ok') ||
      (reading.spread !== null && reading.spread > 25);
    const sampleStable = blocked
      ? false
      : this.recentAvgWindow.length < 3
        ? true
        : Math.max(...this.recentAvgWindow) - Math.min(...this.recentAvgWindow) <= 15;

    const nextSessionPeak = reading.warm
      ? this.sessionPeak
      : this.sessionPeak === null
        ? reading.avg
        : Math.max(this.sessionPeak, reading.avg);
    if (
      !reading.warm &&
      (this.sessionPeak === null || reading.avg >= this.sessionPeak)
    ) {
      this.peakReceivedAt = reading.receivedAt;
    }
    this.sessionPeak = nextSessionPeak;

    const droppedFrames =
      reading.seq !== null &&
      this.snapshot.seq !== null &&
      reading.seq > this.snapshot.seq + 1
        ? this.snapshot.droppedFrames + (reading.seq - this.snapshot.seq - 1)
        : this.snapshot.droppedFrames;

    let blowState: BreathalyzerBlowState;
    if (reading.fault && reading.fault !== 'ok') {
      blowState = 'fault';
    } else if (reading.warm) {
      blowState = 'warming';
    } else if (reading.deviceState === 'BLOW') {
      blowState = 'blowing';
    } else if (reading.deviceState === 'PEAK') {
      blowState = 'peak_ready';
    } else if (
      nextSessionPeak !== null &&
      reading.avg > cleanAirRaw(this.snapshot.calibration) + 20
    ) {
      // No explicit device state (or `IDLE`): fall back to the deflection
      // above clean air, treating a settled sample as peak-ready.
      blowState = sampleStable ? 'peak_ready' : 'blowing';
    } else {
      blowState = 'idle';
    }

    this.update({
      warm: reading.warm,
      over: reading.over,
      alarm: reading.alarm,
      raw: reading.raw,
      avg: reading.avg,
      devicePeak: reading.peak,
      sessionPeak: nextSessionPeak,
      liveBacGdl: rawToBacGdl(reading.avg, this.snapshot.calibration),
      peakBacGdl:
        nextSessionPeak === null
          ? null
          : rawToBacGdl(nextSessionPeak, this.snapshot.calibration),
      deviceSerial: reading.serial ?? this.snapshot.deviceSerial,
      readings: this.snapshot.readings + 1,
      lastReceivedAt: reading.receivedAt,
      peakReceivedAt: this.peakReceivedAt,
      sampleStable,
      blowState,
      vccMv: reading.vccMv,
      spread: reading.spread,
      fault: reading.fault,
      seq: reading.seq,
      droppedFrames,
      uptimeMs: reading.uptimeMs
    });
  }

  private update(patch: Partial<BreathalyzerSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const breathalyzerSession = new BreathalyzerSession();

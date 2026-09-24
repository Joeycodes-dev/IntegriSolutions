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
}

export type BreathalyzerTransportKind = 'ble' | 'bluetooth_classic' | 'simulated';

export interface BreathalyzerTransport {
  readonly kind: BreathalyzerTransportKind;
  readonly label: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
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
  readings: number;
  lastReceivedAt: string | null;
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
  if (raw === null) return null;

  const serial =
    typeof record.sn === 'string' && record.sn.trim() ? record.sn.trim() : null;

  return {
    raw,
    avg: toFiniteNumber(record.avg) ?? raw,
    peak: toFiniteNumber(record.peak) ?? raw,
    vout: toFiniteNumber(record.vout),
    serial,
    over: record.over === true,
    alarm: record.alarm === true,
    warm: record.warm === true,
    receivedAt: new Date().toISOString()
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

  return {
    transport: captured.transport,
    serial: captured.deviceSerial,
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

  constructor(calibration: BreathalyzerCalibration = DEFAULT_BREATHALYZER_CALIBRATION) {
    this.snapshot = {
      connection: 'idle',
      error: null,
      transportKind: null,
      transportLabel: null,
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
      readings: 0,
      lastReceivedAt: null,
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
    if (this.snapshot.avg === null) return null;
    if (this.snapshot.over || this.snapshot.alarm) return null;
    const next = calibrationFromCleanAir(this.snapshot.avg, this.snapshot.calibration);
    if (!next) return null;
    this.setCalibration(next);
    return next;
  }

  async connect(transport: BreathalyzerTransport): Promise<void> {
    const previousTransport = this.transport;
    this.disposeTransport();
    this.resetLiveState({
      connection: 'connecting',
      error: null,
      transportKind: transport.kind,
      transportLabel: transport.label
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
    this.update({ connection: 'connected', error: null });
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
    if (
      this.snapshot.connection !== 'connected' ||
      this.snapshot.lastReceivedAt === null ||
      isBreathalyzerReadingFresh(this.snapshot.lastReceivedAt, now)
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
      error: 'HC-06 stopped sending live data. Reconnect the device and try again.'
    });
  }

  startNewSubject(): void {
    this.sessionPeak = null;
    this.update({
      over: false,
      alarm: false,
      raw: null,
      avg: null,
      devicePeak: null,
      sessionPeak: null,
      liveBacGdl: null,
      peakBacGdl: null,
      captured: null,
      readings: 0,
      lastReceivedAt: null
    });
  }

  capture(at = Date.now()): CapturedBreathalyzerReading | null {
    if (this.snapshot.connection !== 'connected') return null;
    if (this.sessionPeak === null) return null;
    if (!isBreathalyzerReadingFresh(this.snapshot.lastReceivedAt, at)) return null;
    const bacGdl = rawToBacGdl(this.sessionPeak, this.snapshot.calibration);
    if (bacGdl === null) return null;

    const captured: CapturedBreathalyzerReading = {
      bacGdl,
      sessionPeakRaw: this.sessionPeak,
      rawAtCapture: this.snapshot.raw,
      avgAtCapture: this.snapshot.avg,
      liveBacGdlAtCapture: this.snapshot.liveBacGdl,
      capturedAt: new Date(at).toISOString(),
      transport: this.snapshot.transportKind,
      deviceSerial: this.snapshot.deviceSerial,
      calibration: this.snapshot.calibration
    };

    this.update({ captured });
    return captured;
  }

  private resetLiveState(patch: Partial<BreathalyzerSnapshot> = {}): void {
    this.sessionPeak = null;
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

    const nextSessionPeak = reading.warm
      ? this.sessionPeak
      : this.sessionPeak === null
        ? reading.avg
        : Math.max(this.sessionPeak, reading.avg);
    this.sessionPeak = nextSessionPeak;

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
      lastReceivedAt: reading.receivedAt
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

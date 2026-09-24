import type { LocalTestRecord } from '../db/repository';
import type {
  BreathalyzerDevicePreferences,
  CalibrationHistoryEntry
} from '../services/breathalyzerDeviceStorage';
import {
  formatBacGdl,
  isBreathalyzerReadingFresh,
  bacGdlToRaw,
  rawToBacGdl,
  rawToMgPerL,
  rawToRs,
  type BreathalyzerCalibration,
  type BreathalyzerSnapshot
} from '../services/breathalyzer';

export interface CalibrationDraft {
  loadResistorOhms: string;
  cleanAirResistanceOhms: string;
  mgPerLAtRatioOne: string;
  curveSlope: string;
  cleanAirRatio: string;
}

export type CalibrationDraftResult =
  | { ok: true; value: Omit<BreathalyzerCalibration, 'version'> }
  | { ok: false; error: string };

export interface DeviceHistorySummary {
  totalLocalRecords: number;
  pendingLocalRecords: number;
  failedLocalRecords: number;
  deviceCapturedRecords: number;
  lastDeviceCapturedAt: string | null;
  byTransport: Array<{ transport: string; count: number; lastCapturedAt: string | null }>;
  bySerial: Array<{
    serial: string;
    count: number;
    lastCapturedAt: string | null;
    averageSessionPeakRaw: number | null;
  }>;
}

export interface ReadinessCheck {
  key: string;
  label: string;
  detail: string;
  ok: boolean;
  tone: 'success' | 'warning' | 'error' | 'neutral';
}

export interface DeviceDiagnosticReportInput {
  platformLabel: string;
  snapshot: BreathalyzerSnapshot;
  preferences: BreathalyzerDevicePreferences;
  history: DeviceHistorySummary;
  pairedDevice?: {
    address: string;
    name: string;
    type: string;
    bonded: boolean;
  } | null;
  runtimeBacLimits?: Array<{ label: string; limitG100ml: number }>;
}

const MS_PER_SECOND = 1_000;

export function toCalibrationDraft(calibration: BreathalyzerCalibration): CalibrationDraft {
  return {
    loadResistorOhms: String(calibration.loadResistorOhms),
    cleanAirResistanceOhms: String(calibration.cleanAirResistanceOhms),
    mgPerLAtRatioOne: String(calibration.mgPerLAtRatioOne),
    curveSlope: String(calibration.curveSlope),
    cleanAirRatio: String(calibration.cleanAirRatio)
  };
}

function parseDraftNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.includes(',') && trimmed.includes('.')
    ? trimmed.replace(/,/g, '')
    : trimmed.replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function validateCalibrationDraft(draft: CalibrationDraft): CalibrationDraftResult {
  const loadResistorOhms = parseDraftNumber(draft.loadResistorOhms);
  const cleanAirResistanceOhms = parseDraftNumber(draft.cleanAirResistanceOhms);
  const mgPerLAtRatioOne = parseDraftNumber(draft.mgPerLAtRatioOne);
  const curveSlope = parseDraftNumber(draft.curveSlope);
  const cleanAirRatio = parseDraftNumber(draft.cleanAirRatio);

  if (loadResistorOhms === null || loadResistorOhms <= 0) {
    return { ok: false, error: 'Load resistance must be greater than 0 Ω.' };
  }
  if (cleanAirResistanceOhms === null || cleanAirResistanceOhms <= 0) {
    return { ok: false, error: 'Clean-air resistance must be greater than 0 Ω.' };
  }
  if (mgPerLAtRatioOne === null || mgPerLAtRatioOne <= 0) {
    return { ok: false, error: 'The mg/L reference at ratio 1 must be greater than 0.' };
  }
  if (curveSlope === null || curveSlope === 0) {
    return { ok: false, error: 'Curve slope must be a non-zero number.' };
  }
  if (cleanAirRatio === null || cleanAirRatio <= 0) {
    return { ok: false, error: 'The clean-air ratio must be greater than 0.' };
  }

  return {
    ok: true,
    value: {
      loadResistorOhms,
      cleanAirResistanceOhms,
      mgPerLAtRatioOne,
      curveSlope,
      cleanAirRatio
    }
  };
}

export type ManualCalibrationResult =
  | { ok: true; value: Omit<BreathalyzerCalibration, 'version'>; version: string }
  | { ok: false; error: string };

export function createManualCalibration(
  previous: BreathalyzerCalibration,
  draft: CalibrationDraft,
  now = new Date(),
): ManualCalibrationResult {
  const result = validateCalibrationDraft(draft);
  if (!result.ok) return result;

  const baseVersion = previous.version.split('+')[0].split('~')[0].trim() || 'mq3-custom';
  const isoStamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
  const stamp = `${isoStamp.slice(0, 8)}-${isoStamp.slice(9)}`;

  return {
    ok: true,
    value: result.value,
    version: `${baseVersion}+manual-${stamp}`
  };
}

export function formatResistance(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-- Ω';
  return `${Math.round(value).toLocaleString()} Ω`;
}

export function formatVoltage(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-- V';
  return `${value.toFixed(3)} V`;
}

export function formatRawValue(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  return Math.round(value).toString();
}

export function formatSampleAge(lastReceivedAt: string | null, now = Date.now()): string {
  if (!lastReceivedAt) return 'No sample';
  const receivedAt = Date.parse(lastReceivedAt);
  if (!Number.isFinite(receivedAt)) return 'Unknown age';
  const ageMs = Math.max(0, now - receivedAt);
  if (ageMs < MS_PER_SECOND) return 'Live now';
  return `${(ageMs / MS_PER_SECOND).toFixed(1)}s ago`;
}

export function formatRelativeTimestamp(value: string | null): string {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `Today, ${time}`;
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

export function calibrationPreview(
  raw: number | null | undefined,
  calibration: BreathalyzerCalibration,
): { rsOhms: number | null; mgPerL: number | null; bacGdl: number | null } {
  if (raw === null || raw === undefined || !Number.isFinite(raw)) {
    return { rsOhms: null, mgPerL: null, bacGdl: null };
  }
  const rsOhms = rawToRs(raw, calibration);
  const mgPerL = rawToMgPerL(raw, calibration);
  const bacGdl = rawToBacGdl(raw, calibration);
  return { rsOhms, mgPerL, bacGdl };
}

export function targetRawForBac(bacGdl: number, calibration: BreathalyzerCalibration): number {
  return bacGdlToRaw(bacGdl, calibration);
}

export function summarizeDeviceHistory(
  records: LocalTestRecord[],
  now = new Date(),
): DeviceHistorySummary {
  const deviceRecords = records.filter(
    (record) => record.deviceTransport || record.deviceSerial || record.deviceCapturedAt,
  );

  const transportMap = new Map<string, { count: number; lastCapturedAt: string | null }>();
  const serialMap = new Map<
    string,
    { count: number; lastCapturedAt: string | null; peakTotal: number; peakCount: number }
  >();

  for (const record of deviceRecords) {
    const capturedAt = record.deviceCapturedAt ?? record.createdAt;
    const transport = record.deviceTransport || 'unknown';
    const transportEntry = transportMap.get(transport) ?? { count: 0, lastCapturedAt: null };
    transportEntry.count += 1;
    if (!transportEntry.lastCapturedAt || capturedAt > transportEntry.lastCapturedAt) {
      transportEntry.lastCapturedAt = capturedAt;
    }
    transportMap.set(transport, transportEntry);

    const serial = record.deviceSerial || 'Unreported serial';
    const serialEntry = serialMap.get(serial) ?? {
      count: 0,
      lastCapturedAt: null,
      peakTotal: 0,
      peakCount: 0
    };
    serialEntry.count += 1;
    if (!serialEntry.lastCapturedAt || capturedAt > serialEntry.lastCapturedAt) {
      serialEntry.lastCapturedAt = capturedAt;
    }
    if (typeof record.deviceSessionPeakRaw === 'number' && Number.isFinite(record.deviceSessionPeakRaw)) {
      serialEntry.peakTotal += record.deviceSessionPeakRaw;
      serialEntry.peakCount += 1;
    }
    serialMap.set(serial, serialEntry);
  }

  const lastDeviceCapturedAt = deviceRecords.reduce<string | null>((latest, record) => {
    const capturedAt = record.deviceCapturedAt ?? record.createdAt;
    return !latest || capturedAt > latest ? capturedAt : latest;
  }, null);

  void now;

  return {
    totalLocalRecords: records.length,
    pendingLocalRecords: records.filter((record) => record.syncStatus === 'pending_sync').length,
    failedLocalRecords: records.filter((record) => record.syncStatus === 'failed').length,
    deviceCapturedRecords: deviceRecords.length,
    lastDeviceCapturedAt,
    byTransport: Array.from(transportMap.entries())
      .map(([transport, entry]) => ({ transport, ...entry }))
      .sort((left, right) => right.count - left.count),
    bySerial: Array.from(serialMap.entries())
      .map(([serial, entry]) => ({
        serial,
        count: entry.count,
        lastCapturedAt: entry.lastCapturedAt,
        averageSessionPeakRaw:
          entry.peakCount > 0 ? Math.round(entry.peakTotal / entry.peakCount) : null
      }))
      .sort((left, right) => right.count - left.count)
  };
}

export function buildCaptureReadiness(
  snapshot: BreathalyzerSnapshot,
  now = Date.now(),
): ReadinessCheck[] {
  const connected = snapshot.connection === 'connected';
  const fresh = isBreathalyzerReadingFresh(snapshot.lastReceivedAt, now);
  const receivedSample = snapshot.readings > 0 && snapshot.avg !== null;
  const warmupComplete = connected && !snapshot.warm;
  const sessionPeakReady = snapshot.sessionPeak !== null;

  return [
    {
      key: 'connection',
      label: 'Device connection',
      detail: connected ? snapshot.transportLabel ?? 'Connected' : 'Connect an HC-06 or simulated device.',
      ok: connected,
      tone: connected ? 'success' : snapshot.connection === 'error' ? 'error' : 'neutral'
    },
    {
      key: 'stream',
      label: 'Live telemetry stream',
      detail: fresh ? 'The latest sample is within the freshness window.' : 'Waiting for a fresh device sample.',
      ok: fresh,
      tone: fresh ? 'success' : connected ? 'warning' : 'neutral'
    },
    {
      key: 'warmup',
      label: 'Sensor warm-up',
      detail: warmupComplete ? 'Warm-up complete.' : 'Wait for the MQ-3 warm-up flag to clear.',
      ok: warmupComplete,
      tone: warmupComplete ? 'success' : connected ? 'warning' : 'neutral'
    },
    {
      key: 'sample',
      label: 'Breath sample',
      detail: receivedSample ? `${snapshot.readings} sample${snapshot.readings === 1 ? '' : 's'} received.` : 'Blow steadily into the sensor to create a sample.',
      ok: receivedSample,
      tone: receivedSample ? 'success' : connected ? 'warning' : 'neutral'
    },
    {
      key: 'peak',
      label: 'Session peak',
      detail: sessionPeakReady ? `Peak raw ${formatRawValue(snapshot.sessionPeak)}.` : 'The first non-warm sample becomes the session peak.',
      ok: sessionPeakReady,
      tone: sessionPeakReady ? 'success' : connected ? 'warning' : 'neutral'
    }
  ];
}

export function calibrationHistoryLabel(entry: CalibrationHistoryEntry): string {
  if (entry.source === 'clean-air') return 'Clean-air baseline';
  if (entry.source === 'reset') return 'Restored defaults';
  return 'Manual profile';
}

export function transportKindLabel(kind: string | null): string {
  if (kind === 'bluetooth_classic') return 'Bluetooth Classic (SPP)';
  if (kind === 'ble') return 'Bluetooth Low Energy';
  if (kind === 'simulated') return 'Simulated MQ-3';
  return kind ?? 'None';
}

export function buildDeviceDiagnosticReport(input: DeviceDiagnosticReportInput): string {
  const { snapshot, preferences, history } = input;
  const readiness = buildCaptureReadiness(snapshot);
  const lines = [
    'IntegriScan breathalyzer diagnostic report',
    `Generated: ${new Date().toISOString()}`,
    `Platform: ${input.platformLabel}`,
    '',
    'Connection',
    `Status: ${snapshot.connection}`,
    `Transport: ${snapshot.transportLabel ?? 'None'}`,
    `Transport kind: ${transportKindLabel(snapshot.transportKind)} (${snapshot.transportKind ?? 'none'})`,
    `Device serial: ${snapshot.deviceSerial ?? 'Not reported'}`,
    `Preferred address: ${preferences.preferredDeviceAddress ?? 'None'}`,
    `Preferred name: ${preferences.preferredDeviceName ?? 'None'}`,
    `Auto-connect: ${preferences.autoConnectPreferredDevice ? 'On' : 'Off'}`,
    '',
    'Live telemetry',
    `Raw ADC: ${formatRawValue(snapshot.raw)}`,
    `Smoothed average: ${formatRawValue(snapshot.avg)}`,
    `Device peak: ${formatRawValue(snapshot.devicePeak)}`,
    `Session peak: ${formatRawValue(snapshot.sessionPeak)}`,
    `Live BAC: ${formatBacGdl(snapshot.liveBacGdl)} g/100ml`,
    `Peak BAC: ${formatBacGdl(snapshot.peakBacGdl)} g/100ml`,
    `Samples received: ${snapshot.readings}`,
    `Warm-up: ${snapshot.warm ? 'Active' : 'Complete'}`,
    `Threshold flag: ${snapshot.over ? 'Over' : 'Normal'}`,
    `Alarm: ${snapshot.alarm ? 'Active' : 'Clear'}`,
    '',
    'Calibration',
    `Version: ${snapshot.calibration.version}`,
    `Load resistance: ${formatResistance(snapshot.calibration.loadResistorOhms)}`,
    `Clean-air resistance: ${formatResistance(snapshot.calibration.cleanAirResistanceOhms)}`,
    `mg/L at ratio 1: ${snapshot.calibration.mgPerLAtRatioOne}`,
    `Curve slope: ${snapshot.calibration.curveSlope}`,
    `Clean-air ratio: ${snapshot.calibration.cleanAirRatio}`,
    '',
    'Capture readiness',
    ...readiness.map((check) => `${check.ok ? 'PASS' : 'WAIT'} — ${check.label}: ${check.detail}`),
    '',
    'Local custody history',
    `Local records: ${history.totalLocalRecords}`,
    `Device-captured records: ${history.deviceCapturedRecords}`,
    `Pending sync: ${history.pendingLocalRecords}`,
    `Failed sync: ${history.failedLocalRecords}`,
    `Last device capture: ${formatRelativeTimestamp(history.lastDeviceCapturedAt)}`,
    ...history.bySerial.map(
      (item) =>
        `Serial ${item.serial}: ${item.count} capture${item.count === 1 ? '' : 's'}, last ${formatRelativeTimestamp(item.lastCapturedAt)}`,
    )
  ];

  if (input.runtimeBacLimits?.length) {
    lines.push('', 'Policy limits');
    for (const limit of input.runtimeBacLimits) {
      lines.push(`${limit.label}: ${limit.limitG100ml.toFixed(3)} g/100ml`);
    }
  }

  if (input.pairedDevice) {
    lines.push(
      '',
      'Paired Bluetooth device',
      `Name: ${input.pairedDevice.name}`,
      `Address: ${input.pairedDevice.address}`,
      `Type: ${input.pairedDevice.type}`,
      `Bonded: ${input.pairedDevice.bonded ? 'Yes' : 'No'}`,
    );
  }

  lines.push(
    '',
    'Firmware note',
    'The current MQ-3/HC-06 firmware emits one-way telemetry and does not accept remote configuration commands. Alarm threshold, warm-up timing, buzzer behaviour, and the firmware serial remain firmware-controlled.'
  );

  return lines.join('\n');
}

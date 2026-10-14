import type { LocalTestRecord } from '../db/repository';
import type {
  BreathalyzerDevicePreferences,
  CalibrationHistoryEntry
} from '../services/breathalyzerDeviceStorage';
import {
  BREATHALYZER_WARMUP_MS,
  formatBacGdl,
  isBreathalyzerReadingFresh,
  bacGdlToRaw,
  rawToBacGdl,
  rawToMgPerL,
  rawToRs,
  type BreathalyzerCalibration,
  type BreathalyzerFault,
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

export type DeviceStatusTone = 'success' | 'warning' | 'danger' | 'neutral';

export interface DeviceStatusSummary {
  label: string;
  tone: DeviceStatusTone;
  detail: string;
}

/** True when the firmware reports a hardware fault code other than `ok`. */
export function hasSensorFault(snapshot: BreathalyzerSnapshot): boolean {
  // `fault` is null (or absent on legacy firmware lines) when the device never
  // reported one, so only an actual code that is not `ok` counts as a fault.
  const { fault } = snapshot;
  return typeof fault === 'string' && fault !== 'ok';
}

/**
 * Presentation-friendly device status. A connected socket that has not yet
 * delivered a sample is *not* the same state as a sensor that is still warming
 * up, and neither is a firmware-reported hardware fault.
 */
export function statusFromSnapshot(snapshot: BreathalyzerSnapshot): DeviceStatusSummary {
  if (snapshot.connection === 'connecting') {
    return {
      label: 'Connecting',
      tone: 'warning',
      detail: 'Opening the Bluetooth connection to the breathalyser…'
    };
  }
  if (snapshot.connection === 'connected') {
    if (hasSensorFault(snapshot)) {
      return {
        label: 'Sensor fault',
        tone: 'danger',
        detail: sensorFaultMessage(snapshot.fault)
      };
    }
    if (snapshot.readings === 0) {
      return {
        label: 'Waiting for data',
        tone: 'warning',
        detail:
          'Connected, but no readings have arrived yet. Check the breathalyser is switched on and in range.'
      };
    }
    if (snapshot.warm === true) {
      const seconds = warmupSecondsRemaining(snapshot);
      return {
        label: 'Warming up',
        tone: 'warning',
        detail:
          seconds === null
            ? 'Sensor warming up. Readings are not reliable until it finishes.'
            : `Sensor warming up, about ${seconds} s left. Readings are not reliable until it finishes.`
      };
    }
    if (snapshot.sampleStable === false) {
      return {
        label: 'Settling',
        tone: 'warning',
        detail: 'The signal is still settling. Keep the sensor still and in clean air.'
      };
    }
    return {
      label: 'Ready',
      tone: 'success',
      detail: `Connected to ${snapshot.transportLabel ?? 'the breathalyser'}. Warm-up finished and the signal is steady.`
    };
  }
  if (snapshot.connection === 'error') {
    return {
      label: 'Connection problem',
      tone: 'danger',
      detail: snapshot.error ?? 'Reconnect the breathalyser and try again.'
    };
  }
  return {
    label: 'Not connected',
    tone: 'neutral',
    detail: 'Connect a breathalyser to start live readings.'
  };
}

/**
 * Seconds of firmware warm-up still to run, or null when nothing is counting
 * down. The firmware clears its own `warm` flag after `BREATHALYZER_WARMUP_MS`,
 * so the remaining budget is measured from the reported device uptime.
 */
export function warmupSecondsRemaining(snapshot: BreathalyzerSnapshot): number | null {
  if (snapshot.warm !== true) return null;
  const uptimeMs = snapshot.uptimeMs;
  if (typeof uptimeMs !== 'number' || !Number.isFinite(uptimeMs)) return null;
  if (uptimeMs >= BREATHALYZER_WARMUP_MS) return null;
  const remaining = Math.ceil((BREATHALYZER_WARMUP_MS - uptimeMs) / 1_000);
  return remaining > 0 ? remaining : null;
}

/** Plain-language explanation for a firmware fault code. */
export function sensorFaultMessage(fault: BreathalyzerFault | null | undefined): string {
  switch (fault) {
    case 'short':
      return 'The sensor reads zero. Check the sensor wiring to A0 and GND.';
    case 'rail':
      return 'The sensor reads at its maximum. Check the sensor wiring and supply.';
    case 'vcc':
      return 'The supply voltage is outside the safe range. Check the 5 V power supply.';
    case 'stuck':
      return 'The sensor value is not changing. Check the sensor and its wiring.';
    default:
      // `ok`, absent (legacy firmware), or not reported at all.
      return 'No sensor fault.';
  }
}

/** True once a clean-air baseline has been captured on this phone. */
export function isBaselineSet(calibration: BreathalyzerCalibration): boolean {
  return calibration.version.includes('+clean-air');
}

/** Console tab a piece of setup guidance lives behind. */
export type ConsoleTab = 'connect' | 'calibrate' | 'live';

export type SetupStepKey = 'connect' | 'warmup' | 'sensor' | 'baseline';

export type SetupStepState = 'done' | 'current' | 'waiting' | 'attention' | 'optional';

export interface SetupStep {
  key: SetupStepKey;
  label: string;
  state: SetupStepState;
  detail: string;
  tab: ConsoleTab;
}

/**
 * The four setup steps shown in the console's connect sequence, in the order
 * the officer has to satisfy them.
 */
export function buildSetupSteps(snapshot: BreathalyzerSnapshot): SetupStep[] {
  const connected = snapshot.connection === 'connected';
  const hasReadings = snapshot.readings > 0;
  const transport = snapshot.transportLabel ?? 'the breathalyser';
  const seconds = warmupSecondsRemaining(snapshot);

  const streaming = connected && hasReadings;
  const connectState: SetupStepState = streaming
    ? 'done'
    : snapshot.connection === 'error'
      ? 'attention'
      : 'current';
  const connectDetail = streaming
    ? `Receiving readings from ${transport}`
    : snapshot.connection === 'error'
      ? snapshot.error ?? 'Connection problem. Tap to reconnect.'
      : snapshot.connection === 'connecting'
        ? 'Connecting…'
        : connected
          ? 'Connected. Waiting for the first reading.'
          : 'Not connected. Tap to connect.';

  const warmupState: SetupStepState = !streaming
    ? 'waiting'
    : snapshot.warm === true
      ? 'current'
      : 'done';
  const warmupDetail = !streaming
    ? 'Starts once the breathalyser is connected.'
    : snapshot.warm === true
      ? seconds === null
        ? 'Warming up.'
        : `Warming up, ${seconds} s left.`
      : 'Warm-up finished.';

  const sensorState: SetupStepState = !streaming
    ? 'waiting'
    : snapshot.warm === true
      ? 'waiting'
      : hasSensorFault(snapshot)
        ? 'attention'
        : snapshot.sampleStable === false
          ? 'current'
          : 'done';
  const sensorDetail = !streaming
    ? 'Checked once readings arrive.'
    : snapshot.warm === true
      ? 'Checked after warm-up.'
      : hasSensorFault(snapshot)
        ? sensorFaultMessage(snapshot.fault)
        : snapshot.sampleStable === false
          ? 'Signal settling. Keep the sensor still in clean air.'
          : 'Sensor healthy and signal steady.';

  const baselineSet = isBaselineSet(snapshot.calibration);

  return [
    {
      key: 'connect',
      label: 'Connect',
      state: connectState,
      detail: connectDetail,
      tab: 'connect'
    },
    {
      key: 'warmup',
      label: 'Warm up',
      state: warmupState,
      detail: warmupDetail,
      tab: 'live'
    },
    {
      key: 'sensor',
      label: 'Sensor',
      state: sensorState,
      detail: sensorDetail,
      tab: 'live'
    },
    {
      key: 'baseline',
      label: 'Baseline',
      state: baselineSet ? 'done' : 'optional',
      detail: baselineSet
        ? 'Clean-air baseline set on this phone.'
        : 'Recommended. Using factory defaults until you set a clean-air baseline.',
      tab: 'calibrate'
    }
  ];
}

/**
 * Why calibration is blocked right now, or null when it is allowed. Mirrors the
 * guards in `BreathalyzerSession.calibrateFromCleanAir()` so the button is
 * disabled for exactly the reasons the session itself would refuse.
 */
export function calibrationBlockReason(
  snapshot: BreathalyzerSnapshot,
  options: { locked: boolean },
): string | null {
  if (options.locked) return 'Locked while a roadside test is active.';
  if (snapshot.connection !== 'connected') return 'Connect the breathalyser first.';
  if (snapshot.readings === 0) return 'Waiting for the first reading.';
  if (snapshot.warm === true) {
    const seconds = warmupSecondsRemaining(snapshot);
    return seconds === null
      ? 'Warming up. Wait for the sensor to finish.'
      : `Warming up. Wait for the sensor to finish. About ${seconds} s left.`;
  }
  if (hasSensorFault(snapshot)) return 'Fix the sensor fault before setting a baseline.';
  if (snapshot.sampleStable === false) {
    return 'The signal is still settling. Keep the sensor still in clean air.';
  }
  if (snapshot.over === true || snapshot.alarm === true) {
    return 'Move the sensor away from alcohol vapour and wait for the reading to fall.';
  }
  return null;
}

/** Roadside copy for the current firmware blow state. */
export function blowStateGuidance(snapshot: BreathalyzerSnapshot): {
  title: string;
  detail: string;
  tone: DeviceStatusTone;
} {
  if (snapshot.connection !== 'connected') {
    return {
      title: 'No breathalyser connected',
      detail: 'Connect a breathalyser to start live readings.',
      tone: 'neutral'
    };
  }

  switch (snapshot.blowState) {
    case 'warming':
      return {
        title: 'Warming up',
        detail: 'Wait for the sensor to finish warming up.',
        tone: 'warning'
      };
    case 'blowing':
      return {
        title: 'Breath detected',
        detail: 'Keep the breath going until the reading levels off.',
        tone: 'success'
      };
    case 'peak_ready':
      return {
        title: 'Peak reached',
        detail: 'Capture when the reading holds steady.',
        tone: 'success'
      };
    case 'fault':
      return {
        title: 'Sensor fault',
        detail: sensorFaultMessage(snapshot.fault),
        tone: 'danger'
      };
    case 'idle':
      return {
        title: 'Ready for a breath sample',
        detail: 'Ask the subject to blow steadily into the mouthpiece.',
        tone: 'success'
      };
    default:
      return {
        title: 'Ready for a breath sample',
        detail: 'Ask the subject to blow steadily into the mouthpiece.',
        tone: 'success'
      };
  }
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
  const sensorFaulted = hasSensorFault(snapshot);
  const sampleSettled = snapshot.sampleStable !== false;
  const sensorReady = connected && !sensorFaulted && sampleSettled;
  const secondsLeft = warmupSecondsRemaining(snapshot);

  return [
    {
      key: 'connection',
      label: 'Breathalyser connected',
      detail: connected
        ? snapshot.transportLabel ?? 'the breathalyser'
        : 'Connect a breathalyser first.',
      ok: connected,
      tone: connected ? 'success' : snapshot.connection === 'error' ? 'error' : 'neutral'
    },
    {
      key: 'stream',
      label: 'Live data',
      detail: fresh
        ? 'Receiving readings.'
        : 'No recent readings yet. Waiting for the next one.',
      ok: fresh,
      tone: fresh ? 'success' : connected ? 'warning' : 'neutral'
    },
    {
      key: 'warmup',
      label: 'Sensor warmed up',
      detail: warmupComplete
        ? 'Warm-up finished.'
        : secondsLeft === null
          ? 'Wait for warm-up to finish.'
          : `About ${secondsLeft} s left.`,
      ok: warmupComplete,
      tone: warmupComplete ? 'success' : connected ? 'warning' : 'neutral'
    },
    {
      key: 'sensor',
      label: 'Sensor healthy',
      detail: !connected
        ? 'Checked once the breathalyser is connected.'
        : sensorFaulted
          ? sensorFaultMessage(snapshot.fault)
          : !sampleSettled
            ? 'The signal is still settling. Keep the sensor still in clean air.'
            : 'No sensor fault and the signal is steady.',
      ok: sensorReady,
      tone: sensorReady ? 'success' : sensorFaulted ? 'error' : connected ? 'warning' : 'neutral'
    },
    {
      key: 'sample',
      label: 'Breath sample received',
      detail: receivedSample
        ? `${snapshot.readings} sample(s) received.`
        : 'Ask the subject to blow steadily to create a sample.',
      ok: receivedSample,
      tone: receivedSample ? 'success' : connected ? 'warning' : 'neutral'
    },
    {
      key: 'peak',
      label: 'Subject peak recorded',
      detail: sessionPeakReady
        ? `Peak reading ${Math.round(snapshot.sessionPeak as number)}.`
        : 'The first reading after warm-up sets the subject peak.',
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
  const hardwareLines: string[] = [];
  const { vccMv, spread, seq, droppedFrames, deviceAddress } = snapshot;

  if (typeof snapshot.fault === 'string') {
    hardwareLines.push(`Sensor fault: ${snapshot.fault === 'ok' ? 'None reported' : snapshot.fault}`);
  }
  if (typeof snapshot.sampleStable === 'boolean') {
    hardwareLines.push(`Sample stable: ${snapshot.sampleStable ? 'Yes' : 'Settling'}`);
  }
  if (vccMv !== null && vccMv !== undefined && Number.isFinite(vccMv)) {
    hardwareLines.push(`Rail voltage: ${(vccMv / 1000).toFixed(3)} V (${vccMv} mV)`);
  }
  if (spread !== null && spread !== undefined && Number.isFinite(spread)) {
    hardwareLines.push(`Signal spread: ${Math.round(spread)} ADC counts`);
  }
  if (seq !== null && seq !== undefined && Number.isFinite(seq)) {
    hardwareLines.push(`Frame sequence: ${seq}`);
  }
  if (droppedFrames !== null && droppedFrames !== undefined && Number.isFinite(droppedFrames)) {
    hardwareLines.push(`Dropped frames: ${droppedFrames}`);
  }
  if (deviceAddress) {
    hardwareLines.push(`Device address: ${deviceAddress}`);
  }

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
    ...hardwareLines,
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
    'Screening estimate',
    'The readiness checks only confirm that the device stream is healthy. They do not validate the measurement against a reference, so treat a captured reading as a screening estimate, not a certified result.',
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

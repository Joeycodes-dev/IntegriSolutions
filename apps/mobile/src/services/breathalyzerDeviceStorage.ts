import * as SecureStore from 'expo-secure-store';

import { generateId } from '../lib/id';
import {
  type BreathalyzerCalibration
} from './breathalyzer';

const DEVICE_PREFERENCES_KEY = 'integriscan.breathalyzer.devicePreferences';
const CALIBRATION_HISTORY_KEY = 'integriscan.breathalyzer.calibrationHistory';
const MAX_CALIBRATION_HISTORY_ENTRIES = 20;

export interface BreathalyzerDevicePreferences {
  version: 1;
  preferredDeviceAddress: string | null;
  preferredDeviceName: string | null;
  autoConnectPreferredDevice: boolean;
  confirmBeforeDisconnect: boolean;
}

export const DEFAULT_BREATHALYZER_DEVICE_PREFERENCES: BreathalyzerDevicePreferences = {
  version: 1,
  preferredDeviceAddress: null,
  preferredDeviceName: null,
  autoConnectPreferredDevice: false,
  confirmBeforeDisconnect: true
};

export type CalibrationChangeSource = 'clean-air' | 'manual' | 'reset';

export interface CalibrationHistoryEntry {
  id: string;
  recordedAt: string;
  source: CalibrationChangeSource;
  rawSample: number | null;
  previousCleanAirResistanceOhms: number | null;
  calibration: BreathalyzerCalibration;
}

function isCalibration(value: unknown): value is BreathalyzerCalibration {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  const numbers = [
    'loadResistorOhms',
    'cleanAirResistanceOhms',
    'mgPerLAtRatioOne',
    'curveSlope',
    'cleanAirRatio'
  ];
  return (
    typeof record.version === 'string' &&
    record.version.trim().length > 0 &&
    numbers.every((key) => typeof record[key] === 'number' && Number.isFinite(record[key])) &&
    (record.loadResistorOhms as number) > 0 &&
    (record.cleanAirResistanceOhms as number) > 0 &&
    (record.mgPerLAtRatioOne as number) > 0 &&
    (record.curveSlope as number) !== 0 &&
    (record.cleanAirRatio as number) > 0
  );
}

function isPreferences(value: unknown): value is BreathalyzerDevicePreferences {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.version === 1 &&
    (record.preferredDeviceAddress === null || typeof record.preferredDeviceAddress === 'string') &&
    (record.preferredDeviceName === null || typeof record.preferredDeviceName === 'string') &&
    typeof record.autoConnectPreferredDevice === 'boolean' &&
    typeof record.confirmBeforeDisconnect === 'boolean'
  );
}

function isCalibrationHistoryEntry(value: unknown): value is CalibrationHistoryEntry {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.recordedAt === 'string' &&
    (record.source === 'clean-air' || record.source === 'manual' || record.source === 'reset') &&
    (record.rawSample === null || (typeof record.rawSample === 'number' && Number.isFinite(record.rawSample))) &&
    (record.previousCleanAirResistanceOhms === null ||
      (typeof record.previousCleanAirResistanceOhms === 'number' &&
        Number.isFinite(record.previousCleanAirResistanceOhms))) &&
    isCalibration(record.calibration)
  );
}

export async function loadDevicePreferences(): Promise<BreathalyzerDevicePreferences> {
  try {
    const raw = await SecureStore.getItemAsync(DEVICE_PREFERENCES_KEY);
    if (!raw) return DEFAULT_BREATHALYZER_DEVICE_PREFERENCES;
    const parsed: unknown = JSON.parse(raw);
    return isPreferences(parsed) ? parsed : DEFAULT_BREATHALYZER_DEVICE_PREFERENCES;
  } catch {
    return DEFAULT_BREATHALYZER_DEVICE_PREFERENCES;
  }
}

export async function saveDevicePreferences(
  preferences: BreathalyzerDevicePreferences,
): Promise<void> {
  try {
    await SecureStore.setItemAsync(DEVICE_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Preferences are best-effort; the in-memory value still applies for the session.
  }
}

export async function rememberPreferredDevice(device: {
  address: string;
  name: string;
}): Promise<void> {
  const current = await loadDevicePreferences();
  await saveDevicePreferences({
    ...current,
    preferredDeviceAddress: device.address.trim() || null,
    preferredDeviceName: device.name.trim() || null
  });
}

export async function forgetPreferredDevice(): Promise<void> {
  const current = await loadDevicePreferences();
  await saveDevicePreferences({
    ...current,
    preferredDeviceAddress: null,
    preferredDeviceName: null
  });
}

export async function clearDevicePreferences(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(DEVICE_PREFERENCES_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export async function loadCalibrationHistory(): Promise<CalibrationHistoryEntry[]> {
  try {
    const raw = await SecureStore.getItemAsync(CALIBRATION_HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCalibrationHistoryEntry);
  } catch {
    return [];
  }
}

export async function recordCalibrationChange(params: {
  source: CalibrationChangeSource;
  calibration: BreathalyzerCalibration;
  previousCleanAirResistanceOhms: number | null;
  rawSample?: number | null;
}): Promise<CalibrationHistoryEntry[]> {
  const history = await loadCalibrationHistory();
  const entry: CalibrationHistoryEntry = {
    id: generateId(),
    recordedAt: new Date().toISOString(),
    source: params.source,
    rawSample: params.rawSample ?? null,
    previousCleanAirResistanceOhms: params.previousCleanAirResistanceOhms,
    calibration: params.calibration
  };
  const next = [entry, ...history].slice(0, MAX_CALIBRATION_HISTORY_ENTRIES);
  try {
    await SecureStore.setItemAsync(CALIBRATION_HISTORY_KEY, JSON.stringify(next));
  } catch {
    // History persistence is best-effort; the live calibration still applies.
  }
  return next;
}

export async function clearCalibrationHistory(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(CALIBRATION_HISTORY_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export async function clearBreathalyzerDeviceData(): Promise<void> {
  await Promise.all([clearDevicePreferences(), clearCalibrationHistory()]);
}

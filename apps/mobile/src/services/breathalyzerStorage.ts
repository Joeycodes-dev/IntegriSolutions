import * as SecureStore from 'expo-secure-store';
import {
  DEFAULT_BREATHALYZER_CALIBRATION,
  type BreathalyzerCalibration
} from './breathalyzer';

const CALIBRATION_KEY = 'integriscan.breathalyzer.calibration';

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
    numbers.every((key) => typeof record[key] === 'number' && Number.isFinite(record[key])) &&
    (record.loadResistorOhms as number) > 0 &&
    (record.cleanAirResistanceOhms as number) > 0 &&
    (record.cleanAirRatio as number) > 0
  );
}

export async function loadCalibration(): Promise<BreathalyzerCalibration> {
  try {
    const raw = await SecureStore.getItemAsync(CALIBRATION_KEY);
    if (!raw) return DEFAULT_BREATHALYZER_CALIBRATION;
    const parsed: unknown = JSON.parse(raw);
    return isCalibration(parsed) ? parsed : DEFAULT_BREATHALYZER_CALIBRATION;
  } catch {
    return DEFAULT_BREATHALYZER_CALIBRATION;
  }
}

export async function saveCalibration(calibration: BreathalyzerCalibration): Promise<void> {
  try {
    await SecureStore.setItemAsync(CALIBRATION_KEY, JSON.stringify(calibration));
  } catch {
    // Calibration persistence is best-effort; the in-memory value still applies.
  }
}

export async function clearCalibration(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(CALIBRATION_KEY);
  } catch {
    // Ignore storage failures.
  }
}

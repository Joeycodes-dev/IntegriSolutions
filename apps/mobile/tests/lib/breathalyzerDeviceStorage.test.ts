import * as SecureStore from 'expo-secure-store';

import {
  DEFAULT_BREATHALYZER_DEVICE_PREFERENCES,
  clearBreathalyzerDeviceData,
  clearCalibrationHistory,
  clearDevicePreferences,
  forgetPreferredDevice,
  loadCalibrationHistory,
  loadDevicePreferences,
  recordCalibrationChange,
  rememberPreferredDevice,
  saveDevicePreferences
} from '../../src/services/breathalyzerDeviceStorage';
import { DEFAULT_BREATHALYZER_CALIBRATION } from '../../src/services/breathalyzer';

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn()
}));

const PREFERENCES_KEY = 'integriscan.breathalyzer.devicePreferences';
const HISTORY_KEY = 'integriscan.breathalyzer.calibrationHistory';

describe('breathalyzerDeviceStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
    (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);
  });

  it('returns safe defaults when preferences are missing or invalid', async () => {
    expect(await loadDevicePreferences()).toEqual(DEFAULT_BREATHALYZER_DEVICE_PREFERENCES);

    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify({ version: 2 }));
    expect(await loadDevicePreferences()).toEqual(DEFAULT_BREATHALYZER_DEVICE_PREFERENCES);
  });

  it('round-trips preferences and remembers the preferred HC-06', async () => {
    const next = {
      ...DEFAULT_BREATHALYZER_DEVICE_PREFERENCES,
      autoConnectPreferredDevice: true,
      confirmBeforeDisconnect: false
    };
    await saveDevicePreferences(next);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(PREFERENCES_KEY, JSON.stringify(next));

    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(next));
    await rememberPreferredDevice({ address: 'AA:BB:CC:DD:EE:FF', name: 'HC-06' });

    const saved = JSON.parse((SecureStore.setItemAsync as jest.Mock).mock.calls.at(-1)?.[1] ?? '{}');
    expect(saved).toMatchObject({
      autoConnectPreferredDevice: true,
      confirmBeforeDisconnect: false,
      preferredDeviceAddress: 'AA:BB:CC:DD:EE:FF',
      preferredDeviceName: 'HC-06'
    });
  });

  it('clears the preferred device while preserving toggles', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(
      JSON.stringify({
        ...DEFAULT_BREATHALYZER_DEVICE_PREFERENCES,
        preferredDeviceAddress: 'AA:BB:CC:DD:EE:FF',
        preferredDeviceName: 'HC-06',
        autoConnectPreferredDevice: true
      }),
    );

    await forgetPreferredDevice();

    const saved = JSON.parse((SecureStore.setItemAsync as jest.Mock).mock.calls.at(-1)?.[1] ?? '{}');
    expect(saved.preferredDeviceAddress).toBeNull();
    expect(saved.preferredDeviceName).toBeNull();
    expect(saved.autoConnectPreferredDevice).toBe(true);
  });

  it('records calibration changes with the newest entry first and caps the history', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (key: string) => {
      if (key !== HISTORY_KEY) return null;
      return JSON.stringify(
        Array.from({ length: 20 }, (_, index) => ({
          id: `old-${index}`,
          recordedAt: '2026-09-20T00:00:00.000Z',
          source: 'manual',
          rawSample: null,
          previousCleanAirResistanceOhms: 7000,
          calibration: DEFAULT_BREATHALYZER_CALIBRATION
        })),
      );
    });

    const history = await recordCalibrationChange({
      source: 'clean-air',
      calibration: {
        ...DEFAULT_BREATHALYZER_CALIBRATION,
        version: 'mq3-default-v1+clean-air',
        cleanAirResistanceOhms: 7200
      },
      previousCleanAirResistanceOhms: 7532,
      rawSample: 123
    });

    expect(history).toHaveLength(20);
    expect(history[0]).toMatchObject({
      source: 'clean-air',
      rawSample: 123,
      previousCleanAirResistanceOhms: 7532
    });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(HISTORY_KEY, JSON.stringify(history));
  });

  it('filters malformed calibration history entries', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(
      JSON.stringify([
        {
          id: 'valid',
          recordedAt: '2026-09-20T00:00:00.000Z',
          source: 'reset',
          rawSample: null,
          previousCleanAirResistanceOhms: null,
          calibration: DEFAULT_BREATHALYZER_CALIBRATION
        },
        { id: 'invalid', source: 'unknown' }
      ]),
    );

    const history = await loadCalibrationHistory();
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe('valid');
  });

  it('clears both device preferences and calibration history', async () => {
    await clearBreathalyzerDeviceData();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(PREFERENCES_KEY);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(HISTORY_KEY);

    await clearDevicePreferences();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(PREFERENCES_KEY);

    await clearCalibrationHistory();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(HISTORY_KEY);
  });
});

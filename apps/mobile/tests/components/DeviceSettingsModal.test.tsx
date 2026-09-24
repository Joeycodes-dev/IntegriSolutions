import React from 'react';
import { Platform } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DeviceSettingsModal } from '../../src/components/DeviceSettingsModal';
import { styles as deviceSettingsStyles } from '../../src/components/DeviceSettingsModal.styles';
import {
  DEFAULT_BREATHALYZER_CALIBRATION,
  type BreathalyzerSnapshot
} from '../../src/services/breathalyzer';
import { DEFAULT_BREATHALYZER_DEVICE_PREFERENCES } from '../../src/services/breathalyzerDeviceStorage';

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, null, children),
    SafeAreaView: ({ children, ...props }: { children: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

jest.mock('@expo/vector-icons', () => ({
  Feather: () => null,
  MaterialCommunityIcons: () => null
}));

jest.mock('../../src/services/breathalyzerDeviceStorage', () => ({
  DEFAULT_BREATHALYZER_DEVICE_PREFERENCES: {
    version: 1,
    preferredDeviceAddress: null,
    preferredDeviceName: null,
    autoConnectPreferredDevice: false,
    confirmBeforeDisconnect: true
  },
  loadDevicePreferences: jest.fn(),
  saveDevicePreferences: jest.fn(),
  rememberPreferredDevice: jest.fn(),
  forgetPreferredDevice: jest.fn(),
  clearCalibrationHistory: jest.fn(),
  loadCalibrationHistory: jest.fn(),
  recordCalibrationChange: jest.fn()
}));

jest.mock('../../src/services/breathalyzerBluetooth', () => ({
  getPairedHc06Devices: jest.fn(),
  createHc06BluetoothTransport: jest.fn(),
  openHc06AppSettings: jest.fn(),
  openHc06BluetoothSettings: jest.fn()
}));

jest.mock('../../src/services/breathalyzerStorage', () => ({
  saveCalibration: jest.fn(),
  clearCalibration: jest.fn()
}));

jest.mock('../../src/db/repository', () => ({
  getAllTests: jest.fn()
}));

jest.mock('../../src/services/audit', () => ({
  logAuditEvent: jest.fn()
}));

const storage = jest.requireMock('../../src/services/breathalyzerDeviceStorage');
const bluetooth = jest.requireMock('../../src/services/breathalyzerBluetooth');
const repository = jest.requireMock('../../src/db/repository');

function renderConsole(props: React.ComponentProps<typeof DeviceSettingsModal>) {
  return render(
    <SafeAreaProvider>
      <DeviceSettingsModal {...props} />
    </SafeAreaProvider>,
  );
}

function makeSnapshot(overrides: Partial<BreathalyzerSnapshot> = {}): BreathalyzerSnapshot {
  return {
    connection: 'connected',
    error: null,
    transportKind: 'bluetooth_classic',
    transportLabel: 'HC-06 Classic • HC-06',
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
    readings: 12,
    lastReceivedAt: new Date().toISOString(),
    captured: null,
    calibration: DEFAULT_BREATHALYZER_CALIBRATION,
    ...overrides
  };
}

describe('DeviceSettingsModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storage.loadDevicePreferences.mockResolvedValue(DEFAULT_BREATHALYZER_DEVICE_PREFERENCES);
    storage.loadCalibrationHistory.mockResolvedValue([]);
    repository.getAllTests.mockResolvedValue([]);
    bluetooth.getPairedHc06Devices.mockResolvedValue([
      {
        id: 'AA:BB:CC:DD:EE:FF',
        address: 'AA:BB:CC:DD:EE:FF',
        name: 'HC-06',
        type: 'CLASSIC',
        bonded: true
      }
    ]);
  });

  it('opens the breathalyser console with four task-focused tabs', async () => {
    renderConsole({
      visible: true,
      onClose: jest.fn(),
      snapshot: makeSnapshot(),
      runtimeConfig: null,
      profile: null,
    });

    expect(screen.getByText('Breathalyser console')).toBeTruthy();
    expect(deviceSettingsStyles.sheet.height).toBe('94%');
    expect(screen.getByLabelText('Device settings tab')).toBeTruthy();
    expect(screen.getByLabelText('Connect settings tab')).toBeTruthy();
    expect(screen.getByLabelText('Calibrate settings tab')).toBeTruthy();
    expect(screen.getByLabelText('Activity settings tab')).toBeTruthy();

    await waitFor(() => {
      expect(storage.loadDevicePreferences).toHaveBeenCalled();
      expect(storage.loadCalibrationHistory).toHaveBeenCalled();
      expect(repository.getAllTests).toHaveBeenCalled();
    });
  });

  it('switches between connection, calibration, and activity tabs', async () => {
    renderConsole({
      visible: true,
      onClose: jest.fn(),
      snapshot: makeSnapshot(),
      runtimeConfig: null,
      profile: null,
    });

    fireEvent.press(screen.getByLabelText('Connect settings tab'));
    expect(screen.getByText('Connect an HC-06')).toBeTruthy();
    expect(screen.getByText('Pairing steps')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Calibrate settings tab'));
    expect(screen.getByText('Clean-air baseline')).toBeTruthy();
    expect(screen.getByText('Measurement profile')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Activity settings tab'));
    expect(screen.getByText('Capture readiness')).toBeTruthy();
    expect(screen.getByText('RAW ADC')).toBeTruthy();
    expect(screen.getByText('Local custody history')).toBeTruthy();
    expect(screen.getByText('By device serial')).toBeTruthy();

    await waitFor(() => {
      expect(storage.loadDevicePreferences).toHaveBeenCalled();
      expect(repository.getAllTests).toHaveBeenCalled();
    });
  });

  it('routes the disconnected-device action straight to connection setup', async () => {
    renderConsole({
      visible: true,
      onClose: jest.fn(),
      snapshot: makeSnapshot({ connection: 'idle', raw: null, avg: null, devicePeak: null, sessionPeak: null, liveBacGdl: null, peakBacGdl: null, readings: 0, lastReceivedAt: null }),
      runtimeConfig: null,
      profile: null,
    });

    fireEvent.press(screen.getByLabelText('Open the connection tab'));

    expect(screen.getByText('Connect an HC-06')).toBeTruthy();
    expect(screen.getByText('Pair a new HC-06')).toBeTruthy();

    await waitFor(() => {
      expect(storage.loadDevicePreferences).toHaveBeenCalled();
      expect(repository.getAllTests).toHaveBeenCalled();
    });
  });

  it('locks device replacement while a roadside test is active', async () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    try {
      renderConsole({
        visible: true,
        initialTab: 'connect',
        onClose: jest.fn(),
        snapshot: makeSnapshot(),
        runtimeConfig: null,
        profile: null,
        lockDeviceMutations: true,
      });

      await waitFor(() => {
        expect(screen.getByText('HC-06')).toBeTruthy();
      });
      expect(
        screen.getByText(
          'Device replacement is locked until the current roadside test is saved or cancelled.',
        ),
      ).toBeTruthy();
      expect(screen.getByText('Locked')).toBeTruthy();
    } finally {
      Object.defineProperty(Platform, 'OS', { value: originalPlatform, configurable: true });
    }
  });

  it('opens directly to paired HC-06 choices without a scan session', async () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    try {
      renderConsole({
        visible: true,
        initialTab: 'connect',
        onClose: jest.fn(),
        snapshot: makeSnapshot({ connection: 'idle', raw: null, avg: null, devicePeak: null, sessionPeak: null, liveBacGdl: null, peakBacGdl: null, readings: 0, lastReceivedAt: null }),
        runtimeConfig: null,
        profile: null,
      });

      await waitFor(() => {
        expect(bluetooth.getPairedHc06Devices).toHaveBeenCalled();
        expect(screen.getByText('HC-06')).toBeTruthy();
      });
      expect(screen.getByText('AA:BB:CC:DD:EE:FF')).toBeTruthy();
      expect(screen.getByLabelText('Connect HC-06')).toBeTruthy();
    } finally {
      Object.defineProperty(Platform, 'OS', { value: originalPlatform, configurable: true });
    }
  });
});

import React from 'react';
import { Platform } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
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

type ConsoleProps = React.ComponentProps<typeof DeviceSettingsModal>;

function consoleElement(props: ConsoleProps) {
  return (
    <SafeAreaProvider>
      <DeviceSettingsModal {...props} />
    </SafeAreaProvider>
  );
}

function renderConsole(props: ConsoleProps) {
  return render(consoleElement(props));
}

/**
 * Renders and then lets the console's visibility effect finish loading stored
 * preferences, calibration history and paired devices. Those setters run from an
 * async effect, so without this flush they land outside `act()` and React logs an
 * unwrapped-update warning for every one of them.
 */
async function renderConsoleSettled(props: ConsoleProps) {
  const result = renderConsole(props);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return result;
}

function makeSnapshot(overrides: Partial<BreathalyzerSnapshot> = {}): BreathalyzerSnapshot {
  return {
    connection: 'connected',
    error: null,
    transportKind: 'bluetooth_classic',
    transportLabel: 'HC-06 Classic • HC-06',
    connectedAt: new Date().toISOString(),
    peakReceivedAt: new Date().toISOString(),
    deviceAddress: 'AA:BB:CC:DD:EE:FF',
    sampleStable: true,
    blowState: 'peak_ready',
    vccMv: 5000,
    spread: 3,
    fault: 'ok',
    seq: 12,
    droppedFrames: 0,
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

/** Same device, but nothing has been received from it yet. */
function makeDisconnectedSnapshot(
  overrides: Partial<BreathalyzerSnapshot> = {}
): BreathalyzerSnapshot {
  return makeSnapshot({
    connection: 'idle',
    raw: null,
    avg: null,
    devicePeak: null,
    sessionPeak: null,
    liveBacGdl: null,
    peakBacGdl: null,
    readings: 0,
    lastReceivedAt: null,
    ...overrides
  });
}

/** Runs a test body with `Platform.OS` forced to android, then restores it. */
async function onAndroid(run: () => Promise<void>): Promise<void> {
  const originalPlatform = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  try {
    await run();
  } finally {
    Object.defineProperty(Platform, 'OS', { value: originalPlatform, configurable: true });
  }
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

  it('opens the breathalyser settings console with three task-focused tabs', async () => {
    renderConsole({
      visible: true,
      onClose: jest.fn(),
      snapshot: makeSnapshot(),
      runtimeConfig: null,
      profile: null,
    });

    expect(screen.getByText('Breathalyser settings')).toBeTruthy();
    expect(screen.getByText('FIELD DEVICE')).toBeTruthy();
    expect(screen.getByLabelText('Close breathalyser settings')).toBeTruthy();
    expect(deviceSettingsStyles.sheet.height).toBe('94%');
    expect(deviceSettingsStyles.overlay.justifyContent).toBe('center');
    expect(deviceSettingsStyles.statusHero.marginTop).toBe(12);
    expect(screen.getByLabelText('Connect tab')).toBeTruthy();
    expect(screen.getByLabelText('Calibrate tab')).toBeTruthy();
    expect(screen.getByLabelText('Live tab')).toBeTruthy();

    await waitFor(() => {
      expect(storage.loadDevicePreferences).toHaveBeenCalled();
      expect(storage.loadCalibrationHistory).toHaveBeenCalled();
      expect(repository.getAllTests).toHaveBeenCalled();
    });
  });

  it('switches between the Connect, Calibrate and Live tabs', async () => {
    renderConsole({
      visible: true,
      onClose: jest.fn(),
      snapshot: makeSnapshot(),
      runtimeConfig: null,
      profile: null,
    });

    fireEvent.press(screen.getByLabelText('Connect tab'));
    expect(screen.getByText('Find my breathalysers')).toBeTruthy();
    expect(screen.getByText('Pair a new breathalyser')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Calibrate tab'));
    expect(screen.getByText('Clean-air baseline')).toBeTruthy();
    expect(screen.getByText('Current baseline')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Live tab'));
    expect(screen.getByText('Live reading')).toBeTruthy();
    expect(screen.getByText('Ready for a roadside test')).toBeTruthy();

    await waitFor(() => {
      expect(storage.loadDevicePreferences).toHaveBeenCalled();
      expect(repository.getAllTests).toHaveBeenCalled();
    });
  });

  it('shows the dry-run capture result inside the Live tab', async () => {
    renderConsole({
      visible: true,
      initialTab: 'live',
      onClose: jest.fn(),
      snapshot: makeSnapshot(),
      runtimeConfig: null,
      profile: null,
    });

    fireEvent.press(screen.getByLabelText('Dry-run capture'));

    expect(screen.getByText('Dry run ready')).toBeTruthy();
    expect(screen.getByText(/No test record was created\./)).toBeTruthy();
    expect(screen.getByText(/Raw 620 converts to/)).toBeTruthy();

    await waitFor(() => {
      expect(storage.loadDevicePreferences).toHaveBeenCalled();
      expect(repository.getAllTests).toHaveBeenCalled();
    });
  });

  it('shows a dry-run capture error in place when no sample is available', async () => {
    renderConsole({
      visible: true,
      initialTab: 'live',
      onClose: jest.fn(),
      snapshot: makeSnapshot({ sessionPeak: null, avg: null }),
      runtimeConfig: null,
      profile: null,
    });

    fireEvent.press(screen.getByLabelText('Dry-run capture'));

    expect(screen.getByText('No live sample is available for a preview capture.')).toBeTruthy();

    await waitFor(() => {
      expect(storage.loadDevicePreferences).toHaveBeenCalled();
      expect(repository.getAllTests).toHaveBeenCalled();
    });
  });

  it('routes the disconnected-device action straight to connection setup', async () => {
    renderConsole({
      visible: true,
      onClose: jest.fn(),
      snapshot: makeDisconnectedSnapshot(),
      runtimeConfig: null,
      profile: null,
    });

    fireEvent.press(screen.getByLabelText('Connect a breathalyser'));

    expect(screen.getByText('Find my breathalysers')).toBeTruthy();
    expect(screen.getByText('Pair a new breathalyser')).toBeTruthy();

    await waitFor(() => {
      expect(storage.loadDevicePreferences).toHaveBeenCalled();
      expect(repository.getAllTests).toHaveBeenCalled();
    });
  });

  it('locks device changes while a roadside test is active', async () => {
    await onAndroid(async () => {
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
          'Device changes are locked until the current roadside test is saved or cancelled.',
        ),
      ).toBeTruthy();
      expect(screen.getByText('Locked during test')).toBeTruthy();
      expect(screen.getByLabelText('Connected HC-06')).toBeDisabled();
    });
  });

  it('opens directly to paired HC-06 choices without a scan session', async () => {
    await onAndroid(async () => {
      renderConsole({
        visible: true,
        initialTab: 'connect',
        onClose: jest.fn(),
        snapshot: makeDisconnectedSnapshot(),
        runtimeConfig: null,
        profile: null,
      });

      await waitFor(() => {
        expect(bluetooth.getPairedHc06Devices).toHaveBeenCalled();
        expect(screen.getByText('HC-06')).toBeTruthy();
      });
      expect(screen.getByText('AA:BB:CC:DD:EE:FF')).toBeTruthy();
      expect(screen.getByLabelText('Connect HC-06')).toBeTruthy();
    });
  });

it('opens on the Connect tab while disconnected and the Live tab once connected', async () => {
    const disconnected = await renderConsoleSettled({
      visible: true,
      onClose: jest.fn(),
      snapshot: makeDisconnectedSnapshot(),
      runtimeConfig: null,
      profile: null,
    });

    expect(screen.getByText('Find my breathalysers')).toBeTruthy();
    disconnected.unmount();

    await renderConsoleSettled({
      visible: true,
      onClose: jest.fn(),
      snapshot: makeSnapshot(),
      runtimeConfig: null,
      profile: null,
    });

    expect(screen.getByText('Live reading')).toBeTruthy();
  });

  it('offers the next setup step from the status hero', async () => {
    const disconnected = await renderConsoleSettled({
      visible: true,
      onClose: jest.fn(),
      snapshot: makeDisconnectedSnapshot(),
      runtimeConfig: null,
      profile: null,
    });

    expect(screen.getByLabelText('Connect a breathalyser')).toBeTruthy();
    disconnected.unmount();

    await renderConsoleSettled({
      visible: true,
      onClose: jest.fn(),
      snapshot: makeSnapshot({
        calibration: { ...DEFAULT_BREATHALYZER_CALIBRATION, version: 'mq3-default-v1+clean-air' }
      }),
      runtimeConfig: null,
      profile: null,
    });

    expect(screen.getByLabelText('Open live readings')).toBeTruthy();
  });

  it('shows the four setup steps and routes each one to its tab', async () => {
    await renderConsoleSettled({
      visible: true,
      onClose: jest.fn(),
      snapshot: makeSnapshot(),
      runtimeConfig: null,
      profile: null,
    });

    expect(screen.getByText('Ready for roadside testing')).toBeTruthy();
    expect(screen.getByLabelText(/^Connect: /)).toBeTruthy();
    expect(screen.getByLabelText(/^Warm up: /)).toBeTruthy();
    expect(screen.getByLabelText(/^Sensor: /)).toBeTruthy();
    expect(screen.getByLabelText(/^Baseline: /)).toBeTruthy();

    fireEvent.press(screen.getByLabelText(/^Baseline: /));

    expect(screen.getByText('Clean-air baseline')).toBeTruthy();
    expect(screen.getByText('How to set it')).toBeTruthy();
  });

  it('blocks the clean-air baseline while the sensor is still warming up', async () => {
    await renderConsoleSettled({
      visible: true,
      initialTab: 'calibrate',
      onClose: jest.fn(),
      snapshot: makeSnapshot({ warm: true, uptimeMs: 18000 }),
      runtimeConfig: null,
      profile: null,
    });

    expect(
      screen.getByText(/Warming up\. Wait for the sensor to finish\. About 42 s left\./),
    ).toBeTruthy();
    expect(screen.getByLabelText('Set clean-air baseline')).toBeDisabled();
  });

  it('keeps the advanced sensor fields hidden until they are asked for', async () => {
    await renderConsoleSettled({
      visible: true,
      initialTab: 'calibrate',
      onClose: jest.fn(),
      snapshot: makeSnapshot(),
      runtimeConfig: null,
      profile: null,
    });

    expect(screen.queryByLabelText('Load resistor (RL), ohms')).toBeNull();

    fireEvent.press(screen.getByLabelText('Show advanced settings'));

    expect(screen.getByLabelText('Load resistor (RL), ohms')).toBeTruthy();
    expect(screen.getByLabelText('Clean-air resistance (R0), ohms')).toBeTruthy();
    expect(screen.getByLabelText('Reference strength at ratio 1, mg/L')).toBeTruthy();
    expect(screen.getByLabelText('Curve slope')).toBeTruthy();
    expect(screen.getByLabelText('Clean-air ratio')).toBeTruthy();
  });

  it('describes the live signal chart as readings arrive', async () => {
    const { rerender } = await renderConsoleSettled({
      visible: true,
      onClose: jest.fn(),
      snapshot: makeSnapshot({
        raw: null,
        avg: null,
        sessionPeak: null,
        readings: 0,
        lastReceivedAt: null
      }),
      runtimeConfig: null,
      profile: null,
    });

    expect(screen.getByTestId('live-signal-chart')).toBeTruthy();
    expect(screen.getByLabelText('Live signal chart. No readings yet.')).toBeTruthy();
    expect(screen.getByText('Waiting for readings…')).toBeTruthy();

    rerender(
      consoleElement({
        visible: true,
        onClose: jest.fn(),
        snapshot: makeSnapshot({ readings: 1, avg: 300 }),
        runtimeConfig: null,
        profile: null,
      }),
    );

    expect(screen.getByLabelText(/Latest 300/)).toBeTruthy();
  });
});
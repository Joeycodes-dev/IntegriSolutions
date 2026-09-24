import React from 'react';
import { TextInput } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { BreathalyzerSnapshot } from '../../src/services/breathalyzer';

const mockDefaultBreathalyzerCalibration = {
  version: 'mq3-default-v1',
  loadResistorOhms: 1000,
  cleanAirResistanceOhms: 7532,
  mgPerLAtRatioOne: 0.45,
  curveSlope: -0.7,
  cleanAirRatio: 60,
};

const mockAuthState = {
  profile: {
    uid: 'local-test-officer',
    officerId: 23,
    email: 'officer@example.com',
    name: 'Test',
    surname: 'Officer',
    badgeNumber: 'B001',
    idNumber: '9001015800087',
    employmentStatus: 'Active',
    dutyStatus: 'On Patrol',
    province: 'Gauteng',
    region: 'Johannesburg',
    officerTypeId: 1,
    roleId: 1,
    createdAt: '2026-09-24T00:00:00.000Z',
  },
  signOut: jest.fn(),
};

jest.mock('../../src/lib/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

const mockSyncState = {
  pendingCount: 0,
  failedCount: 0,
  pendingEvidenceCount: 0,
  failedEvidenceCount: 0,
  queuedAlertCount: 0,
  syncedCount: 0,
  todayCount: 0,
  weekCount: 0,
  recentTests: [],
  isSyncing: false,
  networkStatus: 'online',
  lastSyncedAt: null,
  lastAttemptAt: null,
  lastRun: null,
  databaseError: null,
  syncNow: jest.fn(),
  retryFailed: jest.fn(),
  forceSync: jest.fn(),
  refreshCounts: jest.fn(),
};

jest.mock('../../src/lib/SyncContext', () => ({
  useSync: () => mockSyncState,
}));

jest.mock('../../src/lib/AlertsContext', () => ({
  useAlertsContext: () => ({
    alerts: [],
    refresh: jest.fn(),
    acknowledge: jest.fn(),
  }),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

jest.mock('expo-camera', () => ({
  Camera: {
    requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  },
  CameraView: ({ children, ...props }: { children?: unknown }) => {
    const ReactLocal = require('react');
    const { View: MockView } = require('react-native');
    return ReactLocal.createElement(MockView, props, children);
  },
}));

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
}));

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));

jest.mock('../../src/services/api', () => ({
  getRuntimeConfig: jest.fn().mockResolvedValue(null),
  updateDutyStatus: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/sync', () => ({
  saveLocally: jest.fn(),
  syncPendingRecords: jest.fn().mockResolvedValue({
    attempted: 0,
    synced: [],
    duplicates: [],
    failed: [],
    deferred: [],
    attachmentResults: [],
    runError: null,
  }),
}));

jest.mock('../../src/services/breathalyzerSimulator', () => ({
  createSimulatedTransport: jest.fn(() => ({})),
}));

const breathalyzerSnapshot: BreathalyzerSnapshot = {
  connection: 'idle',
  error: null,
  transportKind: null,
  transportLabel: null,
  warm: false,
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
  calibration: mockDefaultBreathalyzerCalibration,
};

const mockCapturedReading = {
  bacGdl: 0.081,
  sessionPeakRaw: 640,
  rawAtCapture: 620,
  avgAtCapture: 610,
  liveBacGdlAtCapture: 0.079,
  capturedAt: '2026-09-24T12:00:00.000Z',
  transport: 'simulated' as const,
  deviceSerial: 'TEST-DEVICE',
  calibration: mockDefaultBreathalyzerCalibration,
};

const mockBreathalyzerSession = {
  subscribe: jest.fn(() => jest.fn()),
  getSnapshot: jest.fn(() => breathalyzerSnapshot),
  getCalibration: jest.fn(() => mockDefaultBreathalyzerCalibration),
  setCalibration: jest.fn(),
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  startNewSubject: jest.fn(),
  capture: jest.fn(() => mockCapturedReading),
  expireIfStale: jest.fn(),
};

jest.mock('../../src/services/breathalyzer', () => ({
  mockDefaultBreathalyzerCalibration,
  breathalyzerSession: mockBreathalyzerSession,
  formatBacGdl: jest.fn(() => '0.000'),
  isBreathalyzerReadingFresh: jest.fn(() => true),
  toDeviceEvidence: jest.fn(() => null),
}));

jest.mock('../../src/services/breathalyzerStorage', () => ({
  loadCalibration: jest.fn().mockResolvedValue(mockDefaultBreathalyzerCalibration),
  saveCalibration: jest.fn(),
}));

jest.mock('../../src/services/shifts', () => ({
  getSelectedRoadblockShift: jest.fn().mockResolvedValue(null),
  isRoadblockShiftActive: jest.fn(() => false),
}));

jest.mock('../../src/services/scanService', () => ({
  scanDriverLicense: jest.fn(),
}));

jest.mock('../../src/services/audit', () => ({
  logAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/components/DeviceSettingsModal', () => ({
  DeviceSettingsModal: () => null,
}));

jest.mock('../../src/components/SyncCentreModal', () => ({
  SyncCentreModal: () => null,
}));

jest.mock('../../src/components/OfficerBottomNav', () => ({
  OfficerBottomNav: () => null,
}));

jest.mock('@expo/vector-icons', () => ({
  Feather: () => null,
  MaterialCommunityIcons: () => null,
  Ionicons: () => null,
}));

const navigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
} as never;

let OfficerDashboardScreen: React.ComponentType<{
  navigation: never;
  route: never;
}>;

beforeAll(() => {
  OfficerDashboardScreen = require('../../src/screens/OfficerDashboardScreen').OfficerDashboardScreen;
});

describe('OfficerDashboardScreen subject-state isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(breathalyzerSnapshot, {
      connection: 'idle',
      error: null,
      transportKind: null,
      transportLabel: null,
      warm: false,
      over: false,
      alarm: false,
      raw: null,
      avg: null,
      devicePeak: null,
      sessionPeak: null,
      liveBacGdl: null,
      peakBacGdl: null,
      readings: 0,
      lastReceivedAt: null,
    });
    mockBreathalyzerSession.capture.mockReturnValue(mockCapturedReading);
  });

  it('clears officer notes when a subject is aborted and a new subject starts', async () => {
    render(<OfficerDashboardScreen navigation={navigation} route={{ key: 'dashboard', name: 'OfficerDashboard' } as never} />);

    fireEvent.press(screen.getByText('Start New Session'));
    const firstNotes = await screen.findByPlaceholderText('Optional notes for court evidence');
    fireEvent.changeText(firstNotes, 'Notes belonging to the first subject');

    fireEvent.press(screen.getByText('Abort Session'));
    fireEvent.press(await screen.findByText('Start New Session'));

    const nextNotes = await screen.findByPlaceholderText('Optional notes for court evidence') as TextInput;
    expect(nextNotes.props.value).toBe('');
    expect(mockBreathalyzerSession.startNewSubject).toHaveBeenCalled();
  }, 15000);

  it('clears notes on retest while preserving the retest lineage', async () => {
    const locationMock = jest.requireMock('expo-location');
    const syncMock = jest.requireMock('../../src/services/sync');
    locationMock.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    locationMock.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: -26.1, longitude: 28.05, accuracy: 5 },
    });
    syncMock.saveLocally.mockResolvedValue(undefined);
    Object.assign(breathalyzerSnapshot, {
      connection: 'connected',
      transportKind: 'simulated',
      transportLabel: 'Test simulator',
      raw: 600,
      avg: 590,
      devicePeak: 620,
      sessionPeak: 620,
      liveBacGdl: 0.03,
      peakBacGdl: 0.03,
      readings: 1,
      lastReceivedAt: '2026-09-24T12:00:00.000Z',
    });

    render(<OfficerDashboardScreen navigation={navigation} route={{ key: 'dashboard', name: 'OfficerDashboard' } as never} />);
    fireEvent.press(screen.getByText('Start New Session'));
    const notes = await screen.findByPlaceholderText('Optional notes for court evidence') as TextInput;
    fireEvent.changeText(notes, 'First capture observation');
    fireEvent.press(screen.getByText('CAPTURE READING'));
    fireEvent.press(screen.getByText('SAVE RECORD'));

    fireEvent.press(await screen.findByText('RETEST DRIVER'));
    const retestNotes = await screen.findByPlaceholderText('Optional notes for court evidence') as TextInput;
    expect(retestNotes.props.value).toBe('');

    fireEvent.press(screen.getByText('CAPTURE READING'));
    fireEvent.press(screen.getByText('SAVE RECORD'));
    await screen.findByText('RETEST DRIVER');

    const firstRecord = syncMock.saveLocally.mock.calls[0][0];
    const retestRecord = syncMock.saveLocally.mock.calls[1][0];
    expect(firstRecord.originalTestId).toBeNull();
    expect(retestRecord.originalTestId).toBe(firstRecord.id);
  }, 15000);

});

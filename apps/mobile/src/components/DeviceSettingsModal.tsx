import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Switch,
  Text,
  TextInput,
  View
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import type {
  BreathalyzerCalibration,
  BreathalyzerSnapshot
} from '../services/breathalyzer';
import {
  DEFAULT_BREATHALYZER_CALIBRATION,
  breathalyzerSession,
  formatBacGdl
} from '../services/breathalyzer';
import {
  createHc06BluetoothTransport,
  getPairedHc06Devices,
  openHc06AppSettings,
  openHc06BluetoothSettings,
  type PairedBluetoothDevice
} from '../services/breathalyzerBluetooth';
import {
  clearCalibration,
  saveCalibration
} from '../services/breathalyzerStorage';
import { createSimulatedTransport } from '../services/breathalyzerSimulator';
import {
  clearCalibrationHistory,
  forgetPreferredDevice,
  loadCalibrationHistory,
  loadDevicePreferences,
  recordCalibrationChange,
  rememberPreferredDevice,
  saveDevicePreferences,
  DEFAULT_BREATHALYZER_DEVICE_PREFERENCES,
  type BreathalyzerDevicePreferences,
  type CalibrationHistoryEntry
} from '../services/breathalyzerDeviceStorage';
import { getAllTests } from '../db/repository';
import { logAuditEvent } from '../services/audit';
import type { RuntimeConfig, UserProfile } from '../types';
import {
  buildCaptureReadiness,
  buildDeviceDiagnosticReport,
  calibrationHistoryLabel,
  calibrationPreview,
  createManualCalibration,
  formatRawValue,
  formatRelativeTimestamp,
  formatResistance,
  formatSampleAge,
  formatVoltage,
  summarizeDeviceHistory,
  targetRawForBac,
  toCalibrationDraft,
  type CalibrationDraft,
  type DeviceHistorySummary
} from '../lib/deviceSettings';

import { styles } from './DeviceSettingsModal.styles';
import { colors } from '../styles/colors';

const SIGNAL_SAMPLE_LIMIT = 28;
const SIMULATION_ENABLED =
  __DEV__ || process.env.EXPO_PUBLIC_BREATHALYZER_SIMULATION === '1';
const DIAGNOSTIC_WINDOW_MS = 3_000;
const CALIBRATION_PREVIEW_TARGETS = [0.02, 0.05, 0.08] as const;

export type DeviceSettingsTab = 'device' | 'connect' | 'calibration' | 'activity';

type InlineMessage = {
  type: 'success' | 'error' | 'info';
  text: string;
};

type DiagnosticResult = {
  ok: boolean;
  samples: number;
  startedAt: number;
  finishedAt: number;
  detail: string;
};

interface DeviceSettingsModalProps {
  visible: boolean;
  initialTab?: DeviceSettingsTab;
  onClose: () => void;
  snapshot: BreathalyzerSnapshot;
  runtimeConfig: RuntimeConfig | null;
  profile: UserProfile | null;
  lockDeviceMutations?: boolean;
}

const TABS: Array<{
  key: DeviceSettingsTab;
  label: string;
  icon: keyof typeof Feather.glyphMap;
}> = [
  { key: 'device', label: 'Device', icon: 'bluetooth' },
  { key: 'connect', label: 'Connect', icon: 'radio' },
  { key: 'calibration', label: 'Calibrate', icon: 'sliders' },
  { key: 'activity', label: 'Activity', icon: 'activity' }
];

function statusFromSnapshot(snapshot: BreathalyzerSnapshot): {
  label: string;
  detail: string;
  color: string;
  background: string;
} {
  if (snapshot.connection === 'connecting') {
    return {
      label: 'Connecting',
      detail: 'Opening the Bluetooth serial stream…',
      color: colors.warning,
      background: 'rgba(245, 158, 11, 0.16)'
    };
  }
  if (snapshot.connection === 'connected') {
    return {
      label: snapshot.warm ? 'Warming' : 'Live',
      detail: snapshot.transportLabel ?? 'Breathalyzer connected',
      color: colors.success,
      background: 'rgba(34, 197, 94, 0.16)'
    };
  }
  if (snapshot.connection === 'error') {
    return {
      label: 'Attention',
      detail: snapshot.error ?? 'The device connection needs attention.',
      color: colors.error,
      background: 'rgba(220, 38, 38, 0.14)'
    };
  }
  return {
    label: 'Offline',
    detail: 'No breathalyzer is connected.',
    color: colors.neutralGray,
    background: 'rgba(155, 165, 183, 0.16)'
  };
}

function MetricTile({
  label,
  value,
  detail,
  tone = 'neutral'
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: 'neutral' | 'success' | 'warning' | 'error';
}) {
  const toneStyle =
    tone === 'success'
      ? styles.metricTileSuccess
      : tone === 'warning'
      ? styles.metricTileWarning
      : tone === 'error'
      ? styles.metricTileError
      : null;

  return (
    <View style={[styles.metricTile, toneStyle]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {detail ? <Text style={styles.metricDetail}>{detail}</Text> : null}
    </View>
  );
}

function SectionCard({
  title,
  description,
  children,
  action
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {description ? <Text style={styles.sectionDescription}>{description}</Text> : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

function ToggleRow({
  label,
  detail,
  value,
  onValueChange
}: {
  label: string;
  detail: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleText}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleDetail}>{detail}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.borderLight, true: colors.borderHighlight }}
        thumbColor={value ? colors.primaryDark : colors.background}
        ios_backgroundColor={colors.borderLight}
        accessibilityRole="switch"
        accessibilityLabel={label}
      />
    </View>
  );
}

export function DeviceSettingsModal({
  visible,
  initialTab = 'device',
  onClose,
  snapshot,
  runtimeConfig,
  profile,
  lockDeviceMutations = false
}: DeviceSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<DeviceSettingsTab>(initialTab);
  const [preferences, setPreferences] = useState<BreathalyzerDevicePreferences>(
    DEFAULT_BREATHALYZER_DEVICE_PREFERENCES,
  );
  const preferencesRef = useRef(preferences);
  const [pairedDevices, setPairedDevices] = useState<PairedBluetoothDevice[]>([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [busyDeviceAddress, setBusyDeviceAddress] = useState<string | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isRunningDiagnostic, setIsRunningDiagnostic] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<DiagnosticResult | null>(null);
  const [inlineMessage, setInlineMessage] = useState<InlineMessage | null>(null);
  const [calibrationDraft, setCalibrationDraft] = useState<CalibrationDraft>(() =>
    toCalibrationDraft(snapshot.calibration),
  );
  const [calibrationError, setCalibrationError] = useState<string | null>(null);
  const [showAdvancedCalibration, setShowAdvancedCalibration] = useState(false);
  const [calibrationHistory, setCalibrationHistory] = useState<CalibrationHistoryEntry[]>([]);
  const [historySummary, setHistorySummary] = useState<DeviceHistorySummary>(() =>
    summarizeDeviceHistory([]),
  );
  const [previewRawText, setPreviewRawText] = useState('');
  const [signalSamples, setSignalSamples] = useState<number[]>([]);
  const autoConnectAttemptedRef = useRef(false);
  const deviceListRequestRef = useRef(0);
  const initialLoadRequestRef = useRef(0);

  const status = useMemo(() => statusFromSnapshot(snapshot), [snapshot]);
  const readiness = useMemo(() => buildCaptureReadiness(snapshot), [snapshot]);
  const preview = useMemo(
    () => calibrationPreview(snapshot.avg ?? snapshot.sessionPeak, snapshot.calibration),
    [snapshot.avg, snapshot.sessionPeak, snapshot.calibration],
  );
  const previewFromText = useMemo(() => {
    const raw = Number(previewRawText.trim().replace(',', '.'));
    return Number.isFinite(raw) ? calibrationPreview(raw, snapshot.calibration) : null;
  }, [previewRawText, snapshot.calibration]);

  const deviceIdentity =
    snapshot.connection === 'connected' || snapshot.connection === 'connecting'
      ? snapshot.transportLabel ?? preferences.preferredDeviceName ?? 'Breathalyzer device'
      : preferences.preferredDeviceName ?? 'No device connected';
  const deviceConnectionLocked = lockDeviceMutations && snapshot.connection === 'connected';

  const setMessage = (type: InlineMessage['type'], text: string) => {
    setInlineMessage({ type, text });
  };

  const loadStoredState = async () => {
    const [storedPreferences, storedCalibrationHistory, records] = await Promise.all([
      loadDevicePreferences(),
      loadCalibrationHistory(),
      profile?.officerId !== undefined
        ? getAllTests(profile.officerId).catch(() => [])
        : getAllTests().catch(() => [])
    ]);
    return {
      storedPreferences,
      storedCalibrationHistory,
      storedHistorySummary: summarizeDeviceHistory(records)
    };
  };

  const connectDevice = async (
    device: PairedBluetoothDevice,
    options: { remember?: boolean; quiet?: boolean } = {},
  ) => {
    if (busyDeviceAddress || isDisconnecting || snapshot.connection === 'connecting') return;
    if (deviceConnectionLocked) {
      setMessage(
        'info',
        'Finish or cancel the current test before replacing the connected breathalyser.',
      );
      return;
    }
    setBusyDeviceAddress(device.address);
    setInlineMessage(null);
    try {
      await breathalyzerSession.connect(createHc06BluetoothTransport(device));
      const connectedSnapshot = breathalyzerSession.getSnapshot();
      if (connectedSnapshot.connection === 'error') {
        if (!options.quiet) {
          setMessage('error', connectedSnapshot.error ?? 'The HC-06 connection failed.');
        }
        return;
      }

      if (options.remember !== false) {
        await rememberPreferredDevice(device);
        setPreferences((current) => ({
          ...current,
          preferredDeviceAddress: device.address,
          preferredDeviceName: device.name
        }));
      }

      await logAuditEvent({
        action: 'test.device.connected',
        outcome: 'success',
        message: `Breathalyzer connected: ${device.name}`,
        entityType: 'breathalyzer',
        entityId: device.address,
        officerId: profile?.officerId ?? null,
        officerName: profile ? `${profile.name} ${profile.surname}`.trim() : null,
        badgeNumber: profile?.badgeNumber ?? null,
        metadata: {
          address: device.address,
          name: device.name,
          transport: connectedSnapshot.transportKind
        }
      });

      if (!options.quiet) {
        setActiveTab('device');
        setMessage('success', `${device.name} is connected and streaming.`);
      }
    } catch (error) {
      if (!options.quiet) {
        setMessage('error', error instanceof Error ? error.message : 'Could not connect to the HC-06.');
      }
    } finally {
      setBusyDeviceAddress(null);
    }
  };

  const refreshPairedDevices = async (
    preferencesOverride?: BreathalyzerDevicePreferences,
    options: { autoConnect?: boolean } = {},
  ) => {
    const requestId = ++deviceListRequestRef.current;
    if (Platform.OS !== 'android') {
      setPairedDevices([]);
      setIsLoadingDevices(false);
      return;
    }

    setIsLoadingDevices(true);
    setInlineMessage(null);
    try {
      const devices = await getPairedHc06Devices();
      if (requestId !== deviceListRequestRef.current) return;
      setPairedDevices(devices);

      if (devices.length === 0) {
        setMessage(
          'info',
          'No paired HC-06 was found. Pair the module in Android Bluetooth settings, then scan again.',
        );
        return;
      }

      const activePreferences = preferencesOverride ?? preferencesRef.current;
      if (
        options.autoConnect &&
        activePreferences.autoConnectPreferredDevice &&
        activePreferences.preferredDeviceAddress &&
        !autoConnectAttemptedRef.current &&
        breathalyzerSession.getSnapshot().connection === 'idle'
      ) {
        autoConnectAttemptedRef.current = true;
        const preferred =
          devices.find((device) => device.address === activePreferences.preferredDeviceAddress) ??
          devices.find((device) => device.name === activePreferences.preferredDeviceName);
        if (preferred) {
          await connectDevice(preferred, { remember: false, quiet: true });
        } else {
          setMessage('info', 'The saved breathalyzer is not currently paired with this phone.');
        }
      }
    } catch (error) {
      if (requestId !== deviceListRequestRef.current) return;
      setMessage(
        'error',
        error instanceof Error ? error.message : 'Could not read paired Bluetooth devices.',
      );
    } finally {
      if (requestId === deviceListRequestRef.current) {
        setIsLoadingDevices(false);
      }
    }
  };

  const persistPreferences = async (next: BreathalyzerDevicePreferences) => {
    setPreferences(next);
    await saveDevicePreferences(next);
  };

  const handleToggleAutoConnect = async (value: boolean) => {
    const next = { ...preferences, autoConnectPreferredDevice: value };
    await persistPreferences(next);
    if (value && preferences.preferredDeviceAddress) {
      await refreshPairedDevices(next, { autoConnect: true });
    } else if (!value) {
      setMessage('info', 'Auto-connect is off. The saved device remains available for manual connection.');
    }
  };

  const handleForgetPreferredDevice = () => {
    Alert.alert(
      'Forget saved device?',
      'This clears the preferred HC-06 address and name on this phone. It does not unpair the module from Android.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Forget device',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await forgetPreferredDevice();
              const next = {
                ...preferencesRef.current,
                preferredDeviceAddress: null,
                preferredDeviceName: null
              };
              preferencesRef.current = next;
              setPreferences(next);
              setMessage('success', 'Saved device cleared. The current connection is unchanged.');
            })();
          }
        }
      ],
    );
  };

  const handleDisconnect = () => {
    if (lockDeviceMutations) {
      setMessage(
        'info',
        'Finish or cancel the current test before disconnecting the breathalyzer.',
      );
      return;
    }

    const performDisconnect = async () => {
      setIsDisconnecting(true);
      setInlineMessage(null);
      try {
        await breathalyzerSession.disconnect();
        await logAuditEvent({
          action: 'test.device.disconnected',
          outcome: 'success',
          message: 'Breathalyzer disconnected from device settings',
          entityType: 'breathalyzer',
          entityId: preferences.preferredDeviceAddress ?? undefined,
          officerId: profile?.officerId ?? null,
          officerName: profile ? `${profile.name} ${profile.surname}`.trim() : null,
          badgeNumber: profile?.badgeNumber ?? null
        });
        setMessage('success', 'Device disconnected.');
      } catch (error) {
        setMessage('error', error instanceof Error ? error.message : 'Could not disconnect the device.');
      } finally {
        setIsDisconnecting(false);
      }
    };

    if (!preferences.confirmBeforeDisconnect) {
      void performDisconnect();
      return;
    }

    Alert.alert(
      'Disconnect breathalyzer?',
      'Live telemetry will stop and the current subject peak will be cleared.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Disconnect', style: 'destructive', onPress: () => void performDisconnect() }
      ],
    );
  };

  const handleCalibrateFromCleanAir = async () => {
    if (lockDeviceMutations) {
      setMessage('info', 'Calibration is locked while a roadside test is active.');
      return;
    }
    if (snapshot.connection !== 'connected') {
      setMessage('error', 'Connect the breathalyzer before recording a clean-air baseline.');
      return;
    }
    if (snapshot.warm || snapshot.over || snapshot.alarm) {
      setMessage('error', 'Wait for warm-up to finish and keep the sensor in clean air before calibrating.');
      return;
    }

    const previous = snapshot.calibration;
    const next = breathalyzerSession.calibrateFromCleanAir();
    if (!next) {
      setMessage('error', 'A stable clean-air sample is required. Keep alcohol vapour away from the sensor.');
      return;
    }

    await saveCalibration(next);
    const history = await recordCalibrationChange({
      source: 'clean-air',
      calibration: next,
      previousCleanAirResistanceOhms: previous.cleanAirResistanceOhms,
      rawSample: snapshot.avg
    });
    setCalibrationHistory(history);
    setCalibrationDraft(toCalibrationDraft(next));
    await logAuditEvent({
      action: 'test.device.calibrated',
      outcome: 'success',
      message: `Clean-air baseline set to ${formatResistance(next.cleanAirResistanceOhms)}`,
      entityType: 'breathalyzer',
      entityId: next.version,
      officerId: profile?.officerId ?? null,
      officerName: profile ? `${profile.name} ${profile.surname}`.trim() : null,
      badgeNumber: profile?.badgeNumber ?? null,
      metadata: {
        source: 'clean-air',
        rawSample: snapshot.avg,
        cleanAirResistanceOhms: next.cleanAirResistanceOhms
      }
    });
    setMessage('success', `Clean-air baseline saved as ${formatResistance(next.cleanAirResistanceOhms)}.`);
  };

  const handleApplyCalibration = async () => {
    if (lockDeviceMutations) {
      setMessage('info', 'Calibration is locked while a roadside test is active.');
      return;
    }
    const result = createManualCalibration(snapshot.calibration, calibrationDraft);
    if (!result.ok) {
      setCalibrationError(result.error);
      return;
    }

    const previous = snapshot.calibration;
    const next: BreathalyzerCalibration = {
      version: result.version,
      ...result.value
    };
    breathalyzerSession.setCalibration(next);
    await saveCalibration(next);
    const history = await recordCalibrationChange({
      source: 'manual',
      calibration: next,
      previousCleanAirResistanceOhms: previous.cleanAirResistanceOhms,
      rawSample: snapshot.avg
    });
    setCalibrationHistory(history);
    setCalibrationDraft(toCalibrationDraft(next));
    setCalibrationError(null);
    await logAuditEvent({
      action: 'test.device.calibrated',
      outcome: 'success',
      message: `Manual calibration profile applied (${next.version})`,
      entityType: 'breathalyzer',
      entityId: next.version,
      officerId: profile?.officerId ?? null,
      officerName: profile ? `${profile.name} ${profile.surname}`.trim() : null,
      badgeNumber: profile?.badgeNumber ?? null,
      metadata: {
        source: 'manual',
        previousVersion: previous.version,
        nextVersion: next.version,
        ...next
      }
    });
    setMessage('success', `Calibration profile ${next.version} is active.`);
  };

  const handleResetCalibration = () => {
    if (lockDeviceMutations) {
      setMessage('info', 'Calibration is locked while a roadside test is active.');
      return;
    }
    Alert.alert(
      'Restore default calibration?',
      'This replaces the active profile with the repository MQ-3 defaults. Existing records keep their original custody values.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore defaults',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const previous = breathalyzerSession.getCalibration();
              breathalyzerSession.setCalibration(DEFAULT_BREATHALYZER_CALIBRATION);
              await clearCalibration();
              const history = await recordCalibrationChange({
                source: 'reset',
                calibration: DEFAULT_BREATHALYZER_CALIBRATION,
                previousCleanAirResistanceOhms: previous.cleanAirResistanceOhms
              });
              setCalibrationHistory(history);
              setCalibrationDraft(toCalibrationDraft(DEFAULT_BREATHALYZER_CALIBRATION));
              setCalibrationError(null);
              await logAuditEvent({
                action: 'test.device.calibrated',
                outcome: 'success',
                message: 'Breathalyzer calibration restored to defaults',
                entityType: 'breathalyzer',
                entityId: DEFAULT_BREATHALYZER_CALIBRATION.version,
                officerId: profile?.officerId ?? null,
                officerName: profile ? `${profile.name} ${profile.surname}`.trim() : null,
                badgeNumber: profile?.badgeNumber ?? null,
                metadata: { source: 'reset', previousVersion: previous.version }
              });
              setMessage('success', 'Default calibration restored.');
            })();
          }
        }
      ],
    );
  };

  const handleResetSubjectPeak = () => {
    if (lockDeviceMutations) {
      setMessage('info', 'The subject peak is locked while a roadside test is active.');
      return;
    }
    breathalyzerSession.startNewSubject();
    setMessage('success', 'Subject peak cleared. The next stable sample starts a new measurement.');
  };

  const handlePreviewCapture = () => {
    const raw = snapshot.sessionPeak ?? snapshot.avg;
    if (raw === null) {
      setMessage('error', 'No live sample is available for a preview capture.');
      return;
    }
    const result = calibrationPreview(raw, snapshot.calibration);
    if (result.bacGdl === null) {
      setMessage('error', 'The current calibration cannot convert this sample.');
      return;
    }
    setMessage(
      'success',
      `Preview only: raw ${formatRawValue(raw)} converts to ${formatBacGdl(result.bacGdl)} g/100ml.`,
    );
  };

  const handleConnectSimulator = async () => {
    if (busyDeviceAddress || isDisconnecting || snapshot.connection === 'connecting') return;
    setInlineMessage(null);
    try {
      await breathalyzerSession.connect(
        createSimulatedTransport({
          calibration: breathalyzerSession.getCalibration(),
          targetBacGdl: 0.075
        }),
      );
      setMessage('success', 'Simulated MQ-3 device connected for field rehearsal.');
    } catch (error) {
      setMessage('error', error instanceof Error ? error.message : 'Could not start the simulated device.');
    }
  };

  const handleRunDiagnostic = async () => {
    if (snapshot.connection !== 'connected') {
      setMessage('error', 'Connect the breathalyzer before running the stream diagnostic.');
      return;
    }

    setIsRunningDiagnostic(true);
    setDiagnosticResult(null);
    const startedAt = Date.now();
    const startingReadings = breathalyzerSession.getSnapshot().readings;
    await new Promise<void>((resolve) => setTimeout(resolve, DIAGNOSTIC_WINDOW_MS));
    const finishedSnapshot = breathalyzerSession.getSnapshot();
    const samples = Math.max(0, finishedSnapshot.readings - startingReadings);
    const fresh = finishedSnapshot.connection === 'connected' && finishedSnapshot.lastReceivedAt !== null;
    const ok = samples >= 2 && fresh;
    const result: DiagnosticResult = {
      ok,
      samples,
      startedAt,
      finishedAt: Date.now(),
      detail: ok
        ? `${samples} samples arrived in 3 seconds. The stream is healthy.`
        : 'Fewer than two samples arrived. Reconnect the HC-06 and check the serial stream.'
    };
    setDiagnosticResult(result);
    setIsRunningDiagnostic(false);
    await logAuditEvent({
      action: 'test.device.diagnostic',
      outcome: ok ? 'success' : 'failure',
      message: result.detail,
      entityType: 'breathalyzer',
      entityId: preferences.preferredDeviceAddress ?? undefined,
      officerId: profile?.officerId ?? null,
      officerName: profile ? `${profile.name} ${profile.surname}`.trim() : null,
      badgeNumber: profile?.badgeNumber ?? null,
      metadata: { samples, windowMs: DIAGNOSTIC_WINDOW_MS }
    });
    setMessage(ok ? 'success' : 'error', result.detail);
  };

  const handleShareReport = async () => {
    try {
      const report = buildDeviceDiagnosticReport({
        platformLabel: Platform.OS,
        snapshot,
        preferences,
        history: historySummary,
        pairedDevice:
          pairedDevices.find((device) => device.address === preferences.preferredDeviceAddress) ?? null,
        runtimeBacLimits: runtimeConfig?.bacLimits.map((limit) => ({
          label: limit.label,
          limitG100ml: limit.limitG100ml
        }))
      });
      await Share.share({
        title: 'Breathalyzer diagnostic report',
        message: report
      });
      setMessage('success', 'Diagnostic report ready to share.');
    } catch (error) {
      setMessage('error', error instanceof Error ? error.message : 'Could not share the diagnostic report.');
    }
  };

  const handleOpenBluetoothSettings = async () => {
    try {
      await openHc06BluetoothSettings();
      setActiveTab('connect');
      setMessage(
        'info',
        'Pair the HC-06 in Android Bluetooth settings, then return here. This screen will scan again automatically.',
      );
    } catch (error) {
      setMessage('error', error instanceof Error ? error.message : 'Open Android Bluetooth settings and pair the HC-06.');
    }
  };

  const handleOpenAppSettings = async () => {
    try {
      await openHc06AppSettings();
      setMessage('info', 'App settings opened. Check Nearby devices / Bluetooth permissions.');
    } catch (error) {
      setMessage('error', error instanceof Error ? error.message : 'Open Android app settings and allow Bluetooth access.');
    }
  };

  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);

  useEffect(() => {
    if (!visible) {
      initialLoadRequestRef.current += 1;
      deviceListRequestRef.current += 1;
      return;
    }

    const requestId = ++initialLoadRequestRef.current;
    autoConnectAttemptedRef.current = false;
    setActiveTab(initialTab);
    setInlineMessage(null);
    setDiagnosticResult(null);
    setCalibrationError(null);
    setCalibrationDraft(toCalibrationDraft(snapshot.calibration));

    void (async () => {
      try {
        const stored = await loadStoredState();
        if (requestId !== initialLoadRequestRef.current) return;
        preferencesRef.current = stored.storedPreferences;
        setPreferences(stored.storedPreferences);
        setCalibrationHistory(stored.storedCalibrationHistory);
        setHistorySummary(stored.storedHistorySummary);
        await refreshPairedDevices(stored.storedPreferences, { autoConnect: true });
      } catch (error) {
        if (requestId !== initialLoadRequestRef.current) return;
        setMessage(
          'error',
          error instanceof Error ? error.message : 'Could not load device settings.',
        );
      }
    })();

    return () => {
      if (requestId === initialLoadRequestRef.current) {
        initialLoadRequestRef.current += 1;
      }
      deviceListRequestRef.current += 1;
    };
  }, [visible, initialTab]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void refreshPairedDevices(undefined, { autoConnect: true });
      }
    });
    return () => subscription.remove();
  }, [visible]);

  useEffect(() => {
    if (snapshot.raw === null) {
      setSignalSamples([]);
      return;
    }
    setSignalSamples((current) => [...current.slice(-(SIGNAL_SAMPLE_LIMIT - 1)), snapshot.raw as number]);
  }, [snapshot.raw]);

  useEffect(() => {
    setCalibrationDraft(toCalibrationDraft(snapshot.calibration));
  }, [snapshot.calibration]);

  const pairedDeviceRows =
    Platform.OS !== 'android' ? (
      <View style={styles.emptyState}>
        <Feather name="smartphone" size={24} color={colors.neutralGray} />
        <Text style={styles.emptyStateTitle}>Android-only hardware connection</Text>
        <Text style={styles.emptyStateText}>
          The HC-06 uses Bluetooth Classic SPP in the Android build. Use the simulated MQ-3 for non-Android rehearsal.
        </Text>
      </View>
    ) : pairedDevices.length ? (
    pairedDevices.map((device) => {
      const isPreferred = preferences.preferredDeviceAddress === device.address;
      const isBusy = busyDeviceAddress === device.address;
      return (
        <View key={device.address} style={styles.deviceRow}>
          <View style={[styles.deviceIcon, isPreferred && styles.deviceIconPreferred]}>
            <Feather name="bluetooth" size={18} color={isPreferred ? colors.background : colors.primaryDark} />
          </View>
          <View style={styles.deviceRowText}>
            <View style={styles.deviceRowTitle}>
              <Text style={styles.deviceName}>{device.name}</Text>
              {isPreferred ? <Text style={styles.savedBadge}>SAVED</Text> : null}
            </View>
            <Text style={styles.deviceAddress}>{device.address}</Text>
            <Text style={styles.deviceMeta}>
              {device.type === 'CLASSIC' ? 'Bluetooth Classic' : device.type} · {device.bonded ? 'Paired' : 'Not paired'}
            </Text>
          </View>
          <Pressable
            style={[
              styles.rowAction,
              (isBusy || deviceConnectionLocked) && styles.rowActionDisabled,
            ]}
            onPress={() => void connectDevice(device)}
            disabled={Boolean(busyDeviceAddress) || isDisconnecting || deviceConnectionLocked}
            accessibilityRole="button"
            accessibilityLabel={
              deviceConnectionLocked
                ? `Device changes locked during the current test`
                : `Connect ${device.name}`
            }
          >
            {isBusy ? (
              <ActivityIndicator size="small" color={colors.primaryDark} />
            ) : (
              <>
                <Feather name="lock" size={14} color={colors.primaryDark} />
                <Text style={styles.rowActionText}>
                  {deviceConnectionLocked ? 'Locked' : isPreferred ? 'Reconnect' : 'Connect'}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      );
    })
  ) : (
    <View style={styles.emptyState}>
      <Feather name="bluetooth" size={24} color={colors.neutralGray} />
      <Text style={styles.emptyStateTitle}>No paired HC-06 found</Text>
      <Text style={styles.emptyStateText}>
        Pair the module in Android Bluetooth settings (PIN 1234 or 0000), then refresh this list.
      </Text>
    </View>
  );

  const renderDeviceTab = () => (
    <>
      <SectionCard
        title="Breathalyser"
        description="Current field device, readiness, and the next useful action."
        action={
          <View style={[styles.statusChip, { backgroundColor: status.background }]}>
            <View style={[styles.statusDot, { backgroundColor: status.color }]} />
            <Text style={[styles.statusChipText, { color: status.color }]}>{status.label}</Text>
          </View>
        }
      >
        <View style={styles.connectionSummary}>
          <View style={styles.connectionIcon}>
            <Feather name="bluetooth" size={24} color={colors.background} />
          </View>
          <View style={styles.connectionText}>
            <Text style={styles.connectionTitle}>{deviceIdentity}</Text>
            <Text style={styles.connectionDetail}>{status.detail}</Text>
            <Text style={styles.connectionMeta}>
              {snapshot.deviceSerial
                ? `Firmware serial ${snapshot.deviceSerial}`
                : 'Firmware serial appears after the first sample'}
            </Text>
          </View>
        </View>

        {inlineMessage ? (
          <View
            style={[
              styles.inlineMessage,
              inlineMessage.type === 'error'
                ? styles.inlineMessageError
                : inlineMessage.type === 'success'
                ? styles.inlineMessageSuccess
                : styles.inlineMessageInfo
            ]}
            accessibilityRole={inlineMessage.type === 'error' ? 'alert' : 'text'}
            accessibilityLiveRegion="polite"
          >
            <Text style={styles.inlineMessageText}>{inlineMessage.text}</Text>
          </View>
        ) : null}

        <View style={styles.actionGrid}>
          {snapshot.connection === 'connected' ? (
            <Pressable
              style={styles.primaryButton}
              onPress={() => setActiveTab('activity')}
              accessibilityRole="button"
              accessibilityLabel="View live breathalyser activity"
            >
              <Feather name="activity" size={17} color={colors.background} />
              <Text style={styles.primaryButtonText}>View live activity</Text>
            </Pressable>
          ) : (
            <Pressable
              style={styles.primaryButton}
              onPress={() => setActiveTab('connect')}
              accessibilityRole="button"
              accessibilityLabel="Open the connection tab"
            >
              <Feather name="bluetooth" size={17} color={colors.background} />
              <Text style={styles.primaryButtonText}>Connect a device</Text>
            </Pressable>
          )}

          {snapshot.connection === 'connected' ? (
            <Pressable
              style={[
                styles.secondaryButton,
                (isDisconnecting || lockDeviceMutations) && styles.buttonDisabled,
              ]}
              onPress={handleDisconnect}
              disabled={isDisconnecting || lockDeviceMutations}
              accessibilityRole="button"
              accessibilityLabel="Disconnect breathalyzer"
            >
              {isDisconnecting ? (
                <ActivityIndicator size="small" color={colors.primaryDark} />
              ) : (
                <Feather name="power" size={16} color={colors.primaryDark} />
              )}
              <Text style={styles.secondaryButtonText}>
                {lockDeviceMutations ? 'Locked during test' : 'Disconnect'}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              style={styles.secondaryButton}
              onPress={() => void handleOpenBluetoothSettings()}
              accessibilityRole="button"
              accessibilityLabel="Pair a new HC-06 in Android Bluetooth settings"
            >
              <Feather name="plus" size={16} color={colors.primaryDark} />
              <Text style={styles.secondaryButtonText}>Pair a new HC-06</Text>
            </Pressable>
          )}
        </View>
      </SectionCard>

      <SectionCard title="Before a roadside test" description="Open Activity for the complete readiness check.">
        <View style={styles.readinessList}>
          {readiness.slice(0, 3).map((check) => (
            <View key={check.key} style={styles.readinessRow}>
              <Feather
                name={check.ok ? 'check-circle' : 'alert-circle'}
                size={17}
                color={check.ok ? colors.success : check.tone === 'error' ? colors.error : colors.warning}
              />
              <View style={styles.readinessText}>
                <Text style={styles.readinessLabel}>{check.label}</Text>
                <Text style={styles.readinessDetail}>{check.detail}</Text>
              </View>
            </View>
          ))}
        </View>
        <Pressable
          style={styles.secondaryButton}
          onPress={() => setActiveTab('activity')}
          accessibilityRole="button"
          accessibilityLabel="Open complete live activity"
        >
          <Feather name="bar-chart-2" size={16} color={colors.primaryDark} />
          <Text style={styles.secondaryButtonText}>Open live activity</Text>
        </Pressable>
      </SectionCard>

      <SectionCard title="Device tools" description="Maintenance and calibration stay separate from connection.">
        <View style={styles.actionGrid}>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => setActiveTab('calibration')}
            accessibilityRole="button"
            accessibilityLabel="Open calibration settings"
          >
            <Feather name="sliders" size={16} color={colors.primaryDark} />
            <Text style={styles.secondaryButtonText}>Calibration settings</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => void handleShareReport()}
            accessibilityRole="button"
            accessibilityLabel="Share a breathalyser diagnostic report"
          >
            <Feather name="share" size={16} color={colors.primaryDark} />
            <Text style={styles.secondaryButtonText}>Share diagnostic report</Text>
          </Pressable>
        </View>
      </SectionCard>

      <View style={styles.noteCard}>
        <Feather name="shield" size={16} color={colors.accentBlue} />
        <Text style={styles.noteText}>
          Connection, calibration, and test activity use the same live device session. Closing this console does not disconnect the breathalyser.
        </Text>
      </View>
    </>
  );

  const renderConnectTab = () => (
    <>
      <SectionCard
        title="Connect an HC-06"
        description="Pair or reconnect directly here. No driver licence or active test is required."
      >
        {inlineMessage ? (
          <View
            style={[
              styles.inlineMessage,
              inlineMessage.type === 'error'
                ? styles.inlineMessageError
                : inlineMessage.type === 'success'
                ? styles.inlineMessageSuccess
                : styles.inlineMessageInfo
            ]}
            accessibilityRole={inlineMessage.type === 'error' ? 'alert' : 'text'}
            accessibilityLiveRegion="polite"
          >
            <Text style={styles.inlineMessageText}>{inlineMessage.text}</Text>
          </View>
        ) : null}
        {deviceConnectionLocked ? (
          <View style={[styles.inlineMessage, styles.inlineMessageInfo]}>
            <Text style={styles.inlineMessageText}>
              Device replacement is locked until the current roadside test is saved or cancelled.
            </Text>
          </View>
        ) : null}

        <View style={styles.actionGrid}>
          <Pressable
            style={[styles.primaryButton, isLoadingDevices && styles.buttonDisabled]}
            onPress={() => void refreshPairedDevices(undefined, { autoConnect: true })}
            disabled={isLoadingDevices}
            accessibilityRole="button"
            accessibilityLabel="Scan for paired HC-06 devices"
            accessibilityState={{ busy: isLoadingDevices }}
          >
            {isLoadingDevices ? (
              <ActivityIndicator size="small" color={colors.background} />
            ) : (
              <Feather name="radio" size={17} color={colors.background} />
            )}
            <Text style={styles.primaryButtonText}>
              {isLoadingDevices ? 'Scanning paired devices…' : 'Scan paired devices'}
            </Text>
          </Pressable>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => void handleOpenBluetoothSettings()}
            accessibilityRole="button"
            accessibilityLabel="Pair a new HC-06 in Android Bluetooth settings"
          >
            <Feather name="plus" size={16} color={colors.primaryDark} />
            <Text style={styles.secondaryButtonText}>Pair a new HC-06</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => void handleOpenAppSettings()}
            accessibilityRole="button"
            accessibilityLabel="Open Android Bluetooth permissions"
          >
            <Feather name="lock" size={16} color={colors.primaryDark} />
            <Text style={styles.secondaryButtonText}>Check app permissions</Text>
          </Pressable>
        </View>

        {SIMULATION_ENABLED && snapshot.connection !== 'connected' ? (
          <Pressable
            style={styles.secondaryButton}
            onPress={() => void handleConnectSimulator()}
            disabled={Boolean(busyDeviceAddress) || snapshot.connection === 'connecting'}
            accessibilityRole="button"
            accessibilityLabel="Connect simulated MQ-3 device"
          >
            <Feather name="cpu" size={16} color={colors.primaryDark} />
            <Text style={styles.secondaryButtonText}>Use simulated MQ-3</Text>
          </Pressable>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Paired devices"
        description="HC-06 modules already paired with this Android phone."
        action={
          <Pressable
            style={styles.iconActionButton}
            onPress={() => void refreshPairedDevices()}
            disabled={isLoadingDevices}
            accessibilityRole="button"
            accessibilityLabel="Refresh paired HC-06 devices"
          >
            <Feather name="rotate-cw" size={18} color={colors.primaryDark} />
          </Pressable>
        }
      >
        {isLoadingDevices && pairedDevices.length === 0 ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="small" color={colors.primaryDark} />
            <Text style={styles.loadingText}>Reading paired devices…</Text>
          </View>
        ) : (
          pairedDeviceRows
        )}
      </SectionCard>

      <SectionCard title="Connection preferences" description="Saved locally on this phone.">
        <ToggleRow
          label="Remember and auto-connect"
          detail="Reconnect the saved HC-06 when this console opens."
          value={preferences.autoConnectPreferredDevice}
          onValueChange={(value) => void handleToggleAutoConnect(value)}
        />
        <ToggleRow
          label="Confirm before disconnect"
          detail="Ask before ending a live measurement stream."
          value={preferences.confirmBeforeDisconnect}
          onValueChange={(value) =>
            void persistPreferences({ ...preferences, confirmBeforeDisconnect: value })
          }
        />
        <Pressable
          style={styles.textButton}
          onPress={handleForgetPreferredDevice}
          disabled={!preferences.preferredDeviceAddress}
          accessibilityRole="button"
          accessibilityLabel="Forget saved breathalyzer"
          accessibilityState={{ disabled: !preferences.preferredDeviceAddress }}
        >
          <Feather name="trash-2" size={15} color={colors.errorText} />
          <Text style={styles.textButtonDanger}>Forget saved device</Text>
        </Pressable>
      </SectionCard>

      <SectionCard title="Pairing steps" description="Use these once for each HC-06.">
        <View style={styles.stepList}>
          {[
            ['Power the HC-06', 'The module LED should blink continuously.'],
            ['Open Android Bluetooth settings', `Pair the module using PIN 1234 or 0000.`],
            ['Return to IntegriScan', 'This console scans paired devices again automatically.']
          ].map(([title, detail], index) => (
            <View key={title} style={styles.stepRow}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{index + 1}</Text>
              </View>
              <View style={styles.stepText}>
                <Text style={styles.stepTitle}>{title}</Text>
                <Text style={styles.stepDetail}>{detail}</Text>
              </View>
            </View>
          ))}
        </View>
      </SectionCard>
    </>
  );

  const renderCalibrationTab = () => (
    <>
      <SectionCard
        title="Clean-air baseline"
        description="Recalculate the sensor's clean-air resistance from a live sample."
      >
        <View style={styles.calibrationHero}>
          <View>
            <Text style={styles.calibrationHeroLabel}>ACTIVE CLEAN-AIR RESISTANCE</Text>
            <Text style={styles.calibrationHeroValue}>
              {formatResistance(snapshot.calibration.cleanAirResistanceOhms)}
            </Text>
          </View>
          <View style={styles.calibrationVersionPill}>
            <Text style={styles.calibrationVersionText}>{snapshot.calibration.version}</Text>
          </View>
        </View>

        <View style={styles.readinessList}>
          {readiness.slice(0, 3).map((check) => (
            <View key={check.key} style={styles.readinessRow}>
              <Feather
                name={check.ok ? 'check-circle' : 'alert-circle'}
                size={16}
                color={check.ok ? colors.success : check.tone === 'error' ? colors.error : colors.warning}
              />
              <Text style={styles.readinessLabel}>{check.label}</Text>
              <Text style={styles.readinessDetail}>{check.ok ? 'Ready' : 'Waiting'}</Text>
            </View>
          ))}
        </View>

        <Pressable
          style={[
            styles.primaryButton,
            (snapshot.connection !== 'connected' || lockDeviceMutations) && styles.buttonDisabled,
          ]}
          onPress={() => void handleCalibrateFromCleanAir()}
          disabled={snapshot.connection !== 'connected' || lockDeviceMutations}
          accessibilityRole="button"
          accessibilityLabel="Set clean-air calibration baseline"
        >
          <Feather name="target" size={16} color={colors.background} />
          <Text style={styles.primaryButtonText}>
            {lockDeviceMutations ? 'Locked during test' : 'Set clean-air baseline'}
          </Text>
        </Pressable>
        <Text style={styles.helperText}>
          {lockDeviceMutations
            ? 'Finish or cancel the current roadside test before changing calibration.'
            : 'Use clean air only. Do not calibrate from human breath or an alcohol sample unless you are using an approved calibrated reference system.'}
        </Text>
      </SectionCard>

      <SectionCard
        title="Measurement profile"
        description="Edit the MQ-3 conversion curve used to turn raw ADC into BAC."
        action={
          <Pressable
            onPress={() => setShowAdvancedCalibration((current) => !current)}
            accessibilityRole="button"
            accessibilityLabel={showAdvancedCalibration ? 'Hide advanced calibration' : 'Show advanced calibration'}
          >
            <Text style={styles.linkText}>{showAdvancedCalibration ? 'Hide' : 'Edit'}</Text>
          </Pressable>
        }
      >
        <View style={styles.profileGrid}>
          <MetricTile label="LOAD RESISTANCE" value={formatResistance(snapshot.calibration.loadResistorOhms)} />
          <MetricTile label="CLEAN-AIR RATIO" value={snapshot.calibration.cleanAirRatio.toFixed(1)} />
          <MetricTile label="MG/L AT RATIO 1" value={snapshot.calibration.mgPerLAtRatioOne.toFixed(3)} />
          <MetricTile label="CURVE SLOPE" value={snapshot.calibration.curveSlope.toFixed(2)} />
        </View>

        {showAdvancedCalibration ? (
          <>
            <View style={styles.inputGrid}>
              {(
                [
                  ['loadResistorOhms', 'Load resistance Ω'],
                  ['cleanAirResistanceOhms', 'Clean-air R0 Ω'],
                  ['mgPerLAtRatioOne', 'mg/L at ratio 1'],
                  ['curveSlope', 'Curve slope'],
                  ['cleanAirRatio', 'Clean-air ratio']
                ] as Array<[keyof CalibrationDraft, string]>
              ).map(([key, label]) => (
                <View key={key} style={styles.inputField}>
                  <Text style={styles.inputLabel}>{label}</Text>
                  <TextInput
                    value={calibrationDraft[key]}
                    onChangeText={(value) =>
                      setCalibrationDraft((current) => ({ ...current, [key]: value }))
                    }
                    keyboardType="decimal-pad"
                    placeholderTextColor={colors.neutralGray}
                    style={styles.input}
                    accessibilityLabel={label}
                  />
                </View>
              ))}
            </View>
            {calibrationError ? (
              <Text style={styles.errorText} accessibilityRole="alert" accessibilityLiveRegion="polite">
                {calibrationError}
              </Text>
            ) : null}
            <View style={styles.actionGrid}>
              <Pressable
                style={[styles.primaryButton, lockDeviceMutations && styles.buttonDisabled]}
                onPress={() => void handleApplyCalibration()}
                disabled={lockDeviceMutations}
                accessibilityRole="button"
                accessibilityLabel="Apply measurement profile"
              >
                <Feather name="save" size={16} color={colors.background} />
                <Text style={styles.primaryButtonText}>Apply profile</Text>
              </Pressable>
              <Pressable
                style={[styles.secondaryButton, lockDeviceMutations && styles.buttonDisabled]}
                onPress={handleResetCalibration}
                disabled={lockDeviceMutations}
                accessibilityRole="button"
                accessibilityLabel="Restore default calibration"
              >
                <Feather name="rotate-ccw" size={16} color={colors.primaryDark} />
                <Text style={styles.secondaryButtonText}>Restore defaults</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </SectionCard>

      <SectionCard title="Conversion preview" description="Sanity-check raw ADC values against the active profile.">
        <View style={styles.previewRow}>
          <View style={styles.previewField}>
            <Text style={styles.inputLabel}>Raw ADC</Text>
            <TextInput
              value={previewRawText}
              onChangeText={setPreviewRawText}
              keyboardType="number-pad"
              placeholder="e.g. 512"
              placeholderTextColor={colors.neutralGray}
              style={styles.input}
              accessibilityLabel="Raw ADC preview value"
            />
          </View>
          <View style={styles.previewOutput}>
            <Text style={styles.previewOutputLabel}>ESTIMATED BAC</Text>
            <Text style={styles.previewOutputValue}>
              {previewFromText?.bacGdl === null || previewFromText === null
                ? '--'
                : formatBacGdl(previewFromText.bacGdl)}
            </Text>
            <Text style={styles.previewOutputDetail}>
              {previewFromText?.mgPerL == null
                ? 'Enter a raw value'
                : `${previewFromText.mgPerL.toFixed(3)} mg/L`}
            </Text>
          </View>
        </View>
        <View style={styles.targetGrid}>
          {CALIBRATION_PREVIEW_TARGETS.map((target) => (
            <View key={target} style={styles.targetChip}>
              <Text style={styles.targetLabel}>{target.toFixed(2)} g/100ml</Text>
              <Text style={styles.targetValue}>raw ≈ {formatRawValue(targetRawForBac(target, snapshot.calibration))}</Text>
            </View>
          ))}
        </View>
        <View style={styles.livePreviewRow}>
          <View>
            <Text style={styles.inputLabel}>Current sample</Text>
            <Text style={styles.currentSampleValue}>
              raw {formatRawValue(snapshot.avg ?? snapshot.sessionPeak)} ·{' '}
              {preview.rsOhms === null ? '-- Ω' : formatResistance(preview.rsOhms)}
            </Text>
          </View>
          <View>
            <Text style={styles.previewOutputLabel}>LIVE ESTIMATE</Text>
            <Text style={styles.previewOutputValue}>{formatBacGdl(preview.bacGdl)}</Text>
          </View>
        </View>
      </SectionCard>

      <SectionCard title="Calibration history" description="Last 20 local profile changes.">
        {calibrationHistory.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="clock" size={24} color={colors.neutralGray} />
            <Text style={styles.emptyStateTitle}>No calibration changes yet</Text>
            <Text style={styles.emptyStateText}>Clean-air baselines and manual profiles will appear here.</Text>
          </View>
        ) : (
          calibrationHistory.slice(0, 6).map((entry) => (
            <View key={entry.id} style={styles.historyRow}>
              <View style={styles.historyIcon}>
                <Feather
                  name={entry.source === 'clean-air' ? 'target' : entry.source === 'reset' ? 'rotate-ccw' : 'sliders'}
                  size={16}
                  color={colors.primaryDark}
                />
              </View>
              <View style={styles.historyText}>
                <Text style={styles.historyTitle}>{calibrationHistoryLabel(entry)}</Text>
                <Text style={styles.historyDetail}>
                  {formatResistance(entry.calibration.cleanAirResistanceOhms)} ·{' '}
                  {formatRelativeTimestamp(entry.recordedAt)}
                </Text>
              </View>
              <Text style={styles.historySource}>{entry.rawSample === null ? '—' : `raw ${formatRawValue(entry.rawSample)}`}</Text>
            </View>
          ))
        )}
        {calibrationHistory.length > 0 ? (
          <Pressable
            style={styles.textButton}
            onPress={() => {
              Alert.alert('Clear calibration history?', 'This only removes local history entries. Saved records are not deleted.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Clear history',
                  style: 'destructive',
                  onPress: () => {
                    void (async () => {
                      await clearCalibrationHistory();
                      setCalibrationHistory([]);
                      setMessage('success', 'Calibration history cleared.');
                    })();
                  }
                }
              ]);
            }}
            accessibilityRole="button"
            accessibilityLabel="Clear calibration history"
          >
            <Feather name="trash-2" size={14} color={colors.errorText} />
            <Text style={styles.textButtonDanger}>Clear history</Text>
          </Pressable>
        ) : null}
      </SectionCard>
    </>
  );

  const renderActivityTab = () => (
    <>
      <SectionCard title="Capture readiness" description="All checks must pass before an evidential reading is captured.">
        <View style={styles.readinessList}>
          {readiness.map((check) => (
            <View key={check.key} style={styles.readinessRow}>
              <Feather
                name={check.ok ? 'check-circle' : 'alert-circle'}
                size={16}
                color={check.ok ? colors.success : check.tone === 'error' ? colors.error : colors.warning}
              />
              <View style={styles.readinessText}>
                <Text style={styles.readinessLabel}>{check.label}</Text>
                <Text style={styles.readinessDetail}>{check.detail}</Text>
              </View>
              <Text
                style={[
                  styles.readinessStatus,
                  check.ok ? styles.readinessStatusOk : styles.readinessStatusWaiting
                ]}
              >
                {check.ok ? 'PASS' : 'WAIT'}
              </Text>
            </View>
          ))}
        </View>
      </SectionCard>

      <SectionCard title="Live telemetry" description="Read-only values from the firmware stream.">
        <View style={styles.metricGrid}>
          <MetricTile label="RAW ADC" value={formatRawValue(snapshot.raw)} />
          <MetricTile label="SMOOTHED AVG" value={formatRawValue(snapshot.avg)} />
          <MetricTile label="DEVICE PEAK" value={formatRawValue(snapshot.devicePeak)} />
          <MetricTile label="SESSION PEAK" value={formatRawValue(snapshot.sessionPeak)} tone="success" />
          <MetricTile
            label="SIGNAL VOLTAGE"
            value={snapshot.raw === null ? '-- V' : formatVoltage((snapshot.raw * 5) / 1023)}
          />
          <MetricTile
            label="SENSOR RESISTANCE"
            value={preview.rsOhms === null ? '-- Ω' : formatResistance(preview.rsOhms)}
          />
          <MetricTile label="LIVE BAC" value={formatBacGdl(snapshot.liveBacGdl)} tone="success" />
          <MetricTile label="PEAK BAC" value={formatBacGdl(snapshot.peakBacGdl)} tone="warning" />
          <MetricTile label="SAMPLES" value={String(snapshot.readings)} />
          <MetricTile label="LAST SAMPLE" value={formatSampleAge(snapshot.lastReceivedAt)} />
        </View>
        <View style={styles.statusChipRow}>
          <View style={[styles.statusChip, snapshot.warm ? styles.statusChipWarning : styles.statusChipSuccess]}>
            <Text style={[styles.statusChipText, snapshot.warm ? styles.statusChipTextWarning : styles.statusChipTextSuccess]}>
              {snapshot.warm ? 'WARMING' : 'WARM COMPLETE'}
            </Text>
          </View>
          <View style={[styles.statusChip, snapshot.over ? styles.statusChipError : styles.statusChipSuccess]}>
            <Text style={[styles.statusChipText, snapshot.over ? styles.statusChipTextError : styles.statusChipTextSuccess]}>
              {snapshot.over ? 'THRESHOLD' : 'NORMAL'}
            </Text>
          </View>
          <View style={[styles.statusChip, snapshot.alarm ? styles.statusChipError : styles.statusChipSuccess]}>
            <Text style={[styles.statusChipText, snapshot.alarm ? styles.statusChipTextError : styles.statusChipTextSuccess]}>
              {snapshot.alarm ? 'ALARM' : 'ALARM CLEAR'}
            </Text>
          </View>
        </View>
      </SectionCard>

      <SectionCard title="Signal rail" description="The latest raw ADC samples from the connected device.">
        <View style={styles.signalRail}>
          {signalSamples.length === 0 ? (
            <Text style={styles.signalRailEmpty}>Waiting for telemetry…</Text>
          ) : (
            signalSamples.map((sample, index) => (
              <View
                key={`${index}-${sample}`}
                style={[
                  styles.signalBar,
                  {
                    height: `${Math.max(10, Math.min(100, (sample / 1023) * 100))}%`,
                    backgroundColor:
                      snapshot.over && index >= signalSamples.length - 4 ? colors.error : colors.accentBlue
                  }
                ]}
              />
            ))
          )}
        </View>
      </SectionCard>

      <SectionCard title="Diagnostics" description="Run local checks before relying on a roadside measurement.">
        <View style={styles.actionGrid}>
          <Pressable
            style={[styles.primaryButton, isRunningDiagnostic && styles.buttonDisabled]}
            onPress={() => void handleRunDiagnostic()}
            disabled={isRunningDiagnostic}
            accessibilityRole="button"
            accessibilityLabel="Run three second stream diagnostic"
          >
            {isRunningDiagnostic ? (
              <ActivityIndicator size="small" color={colors.background} />
            ) : (
              <Feather name="activity" size={16} color={colors.background} />
            )}
            <Text style={styles.primaryButtonText}>
              {isRunningDiagnostic ? 'Testing stream…' : 'Run stream test'}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.secondaryButton, lockDeviceMutations && styles.buttonDisabled]}
            onPress={handleResetSubjectPeak}
            disabled={lockDeviceMutations}
            accessibilityRole="button"
            accessibilityLabel="Reset subject peak"
          >
            <Feather name="refresh-ccw" size={16} color={colors.primaryDark} />
            <Text style={styles.secondaryButtonText}>
              {lockDeviceMutations ? 'Peak locked during test' : 'Reset subject peak'}
            </Text>
          </Pressable>
          <Pressable
            style={styles.secondaryButton}
            onPress={handlePreviewCapture}
            accessibilityRole="button"
            accessibilityLabel="Preview a test capture"
          >
            <Feather name="eye" size={16} color={colors.primaryDark} />
            <Text style={styles.secondaryButtonText}>Preview capture</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => void handleShareReport()}
            accessibilityRole="button"
            accessibilityLabel="Share diagnostic report"
          >
            <Feather name="share" size={16} color={colors.primaryDark} />
            <Text style={styles.secondaryButtonText}>Share report</Text>
          </Pressable>
        </View>
        {diagnosticResult ? (
          <View style={[styles.diagnosticResult, diagnosticResult.ok ? styles.diagnosticResultOk : styles.diagnosticResultError]}>
            <Feather
              name={diagnosticResult.ok ? 'check-circle' : 'alert-circle'}
              size={18}
              color={diagnosticResult.ok ? colors.successText : colors.errorText}
            />
            <View style={styles.diagnosticResultText}>
              <Text style={styles.diagnosticResultTitle}>
                {diagnosticResult.ok ? 'Stream healthy' : 'Stream needs attention'}
              </Text>
              <Text style={styles.diagnosticResultDetail}>{diagnosticResult.detail}</Text>
            </View>
          </View>
        ) : null}
      </SectionCard>

      {renderHistoryTab()}
    </>
  );

  const renderHistoryTab = () => (
    <>
      <SectionCard title="Local custody history" description="Records stored on this phone for the signed-in officer.">
        <View style={styles.profileGrid}>
          <MetricTile label="LOCAL RECORDS" value={String(historySummary.totalLocalRecords)} />
          <MetricTile
            label="DEVICE CAPTURES"
            value={String(historySummary.deviceCapturedRecords)}
            tone="success"
          />
          <MetricTile label="PENDING SYNC" value={String(historySummary.pendingLocalRecords)} tone="warning" />
          <MetricTile label="FAILED SYNC" value={String(historySummary.failedLocalRecords)} tone="error" />
        </View>
        <View style={styles.historyRow}>
          <View style={styles.historyIcon}>
            <Feather name="clock" size={16} color={colors.primaryDark} />
          </View>
          <View style={styles.historyText}>
            <Text style={styles.historyTitle}>Last device capture</Text>
            <Text style={styles.historyDetail}>{formatRelativeTimestamp(historySummary.lastDeviceCapturedAt)}</Text>
          </View>
        </View>
      </SectionCard>

      <SectionCard title="By device serial" description="Custody totals recorded in local test records.">
        {historySummary.bySerial.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="database" size={24} color={colors.neutralGray} />
            <Text style={styles.emptyStateTitle}>No device captures yet</Text>
            <Text style={styles.emptyStateText}>Capture a breathalyzer reading to populate custody history.</Text>
          </View>
        ) : (
          historySummary.bySerial.map((item) => (
            <View key={item.serial} style={styles.historyRow}>
              <View style={styles.historyIcon}>
                <Feather name="cpu" size={16} color={colors.primaryDark} />
              </View>
              <View style={styles.historyText}>
                <Text style={styles.historyTitle}>{item.serial}</Text>
                <Text style={styles.historyDetail}>
                  {item.count} capture{item.count === 1 ? '' : 's'} · last {formatRelativeTimestamp(item.lastCapturedAt)}
                </Text>
              </View>
              <Text style={styles.historySource}>
                {item.averageSessionPeakRaw === null ? '--' : `avg peak ${formatRawValue(item.averageSessionPeakRaw)}`}
              </Text>
            </View>
          ))
        )}
      </SectionCard>

      <SectionCard title="By transport" description="Bluetooth Classic and simulated capture counts.">
        {historySummary.byTransport.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="bar-chart-2" size={24} color={colors.neutralGray} />
            <Text style={styles.emptyStateTitle}>No transport history yet</Text>
            <Text style={styles.emptyStateText}>Device transport totals will appear after the first capture.</Text>
          </View>
        ) : (
          historySummary.byTransport.map((item) => (
            <View key={item.transport} style={styles.historyRow}>
              <View style={styles.historyIcon}>
                <Feather name={item.transport === 'bluetooth_classic' ? 'bluetooth' : 'cpu'} size={16} color={colors.primaryDark} />
              </View>
              <View style={styles.historyText}>
                <Text style={styles.historyTitle}>
                  {item.transport === 'bluetooth_classic' ? 'Bluetooth Classic (SPP)' : item.transport}
                </Text>
                <Text style={styles.historyDetail}>
                  {item.count} capture{item.count === 1 ? '' : 's'} · last {formatRelativeTimestamp(item.lastCapturedAt)}
                </Text>
              </View>
            </View>
          ))
        )}
      </SectionCard>

      <SectionCard title="Policy limits" description="Role-safe limits used for pass/fail classification.">
        {runtimeConfig ? (
          runtimeConfig.bacLimits.map((limit) => (
            <View key={limit.key} style={styles.policyRow}>
              <Text style={styles.policyLabel}>{limit.label}</Text>
              <Text style={styles.policyValue}>{limit.limitG100ml.toFixed(3)} g/100ml</Text>
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Feather name="cloud-off" size={22} color={colors.neutralGray} />
            <Text style={styles.emptyStateTitle}>Policy limits unavailable offline</Text>
            <Text style={styles.emptyStateText}>The last loaded policy remains active. Reconnect to refresh it.</Text>
          </View>
        )}
      </SectionCard>

      <View style={styles.noteCard}>
        <Feather name="shield" size={16} color={colors.accentBlue} />
        <Text style={styles.noteText}>
          Device settings and calibration history stay on this phone. Captured test records include transport, firmware serial, calibration version, and raw sensor values in their custody hash.
        </Text>
      </View>
    </>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerLeading}>
              <View style={styles.headerIcon}>
                <Feather name="bluetooth" size={22} color={colors.background} />
              </View>
              <View>
                <Text style={styles.headerEyebrow}>FIELD DEVICE</Text>
                <Text style={styles.headerTitle}>Breathalyser console</Text>
              </View>
            </View>
            <Pressable
              style={styles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close breathalyser console"
              hitSlop={10}
            >
              <Feather name="x" size={22} color={colors.background} />
            </Pressable>
          </View>

          <View style={[styles.deviceHero, { borderColor: status.color }]}>
            <View style={styles.deviceHeroTop}>
              <View style={[styles.deviceHeroIcon, { backgroundColor: status.background }]}>
                <Feather name="bluetooth" size={22} color={status.color} />
              </View>
              <View style={styles.deviceHeroText}>
                <Text style={styles.deviceHeroTitle}>{deviceIdentity}</Text>
                <Text style={styles.deviceHeroDetail}>{status.detail}</Text>
              </View>
              <View style={[styles.deviceHeroBadge, { backgroundColor: status.background }]}>
                <View style={[styles.statusDot, { backgroundColor: status.color }]} />
                <Text style={[styles.statusChipText, { color: status.color }]}>{status.label}</Text>
              </View>
            </View>
            <View style={styles.signalRailHero}>
              {signalSamples.length === 0 ? (
                <View style={styles.signalRailHeroEmpty}>
                  <Text style={styles.signalRailHeroEmptyText}>Signal rail waiting for telemetry</Text>
                </View>
              ) : (
                signalSamples.map((sample, index) => (
                  <View
                    key={`hero-${index}-${sample}`}
                    style={[
                      styles.signalBarHero,
                      {
                        height: `${Math.max(12, Math.min(100, (sample / 1023) * 100))}%`,
                        backgroundColor: index >= signalSamples.length - 3 ? status.color : 'rgba(64, 150, 254, 0.75)'
                      }
                    ]}
                  />
                ))
              )}
            </View>
            <View style={styles.deviceHeroStats}>
              <View style={styles.deviceHeroStat}>
                <Text style={styles.deviceHeroStatLabel}>SERIAL</Text>
                <Text style={styles.deviceHeroStatValue}>{snapshot.deviceSerial ?? 'Not reported'}</Text>
              </View>
              <View style={styles.deviceHeroStat}>
                <Text style={styles.deviceHeroStatLabel}>SAMPLES</Text>
                <Text style={styles.deviceHeroStatValue}>{snapshot.readings}</Text>
              </View>
              <View style={styles.deviceHeroStat}>
                <Text style={styles.deviceHeroStatLabel}>PEAK BAC</Text>
                <Text style={styles.deviceHeroStatValue}>{formatBacGdl(snapshot.peakBacGdl)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.tabBar}>
            {TABS.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  style={[styles.tabButton, active && styles.tabButtonActive]}
                  onPress={() => setActiveTab(tab.key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${tab.label} settings tab`}
                >
                  <Feather name={tab.icon} size={16} color={active ? colors.primaryDark : colors.textSecondary} />
                  <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {activeTab === 'device' ? renderDeviceTab() : null}
            {activeTab === 'connect' ? renderConnectTab() : null}
            {activeTab === 'calibration' ? renderCalibrationTab() : null}
            {activeTab === 'activity' ? renderActivityTab() : null}
          </ScrollView>

        </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

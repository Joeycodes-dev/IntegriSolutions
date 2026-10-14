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
  cleanAirRaw,
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
  buildSetupSteps,
  calibrationBlockReason,
  calibrationHistoryLabel,
  calibrationPreview,
  blowStateGuidance,
  createManualCalibration,
  formatRawValue,
  formatRelativeTimestamp,
  formatResistance,
  formatSampleAge,
  formatVoltage,
  hasSensorFault,
  isBaselineSet,
  sensorFaultMessage,
  statusFromSnapshot,
  summarizeDeviceHistory,
  targetRawForBac,
  toCalibrationDraft,
  warmupSecondsRemaining,
  type CalibrationDraft,
  type ConsoleTab,
  type DeviceHistorySummary,
  type DeviceStatusTone,
  type SetupStep
} from '../lib/deviceSettings';
import { appendSignalSample, signalTrend, type SignalSample } from '../lib/signalChart';

import { LiveSignalChart } from './LiveSignalChart';
import { styles } from './DeviceSettingsModal.styles';
import { colors } from '../styles/colors';

const SIMULATION_ENABLED =
  __DEV__ || process.env.EXPO_PUBLIC_BREATHALYZER_SIMULATION === '1';
const DIAGNOSTIC_WINDOW_MS = 3_000;
const CALIBRATION_PREVIEW_TARGETS = [0.02, 0.05, 0.08] as const;

const STATUS_TONE_STYLES: Record<
  DeviceStatusTone,
  { color: string; background: string }
> = {
  success: { color: colors.success, background: 'rgba(34, 197, 94, 0.16)' },
  warning: { color: colors.warning, background: 'rgba(245, 158, 11, 0.16)' },
  danger: { color: colors.error, background: 'rgba(220, 38, 38, 0.14)' },
  neutral: { color: colors.neutralGray, background: 'rgba(155, 165, 183, 0.16)' }
};

/**
 * The upgraded HC-06 firmware accepts `CAL <ohms>` so the device converts raw
 * values with the same clean-air baseline the app persists. Older one-way
 * firmware ignores it, so the write is fire-and-forget.
 */
function syncCalibrationToFirmware(cleanAirResistanceOhms: number): void {
  const session = breathalyzerSession as Partial<{
    sendCommand?: (command: string) => void;
  }>;
  void session.sendCommand?.(`CAL ${Math.round(cleanAirResistanceOhms)}`);
}

/**
 * The paired-device scanner takes an options bag so renamed HC-06 modules can be
 * listed. Bridged through a loose signature so this console builds against the
 * current service typing.
 */
type PairedDeviceScanOptions = { includeAllClassic?: boolean };

const scanPairedHc06Devices = async (
  options: PairedDeviceScanOptions,
): Promise<PairedBluetoothDevice[]> => {
  const scan = getPairedHc06Devices as unknown as (
    runtime: null | undefined,
    options?: PairedDeviceScanOptions,
  ) => Promise<PairedBluetoothDevice[]>;
  return scan(undefined, options);
};

export type DeviceSettingsTab = ConsoleTab;

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

type PreviewCaptureResult = {
  raw: number;
  bacGdl: number;
  createdAt: string;
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
  { key: 'connect', label: 'Connect', icon: 'bluetooth' },
  { key: 'calibrate', label: 'Calibrate', icon: 'sliders' },
  { key: 'live', label: 'Live', icon: 'activity' }
];

function statusVisual(snapshot: BreathalyzerSnapshot): {
  label: string;
  detail: string;
  color: string;
  background: string;
} {
  const status = statusFromSnapshot(snapshot);
  const toneStyle = STATUS_TONE_STYLES[status.tone];
  return {
    label: status.label,
    detail: status.detail,
    color: toneStyle.color,
    background: toneStyle.background
  };
}

function MetricTile({
  label,
  value,
  detail,
  tone = 'neutral',
  fullWidth = false
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: 'neutral' | 'success' | 'warning' | 'error';
  fullWidth?: boolean;
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
    <View
      style={[styles.metricTile, toneStyle, fullWidth ? styles.metricTileFull : null]}
    >
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

const STEP_STATE_WORDS: Record<SetupStep['state'], string> = {
  done: 'done',
  current: 'in progress',
  waiting: 'waiting',
  attention: 'needs attention',
  optional: 'optional'
};

function StepperItem({ step, onPress }: { step: SetupStep; onPress: () => void }) {
  const state = step.state;
  const circleStyle =
    state === 'done'
      ? styles.stepperCircleDone
      : state === 'current'
        ? styles.stepperCircleCurrent
        : state === 'attention'
          ? styles.stepperCircleAttention
          : state === 'optional'
            ? styles.stepperCircleOptional
            : null;
  const accentColor =
    state === 'done'
      ? colors.success
      : state === 'attention'
        ? colors.error
        : state === 'current'
          ? colors.accentBlue
          : colors.neutralGray;
  const labelActive = state === 'done' || state === 'current' || state === 'attention';

  return (
    <Pressable
      style={styles.stepperItem}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${step.label}: ${STEP_STATE_WORDS[state]}. ${step.detail}`}
    >
      <View style={[styles.stepperCircle, circleStyle]}>
        {state === 'done' ? (
          <Feather name="check" size={14} color={colors.background} />
        ) : state === 'attention' ? (
          <Feather name="alert-circle" size={14} color={colors.background} />
        ) : state === 'current' ? (
          <View style={styles.stepperDot} />
        ) : null}
      </View>
      <Text style={[styles.stepperLabel, !labelActive && styles.stepperLabelMuted]}>
        {step.label}
      </Text>
      {state === 'optional' ? (
        <Text style={styles.stepperOptionalText}>Optional</Text>
      ) : null}
    </Pressable>
  );
}

function Disclosure({
  title,
  summary,
  expanded,
  onToggle,
  children
}: {
  title: string;
  summary?: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      <Pressable
        style={styles.disclosureHeader}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={title}
      >
        <View style={styles.sectionHeaderText}>
          <Text style={styles.disclosureTitle}>{title}</Text>
          {summary ? <Text style={styles.sectionDescription}>{summary}</Text> : null}
        </View>
        <Feather
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.primaryDark}
        />
      </Pressable>
      {expanded ? <View style={styles.disclosureContent}>{children}</View> : null}
    </View>
  );
}

export function DeviceSettingsModal({
  visible,
  initialTab,
  onClose,
  snapshot,
  runtimeConfig,
  profile,
  lockDeviceMutations = false
}: DeviceSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<DeviceSettingsTab>(initialTab ?? 'connect');
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
  const [previewCaptureResult, setPreviewCaptureResult] = useState<PreviewCaptureResult | null>(null);
  const [inlineMessage, setInlineMessage] = useState<InlineMessage | null>(null);
  const [calibrationDraft, setCalibrationDraft] = useState<CalibrationDraft>(() =>
    toCalibrationDraft(snapshot.calibration),
  );
  const [calibrationError, setCalibrationError] = useState<string | null>(null);
  const [showAdvancedCalibration, setShowAdvancedCalibration] = useState(false);
  // Which optional sections are open. Keys match the Disclosure titles.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [calibrationHistory, setCalibrationHistory] = useState<CalibrationHistoryEntry[]>([]);
  const [historySummary, setHistorySummary] = useState<DeviceHistorySummary>(() =>
    summarizeDeviceHistory([]),
  );
  const [previewRawText, setPreviewRawText] = useState('');
  const [signalSamples, setSignalSamples] = useState<SignalSample[]>([]);
  const [showAllPairedClassic, setShowAllPairedClassic] = useState(false);
  const autoConnectAttemptedRef = useRef(false);
  const deviceListRequestRef = useRef(0);
  const initialLoadRequestRef = useRef(0);

  const status = useMemo(() => statusVisual(snapshot), [snapshot]);
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

  const isSectionOpen = (key: string) => openSections[key] === true;
  const toggleSection = (key: string) =>
    setOpenSections((current) => ({ ...current, [key]: !current[key] }));

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
        setActiveTab('live');
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
      const devices = await scanPairedHc06Devices({
        includeAllClassic: showAllPairedClassic
      });
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

  const handleToggleShowAllPairedClassic = (value: boolean) => {
    setShowAllPairedClassic(value);
    // Renamed modules only appear in the wider scan, so refresh immediately
    // instead of waiting for the officer to tap "Scan paired devices".
    void refreshPairedDevices(undefined, { autoConnect: false });
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
    syncCalibrationToFirmware(next.cleanAirResistanceOhms);
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
      setPreviewCaptureResult(null);
      setMessage('error', 'No live sample is available for a preview capture.');
      return;
    }
    const result = calibrationPreview(raw, snapshot.calibration);
    if (result.bacGdl === null) {
      setPreviewCaptureResult(null);
      setMessage('error', 'The current calibration cannot convert this sample.');
      return;
    }

    setInlineMessage(null);
    setPreviewCaptureResult({
      raw,
      bacGdl: result.bacGdl,
      createdAt: new Date().toISOString(),
    });
  };

  const handleConnectSimulator = async () => {
    if (lockDeviceMutations) {
      setMessage('info', 'Finish or cancel the current test before connecting.');
      return;
    }
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
    setInlineMessage(null);
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
    if (!ok) {
      setMessage('error', result.detail);
    }
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
    setActiveTab(
      initialTab ??
        (snapshot.connection === 'connected' || snapshot.connection === 'connecting'
          ? 'live'
          : 'connect'),
    );
    setInlineMessage(null);
    setDiagnosticResult(null);
    setPreviewCaptureResult(null);
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
    if (snapshot.readings === 0 || snapshot.avg === null) {
      setSignalSamples([]);
      return;
    }
    const value = snapshot.avg;
    setSignalSamples((current) =>
      appendSignalSample(current, { value, over: snapshot.over, at: Date.now() }),
    );
  }, [snapshot.readings]);

  useEffect(() => {
    setCalibrationDraft(toCalibrationDraft(snapshot.calibration));
  }, [snapshot.calibration]);
const pairedDeviceRows =
    Platform.OS !== 'android' ? (
      <View style={styles.emptyState}>
        <Feather name="smartphone" size={24} color={colors.neutralGray} />
        <Text style={styles.emptyStateTitle}>Bluetooth runs in the Android app</Text>
        <Text style={styles.emptyStateText}>
          Use test mode below to rehearse this console on this device.
        </Text>
      </View>
    ) : pairedDevices.length === 0 ? (
      <View style={styles.emptyState}>
        <Feather name="bluetooth" size={24} color={colors.neutralGray} />
        <Text style={styles.emptyStateTitle}>No breathalyser found</Text>
        <Text style={styles.emptyStateText}>
          Pair the HC-06 in Android Bluetooth settings (PIN 1234 or 0000), then tap Find my
          breathalysers.
        </Text>
        <View style={styles.actionGrid}>
          {[
            'Switch the breathalyser on. Its light should blink.',
            'Open Android Bluetooth settings and pair the HC-06.',
            'Come back here and tap Find my breathalysers.'
          ].map((step) => (
            <View key={step} style={styles.numberedStep}>
              <Text style={styles.numberedStepText}>{step}</Text>
            </View>
          ))}
        </View>
      </View>
    ) : (
      <>
        {pairedDevices.map((device) => {
          const isActive =
            snapshot.connection === 'connected' && snapshot.deviceAddress === device.address;
          const isPreferred = device.address === preferences.preferredDeviceAddress;
          const isBusy = busyDeviceAddress === device.address;
          const actionLabel = isActive
            ? 'Connected'
            : deviceConnectionLocked
              ? 'Locked'
              : isPreferred
                ? 'Reconnect'
                : 'Connect';
          return (
            <View key={device.address} style={styles.deviceRow}>
              <View
                style={[
                  styles.deviceIcon,
                  isPreferred ? styles.deviceIconPreferred : null
                ]}
              >
                <Feather
                  name="bluetooth"
                  size={16}
                  color={isPreferred ? colors.accentBlue : colors.textSecondary}
                />
              </View>
              <View style={styles.deviceRowText}>
                <Text style={styles.deviceRowTitle}>{device.name || 'HC-06 module'}</Text>
                <Text style={styles.deviceAddress}>{device.address}</Text>
              </View>
              {isActive ? (
                <View style={[styles.deviceTag, styles.deviceTagConnected]}>
                  <Text style={[styles.deviceTagText, styles.deviceTagConnectedText]}>
                    Connected
                  </Text>
                </View>
              ) : isPreferred ? (
                <View style={[styles.deviceTag, styles.deviceTagSaved]}>
                  <Text style={[styles.deviceTagText, styles.deviceTagSavedText]}>Saved</Text>
                </View>
              ) : null}
              <Pressable
                style={[styles.rowAction, actionLabel === 'Connected' ? styles.rowActionDisabled : null]}
                onPress={() => void connectDevice(device)}
                disabled={isActive || deviceConnectionLocked || isBusy || isDisconnecting}
                accessibilityRole="button"
                accessibilityLabel={`${actionLabel} ${device.name || 'HC-06 module'}`}
                accessibilityState={{ disabled: isActive || deviceConnectionLocked || isBusy }}
              >
                <Text
                  style={[
                    styles.rowActionText,
                    actionLabel === 'Connected' ? styles.rowActionDisabled : null
                  ]}
                >
                  {isBusy ? 'Connecting…' : actionLabel}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </>
    );
const renderConnectTab = () => (
    <>
      <SectionCard
        title="Connect"
        description="Pair once in Android Bluetooth settings, then connect here."
      >
        {snapshot.connection === 'connected' || snapshot.connection === 'connecting' ? (
          <View style={styles.connectedRow}>
            <View style={[styles.connectedDot, { backgroundColor: status.color }]} />
            <Text style={styles.connectedText}>Connected to {deviceIdentity}</Text>
            <Pressable
              style={[
                styles.rowAction,
                deviceConnectionLocked ? styles.rowActionDisabled : null
              ]}
              onPress={handleDisconnect}
              disabled={deviceConnectionLocked || isDisconnecting}
              accessibilityRole="button"
              accessibilityLabel="Disconnect breathalyser"
              accessibilityState={{ disabled: deviceConnectionLocked }}
            >
              <Text
                style={[
                  styles.rowActionText,
                  deviceConnectionLocked ? styles.rowActionDisabled : null
                ]}
              >
                {deviceConnectionLocked ? 'Locked during test' : 'Disconnect'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <Pressable
          style={[styles.primaryButton, isLoadingDevices ? styles.buttonDisabled : null]}
          onPress={() => void refreshPairedDevices(undefined, { autoConnect: true })}
          disabled={isLoadingDevices}
          accessibilityRole="button"
          accessibilityLabel="Find my breathalysers"
          accessibilityState={{ disabled: isLoadingDevices }}
        >
          {isLoadingDevices ? (
            <ActivityIndicator size="small" color={colors.background} />
          ) : (
            <Feather name="search" size={16} color={colors.background} />
          )}
          <Text style={styles.primaryButtonText}>
            {isLoadingDevices ? 'Looking for breathalysers…' : 'Find my breathalysers'}
          </Text>
        </Pressable>

        <Pressable
          style={styles.secondaryButton}
          onPress={() => void handleOpenBluetoothSettings()}
          accessibilityRole="button"
          accessibilityLabel="Pair a new breathalyser"
        >
          <Feather name="plus" size={16} color={colors.primaryDark} />
          <Text style={styles.secondaryButtonText}>Pair a new breathalyser</Text>
        </Pressable>

        <Pressable
          style={styles.textButton}
          onPress={() => void handleOpenAppSettings()}
          accessibilityRole="button"
          accessibilityLabel="Check Bluetooth permissions"
        >
          <Feather name="lock" size={15} color={colors.primaryDark} />
          <Text style={styles.textButtonLabel}>Check Bluetooth permissions</Text>
        </Pressable>

        {Platform.OS !== 'android' ? (
          <View style={styles.noteCard}>
            <Feather name="info" size={16} color={colors.accentBlue} />
            <Text style={styles.noteText}>
              The Bluetooth connection runs in the Android app. Use test mode below to rehearse on
              this device.
            </Text>
          </View>
        ) : null}

        {deviceConnectionLocked ? (
          <View style={styles.warningNote}>
            <Feather name="lock" size={16} color={colors.alertHighAccent} />
            <Text style={styles.warningNoteText}>
              Device changes are locked until the current roadside test is saved or cancelled.
            </Text>
          </View>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Your breathalysers"
        description="Paired with this phone."
      >
        {pairedDeviceRows}

        <Disclosure
          title="Can't see your breathalyser?"
          expanded={showAllPairedClassic}
          onToggle={() => handleToggleShowAllPairedClassic(!showAllPairedClassic)}
        >
          <Text style={styles.noteText}>
            Renamed modules are hidden by the HC-06 name filter. Turn this on to list every paired
            Bluetooth device.
          </Text>
          {Platform.OS === 'android' ? (
            <ToggleRow
              label="Show all paired Bluetooth devices"
              detail="Lists every paired module, not only ones still named HC-06."
              value={showAllPairedClassic}
              onValueChange={handleToggleShowAllPairedClassic}
            />
          ) : null}
        </Disclosure>
      </SectionCard>
<SectionCard
        title="Connection options"
        description="Saved on this phone."
      >
        <ToggleRow
          label="Reconnect automatically"
          detail="Reconnect the saved breathalyser when this screen opens."
          value={preferences.autoConnectPreferredDevice}
          onValueChange={(value) => void handleToggleAutoConnect(value)}
        />
        <ToggleRow
          label="Ask before disconnecting"
          detail="Show a confirmation before ending a live stream."
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
          accessibilityLabel="Forget saved breathalyser"
          accessibilityState={{ disabled: !preferences.preferredDeviceAddress }}
        >
          <Feather name="trash-2" size={15} color={colors.errorText} />
          <Text style={styles.textButtonDanger}>Forget saved breathalyser</Text>
        </Pressable>
      </SectionCard>

      {SIMULATION_ENABLED && snapshot.connection !== 'connected' ? (
        <SectionCard
          title="Test mode"
          description="Simulated breathalyser for training and rehearsal. Test-mode records are labelled as simulated."
        >
          <Pressable
            style={[
              styles.secondaryButton,
              Boolean(busyDeviceAddress) ||
              snapshot.connection === 'connecting' ||
              lockDeviceMutations
                ? styles.buttonDisabled
                : null
            ]}
            onPress={() => void handleConnectSimulator()}
            disabled={
              Boolean(busyDeviceAddress) ||
              snapshot.connection === 'connecting' ||
              lockDeviceMutations
            }
            accessibilityRole="button"
            accessibilityLabel="Start simulated breathalyser"
            accessibilityState={{
              disabled:
                Boolean(busyDeviceAddress) ||
                snapshot.connection === 'connecting' ||
                lockDeviceMutations
            }}
          >
            <Feather name="cpu" size={16} color={colors.primaryDark} />
            <Text style={styles.secondaryButtonText}>Start simulated breathalyser</Text>
          </Pressable>
        </SectionCard>
      ) : null}
    </>
  );
const renderCalibrateTab = () => {
    const baselineBlockReason = calibrationBlockReason(snapshot, {
      locked: lockDeviceMutations
    });
    const baselineSet = isBaselineSet(snapshot.calibration);
    const warmupSeconds = warmupSecondsRemaining(snapshot);

    return (
      <>
        <SectionCard
          title="Clean-air baseline"
          description="Tells the app what clean air reads on this sensor."
        >
          <View style={styles.calibrationHero}>
            <Text style={styles.calibrationHeroLabel}>Current baseline</Text>
            <Text style={styles.calibrationHeroValue}>
              {formatResistance(snapshot.calibration.cleanAirResistanceOhms)}
            </Text>
            <Text style={styles.calibrationHeroMeta}>
              {baselineSet
                ? 'Set from a clean-air sample on this phone.'
                : 'Factory default. Not set on this phone yet.'}
            </Text>
            {calibrationHistory.length > 0 ? (
              <Text style={styles.calibrationHeroMeta}>
                Last changed {formatRelativeTimestamp(calibrationHistory[0].recordedAt)}
              </Text>
            ) : null}
          </View>

          <Text style={styles.subSectionTitle}>How to set it</Text>
          {[
            'Take the breathalyser to clean, fresh air, away from people, vehicles and alcohol.',
            'Wait until the status shows Ready and the signal is steady.',
            'Tap Set clean-air baseline.'
          ].map((step) => (
            <View key={step} style={styles.numberedStep}>
              <Text style={styles.numberedStepText}>{step}</Text>
            </View>
          ))}

          <View style={styles.chipRow}>
            <View
              style={[
                styles.chip,
                snapshot.connection === 'connected'
                  ? styles.chipSuccess
                  : styles.chipNeutral
              ]}
            >
              <Text style={styles.chipLabel}>Connection</Text>
              <Text style={styles.chipValue}>
                {snapshot.connection === 'connected' ? 'Connected' : 'Not connected'}
              </Text>
            </View>
            <View
              style={[
                styles.chip,
                snapshot.warm === true
                  ? styles.chipWarning
                  : snapshot.readings > 0
                    ? styles.chipSuccess
                    : styles.chipNeutral
              ]}
            >
              <Text style={styles.chipLabel}>Warm-up</Text>
              <Text style={styles.chipValue}>
                {snapshot.warm === true
                  ? warmupSeconds === null
                    ? 'Warming up'
                    : `${warmupSeconds} s left`
                  : 'Done'}
              </Text>
            </View>
            <View
              style={[
                styles.chip,
                hasSensorFault(snapshot)
                  ? styles.chipDanger
                  : snapshot.sampleStable === false
                    ? styles.chipWarning
                    : styles.chipSuccess
              ]}
            >
              <Text style={styles.chipLabel}>Signal</Text>
              <Text style={styles.chipValue}>
                {hasSensorFault(snapshot)
                  ? 'Fault'
                  : snapshot.sampleStable === false
                    ? 'Settling'
                    : 'Steady'}
              </Text>
            </View>
          </View>

          <Pressable
            style={[
              styles.primaryButton,
              baselineBlockReason ? styles.buttonDisabled : null
            ]}
            onPress={() => void handleCalibrateFromCleanAir()}
            disabled={baselineBlockReason !== null}
            accessibilityRole="button"
            accessibilityLabel="Set clean-air baseline"
            accessibilityState={{ disabled: baselineBlockReason !== null }}
          >
            <Feather name="check-circle" size={16} color={colors.background} />
            <Text style={styles.primaryButtonText}>Set clean-air baseline</Text>
          </Pressable>
          <Text style={styles.footnoteText}>
            {baselineBlockReason ??
              'Uses the current clean-air reading. The device and the app both update.'}
          </Text>

          <View style={styles.warningNote}>
            <Feather name="alert-triangle" size={16} color={colors.alertHighAccent} />
            <Text style={styles.warningNoteText}>
              Use clean air only. Do not calibrate from breath or an alcohol sample unless you are
              using an approved calibrated reference system.
            </Text>
          </View>
        </SectionCard>
<SectionCard
          title="Advanced sensor settings"
          description="Only for calibration authorities."
        >
          {showAdvancedCalibration ? (
            <>
          <View style={styles.warningNote}>
            <Feather name="alert-triangle" size={16} color={colors.alertHighAccent} />
            <Text style={styles.warningNoteText}>
              Only change these when your calibration authority or the sensor datasheet tells you
              to. They change how a raw sensor reading becomes a BAC estimate.
            </Text>
          </View>
          <Pressable
            style={styles.textButton}
            onPress={() => setShowAdvancedCalibration(false)}
            accessibilityRole="button"
            accessibilityLabel="Hide advanced settings"
          >
            <Feather name="chevron-up" size={15} color={colors.primaryDark} />
            <Text style={styles.textButtonLabel}>Hide advanced settings</Text>
          </Pressable>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Load resistor (RL)</Text>
            <Text style={styles.summaryValue}>
              {formatResistance(snapshot.calibration.loadResistorOhms)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Clean-air resistance (R0)</Text>
            <Text style={styles.summaryValue}>
              {formatResistance(snapshot.calibration.cleanAirResistanceOhms)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Reference strength at ratio 1</Text>
            <Text style={styles.summaryValue}>
              {snapshot.calibration.mgPerLAtRatioOne.toFixed(3)} mg/L
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Curve slope</Text>
            <Text style={styles.summaryValue}>
              {snapshot.calibration.curveSlope.toFixed(2)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Clean-air ratio</Text>
            <Text style={styles.summaryValue}>
              {snapshot.calibration.cleanAirRatio.toFixed(1)}
            </Text>
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Load resistor (RL), ohms</Text>
            <Text style={styles.fieldHint}>Resistor on the sensor board. Default 1,000 ohms.</Text>
            <TextInput
              style={styles.input}
              value={calibrationDraft.loadResistorOhms}
              onChangeText={(value) =>
                setCalibrationDraft((current) => ({ ...current, loadResistorOhms: value }))
              }
              keyboardType="numeric"
              placeholder="1000"
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel="Load resistor (RL), ohms"
            />
          </View>
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Clean-air resistance (R0), ohms</Text>
            <Text style={styles.fieldHint}>Set automatically by the clean-air baseline.</Text>
            <TextInput
              style={styles.input}
              value={calibrationDraft.cleanAirResistanceOhms}
              onChangeText={(value) =>
                setCalibrationDraft((current) => ({ ...current, cleanAirResistanceOhms: value }))
              }
              keyboardType="numeric"
              placeholder="60000"
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel="Clean-air resistance (R0), ohms"
            />
          </View>
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Reference strength at ratio 1, mg/L</Text>
            <Text style={styles.fieldHint}>Constant from the sensor curve.</Text>
            <TextInput
              style={styles.input}
              value={calibrationDraft.mgPerLAtRatioOne}
              onChangeText={(value) =>
                setCalibrationDraft((current) => ({ ...current, mgPerLAtRatioOne: value }))
              }
              keyboardType="numeric"
              placeholder="0.400"
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel="Reference strength at ratio 1, mg/L"
            />
          </View>
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Curve slope</Text>
            <Text style={styles.fieldHint}>Negative value from the sensor curve.</Text>
            <TextInput
              style={styles.input}
              value={calibrationDraft.curveSlope}
              onChangeText={(value) =>
                setCalibrationDraft((current) => ({ ...current, curveSlope: value }))
              }
              keyboardType="numeric"
              placeholder="-0.4"
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel="Curve slope"
            />
          </View>
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Clean-air ratio</Text>
            <Text style={styles.fieldHint}>Default 60.</Text>
            <TextInput
              style={styles.input}
              value={calibrationDraft.cleanAirRatio}
              onChangeText={(value) =>
                setCalibrationDraft((current) => ({ ...current, cleanAirRatio: value }))
              }
              keyboardType="numeric"
              placeholder="60"
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel="Clean-air ratio"
            />
          </View>
<Text style={styles.subSectionTitle}>Check a raw value</Text>
          <Text style={styles.noteText}>
            Type one raw sensor value to see the BAC estimate it produces on this phone.
          </Text>
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Raw sensor value (0–1023)</Text>
            <TextInput
              style={styles.input}
              value={previewRawText}
              onChangeText={setPreviewRawText}
              keyboardType="numeric"
              placeholder="e.g. 512"
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel="Raw sensor value"
            />
          </View>
          <View style={styles.previewOutput}>
            <Text style={styles.previewOutputLabel}>Estimated BAC</Text>
            <Text style={styles.previewOutputValue}>
              {previewFromText ? formatBacGdl(previewFromText.bacGdl) : '--'}
              <Text style={styles.previewOutputDetail}> g/100ml</Text>
            </Text>
            <Text style={styles.previewOutputDetail}>
              {previewFromText === null || previewFromText.mgPerL === null
                ? '--'
                : `${previewFromText.mgPerL.toFixed(3)} mg/L`}
            </Text>
          </View>
          <Text style={styles.subSectionTitle}>Raw values for common BAC levels</Text>
          <View style={styles.chipRow}>
            {CALIBRATION_PREVIEW_TARGETS.map((target) => (
              <View key={target} style={[styles.targetChip, styles.chipNeutral]}>
                <Text style={styles.targetLabel}>{target.toFixed(2)} g/100ml</Text>
                <Text style={styles.targetValue}>
                  {formatRawValue(targetRawForBac(target, snapshot.calibration))}
                </Text>
              </View>
            ))}
          </View>
        <View style={styles.actionGrid}>
            <Pressable
              style={[styles.primaryButton, lockDeviceMutations ? styles.buttonDisabled : null]}
              onPress={() => void handleApplyCalibration()}
              disabled={lockDeviceMutations}
              accessibilityRole="button"
              accessibilityLabel="Apply settings"
              accessibilityState={{ disabled: lockDeviceMutations }}
            >
              <Feather name="save" size={16} color={colors.background} />
              <Text style={styles.primaryButtonText}>Apply settings</Text>
            </Pressable>
            <Pressable
              style={[
                styles.secondaryButton,
                lockDeviceMutations ? styles.buttonDisabled : null
              ]}
              onPress={handleResetCalibration}
              disabled={lockDeviceMutations}
              accessibilityRole="button"
              accessibilityLabel="Restore factory defaults"
              accessibilityState={{ disabled: lockDeviceMutations }}
            >
              <Feather name="rotate-ccw" size={16} color={colors.primaryDark} />
              <Text style={styles.secondaryButtonText}>Restore factory defaults</Text>
            </Pressable>
          </View>
          {calibrationError ? <Text style={styles.errorText}>{calibrationError}</Text> : null}
          </>
        ) : (
          <Pressable
            style={styles.textButton}
            onPress={() => setShowAdvancedCalibration(true)}
            accessibilityRole="button"
            accessibilityLabel="Show advanced settings"
          >
            <Feather name="chevron-down" size={15} color={colors.primaryDark} />
            <Text style={styles.textButtonLabel}>Show advanced settings</Text>
          </Pressable>
        )}
        </SectionCard>
<Disclosure
          title={`Baseline history (${calibrationHistory.length})`}
          summary="Clean-air changes saved on this phone."
          expanded={isSectionOpen('baselineHistory')}
          onToggle={() => toggleSection('baselineHistory')}
        >
          {calibrationHistory.length === 0 ? (
            <Text style={styles.noteText}>No baseline changes yet.</Text>
          ) : (
            <View style={styles.actionGrid}>
              {calibrationHistory.slice(0, 6).map((entry) => (
                <View key={entry.id} style={styles.historyRow}>
                  <View style={styles.historyIcon}>
                    <Feather
                      name={
                        entry.source === 'clean-air'
                          ? 'target'
                          : entry.source === 'reset'
                            ? 'rotate-ccw'
                            : 'sliders'
                      }
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
                  <Text style={styles.historySource}>
                    {entry.rawSample === null ? '—' : `raw ${formatRawValue(entry.rawSample)}`}
                  </Text>
                </View>
              ))}
            </View>
          )}
          {calibrationHistory.length > 0 ? (
            <Pressable
              style={styles.textButton}
              onPress={() => {
                Alert.alert(
                  'Clear baseline history?',
                  'This only removes local history entries. Saved records are not deleted.',
                  [
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
                  ]
                );
              }}
              accessibilityRole="button"
              accessibilityLabel="Clear calibration history"
            >
              <Feather name="trash-2" size={15} color={colors.errorText} />
              <Text style={styles.textButtonDanger}>Clear history</Text>
            </Pressable>
          ) : null}
        </Disclosure>
      </>
    );
  };
const renderLiveTab = () => {
    const guidance = blowStateGuidance(snapshot);
    const guidanceStyle =
      guidance.tone === 'success'
        ? styles.guidanceBoxSuccess
        : guidance.tone === 'warning'
          ? styles.guidanceBoxWarning
          : guidance.tone === 'danger'
            ? styles.guidanceBoxDanger
            : styles.guidanceBoxNeutral;
    const guidanceTitleStyle =
      guidance.tone === 'success'
        ? styles.guidanceTitleSuccess
        : guidance.tone === 'warning'
          ? styles.guidanceTitleWarning
          : guidance.tone === 'danger'
            ? styles.guidanceTitleDanger
            : styles.guidanceTitleNeutral;
    const trend = signalTrend(signalSamples.map((sample) => sample.value));
    const attentionChecks = readiness.filter((check) => !check.ok);

    return (
      <>
        <SectionCard title="Live reading" description="A screening estimate from the sensor.">
          <View style={styles.statRow}>
            <View style={styles.statBlock}>
              <Text style={styles.statBlockLabel}>Live BAC estimate</Text>
              <Text style={styles.statBlockValue}>
                {formatBacGdl(snapshot.liveBacGdl)}
                <Text style={styles.metricDetail}> g/100ml</Text>
              </Text>
            </View>
            <View style={snapshot.peakBacGdl === null ? styles.statBlock : styles.statBlockWarning}>
              <Text style={styles.statBlockLabel}>Peak BAC estimate</Text>
              <Text
                style={
                  snapshot.peakBacGdl === null ? styles.statBlockValue : styles.statBlockValueWarning
                }
              >
                {formatBacGdl(snapshot.peakBacGdl)}
                <Text style={styles.metricDetail}> g/100ml</Text>
              </Text>
            </View>
          </View>

          {signalSamples.length >= 2 ? (
            <View style={[styles.trendChip, trend.direction === 'steady' ? styles.trendChipNeutral : styles.trendChipUp]}>
              <Feather
                name={
                  trend.direction === 'up'
                    ? 'trending-up'
                    : trend.direction === 'down'
                      ? 'trending-down'
                      : 'minus'
                }
                size={14}
                color={trend.direction === 'steady' ? colors.textSecondary : colors.accentBlue}
              />
              <Text
                style={
                  trend.direction === 'steady' ? styles.trendChipTextNeutral : styles.trendChipTextUp
                }
              >
                {trend.direction === 'up'
                  ? `Rising by ${Math.abs(trend.delta)}`
                  : trend.direction === 'down'
                    ? `Falling by ${Math.abs(trend.delta)}`
                    : 'Steady'}
              </Text>
            </View>
          ) : null}

          <View style={[styles.guidanceBox, guidanceStyle]}>
            <Text style={[styles.guidanceTitle, guidanceTitleStyle]}>{guidance.title}</Text>
            <Text style={styles.guidanceDetail}>{guidance.detail}</Text>
          </View>

          <LiveSignalChart
            samples={signalSamples}
            baseline={cleanAirRaw(snapshot.calibration)}
            height={140}
          />
          <Text style={styles.chartCaption}>
            Smoothed device signal. Newest reading on the right.
          </Text>

          <View style={styles.actionGrid}>
            <Pressable
              style={[
                styles.secondaryButton,
                lockDeviceMutations ? styles.buttonDisabled : null
              ]}
              onPress={handleResetSubjectPeak}
              disabled={lockDeviceMutations}
              accessibilityRole="button"
              accessibilityLabel="Reset peak for next subject"
              accessibilityState={{ disabled: lockDeviceMutations }}
            >
              <Feather name="refresh-cw" size={16} color={colors.primaryDark} />
              <Text style={styles.secondaryButtonText}>
                {lockDeviceMutations ? 'Peak locked during a test' : 'Reset peak for next subject'}
              </Text>
            </Pressable>
            <Pressable
              style={styles.secondaryButton}
              onPress={handlePreviewCapture}
              accessibilityRole="button"
              accessibilityLabel="Dry-run capture"
            >
              <Feather name="eye" size={16} color={colors.primaryDark} />
              <Text style={styles.secondaryButtonText}>Dry-run capture</Text>
            </Pressable>
            <Text style={styles.footnoteText}>Nothing is saved.</Text>
            <Pressable
              style={[styles.secondaryButton, isRunningDiagnostic ? styles.buttonDisabled : null]}
              onPress={() => void handleRunDiagnostic()}
              disabled={isRunningDiagnostic}
              accessibilityRole="button"
              accessibilityLabel="Check data stream"
              accessibilityState={{ disabled: isRunningDiagnostic }}
            >
              <Feather name="activity" size={16} color={colors.primaryDark} />
              <Text style={styles.secondaryButtonText}>
                {isRunningDiagnostic ? 'Checking the stream…' : 'Check data stream'}
              </Text>
            </Pressable>
          </View>
{previewCaptureResult ? (
            <View
              style={[styles.diagnosticResult, styles.diagnosticResultOk]}
              accessibilityLiveRegion="polite"
            >
              <Feather name="eye" size={18} color={colors.successText} />
              <View style={styles.diagnosticResultText}>
                <Text style={styles.diagnosticResultTitle}>Dry run ready</Text>
                <Text style={styles.diagnosticResultDetail}>
                  Raw {formatRawValue(previewCaptureResult.raw)} converts to{' '}
                  {formatBacGdl(previewCaptureResult.bacGdl)} g/100ml. No test record was created.
                </Text>
              </View>
            </View>
          ) : null}
          {diagnosticResult ? (
            <View
              style={[
                styles.diagnosticResult,
                diagnosticResult.ok ? styles.diagnosticResultOk : styles.diagnosticResultError
              ]}
              accessibilityLiveRegion="polite"
            >
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
          <View style={styles.footnote}>
            <Text style={styles.footnoteText}>
              Screening estimate only. This is not an evidential measurement.
            </Text>
          </View>
        </SectionCard>

        <SectionCard
          title="Ready for a roadside test"
          description="Every check must pass before a roadside reading can be captured."
        >
          <Text
            style={
              attentionChecks.length === 0 ? styles.readinessSummaryOk : styles.readinessSummaryWarn
            }
          >
            {attentionChecks.length === 0
              ? 'All checks passed.'
              : attentionChecks.length === 1
                ? '1 check still needs attention.'
                : `${attentionChecks.length} checks still need attention.`}
          </Text>
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
                  {check.ok ? 'Done' : 'Waiting'}
                </Text>
              </View>
            ))}
          </View>
        </SectionCard>
<SectionCard title="Device health" description="Read-only values from the device.">
          <View style={styles.metricGrid}>
            <MetricTile
              label="Sensor"
              value={hasSensorFault(snapshot) ? `Fault: ${sensorFaultMessage(snapshot.fault)}` : 'OK'}
              tone={hasSensorFault(snapshot) ? 'error' : 'success'}
            />
            <MetricTile
              label="Supply voltage"
              value={snapshot.vccMv === null ? '--' : `${(snapshot.vccMv / 1000).toFixed(2)} V`}
              tone={
                snapshot.vccMv !== null && (snapshot.vccMv < 4500 || snapshot.vccMv > 5500)
                  ? 'warning'
                  : 'neutral'
              }
            />
            <MetricTile
              label="Signal noise"
              value={snapshot.spread === null ? '--' : `${Math.round(snapshot.spread)} counts`}
              detail="Range across each sample burst."
            />
            <MetricTile
              label="Dropped frames"
              value={String(snapshot.droppedFrames)}
              tone={snapshot.droppedFrames > 0 ? 'warning' : 'neutral'}
            />
            <MetricTile label="Samples received" value={String(snapshot.readings)} />
            <MetricTile label="Last reading" value={formatSampleAge(snapshot.lastReceivedAt)} />
            <MetricTile
              label="Firmware serial"
              value={snapshot.deviceSerial ?? 'Not reported'}
              fullWidth
            />
          </View>
        </SectionCard>

        <Disclosure
          title="Technical readings"
          summary="Raw device numbers, for support."
          expanded={isSectionOpen('technical')}
          onToggle={() => toggleSection('technical')}
        >
          <View style={styles.metricGrid}>
            <MetricTile label="Raw sensor value" value={formatRawValue(snapshot.raw)} />
            <MetricTile label="Smoothed signal" value={formatRawValue(snapshot.avg)} />
            <MetricTile label="Device peak" value={formatRawValue(snapshot.devicePeak)} />
            <MetricTile
              label="Subject peak"
              value={formatRawValue(snapshot.sessionPeak)}
              tone="success"
            />
            <MetricTile
              label="Sensor voltage"
              value={snapshot.raw === null ? '-- V' : formatVoltage((snapshot.raw * 5) / 1023)}
            />
            <MetricTile
              label="Sensor resistance"
              value={preview.rsOhms === null ? '-- Ω' : formatResistance(preview.rsOhms)}
            />
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Warm-up finished</Text>
            <Text style={styles.summaryValue}>{snapshot.warm === false ? 'Yes' : 'Warming up'}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Above alarm level</Text>
            <Text style={styles.summaryValue}>{snapshot.over === true ? 'Yes' : 'No'}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Alarm</Text>
            <Text style={styles.summaryValue}>{snapshot.alarm === true ? 'On' : 'Off'}</Text>
          </View>
        </Disclosure>
<Disclosure
          title="Records on this phone"
          summary="Test records stored locally."
          expanded={isSectionOpen('records')}
          onToggle={() => toggleSection('records')}
        >
          <View style={styles.metricGrid}>
            <MetricTile label="LOCAL RECORDS" value={String(historySummary.totalLocalRecords)} />
            <MetricTile
              label="DEVICE CAPTURES"
              value={String(historySummary.deviceCapturedRecords)}
              tone="success"
            />
            <MetricTile
              label="PENDING SYNC"
              value={String(historySummary.pendingLocalRecords)}
              tone="warning"
            />
            <MetricTile
              label="FAILED SYNC"
              value={String(historySummary.failedLocalRecords)}
              tone="error"
            />
          </View>
          <View style={styles.historyRow}>
            <View style={styles.historyIcon}>
              <Feather name="clock" size={16} color={colors.primaryDark} />
            </View>
            <View style={styles.historyText}>
              <Text style={styles.historyTitle}>Last device capture</Text>
              <Text style={styles.historyDetail}>
                {formatRelativeTimestamp(historySummary.lastDeviceCapturedAt)}
              </Text>
            </View>
          </View>

          <Text style={styles.subSectionTitle}>Captures by device</Text>
          {historySummary.bySerial.length === 0 ? (
            <View style={styles.emptyState}>
              <Feather name="database" size={24} color={colors.neutralGray} />
              <Text style={styles.emptyStateTitle}>No device captures yet</Text>
              <Text style={styles.emptyStateText}>
                Capture a breathalyser reading to populate custody history.
              </Text>
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
                    {item.count} capture{item.count === 1 ? '' : 's'} · last{' '}
                    {formatRelativeTimestamp(item.lastCapturedAt)}
                  </Text>
                </View>
                <Text style={styles.historySource}>
                  {item.averageSessionPeakRaw === null
                    ? '--'
                    : `avg peak ${formatRawValue(item.averageSessionPeakRaw)}`}
                </Text>
              </View>
            ))
          )}

          <Text style={styles.subSectionTitle}>Captures by connection type</Text>
          {historySummary.byTransport.length === 0 ? (
            <View style={styles.emptyState}>
              <Feather name="bar-chart-2" size={24} color={colors.neutralGray} />
              <Text style={styles.emptyStateTitle}>No connection history yet</Text>
              <Text style={styles.emptyStateText}>
                Capture totals appear after the first breathalyser capture.
              </Text>
            </View>
          ) : (
            historySummary.byTransport.map((item) => (
              <View key={item.transport} style={styles.historyRow}>
                <View style={styles.historyIcon}>
                  <Feather
                    name={item.transport === 'bluetooth_classic' ? 'bluetooth' : 'cpu'}
                    size={16}
                    color={colors.primaryDark}
                  />
                </View>
                <View style={styles.historyText}>
                  <Text style={styles.historyTitle}>
                    {item.transport === 'bluetooth_classic'
                      ? 'Bluetooth Classic'
                      : item.transport === 'simulated'
                        ? 'Simulated'
                        : item.transport}
                  </Text>
                  <Text style={styles.historyDetail}>
                    {item.count} capture{item.count === 1 ? '' : 's'} · last{' '}
                    {formatRelativeTimestamp(item.lastCapturedAt)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </Disclosure>
<Disclosure
          title="BAC limits in force"
          summary="Limits used for pass or fail."
          expanded={isSectionOpen('limits')}
          onToggle={() => toggleSection('limits')}
        >
          {runtimeConfig && runtimeConfig.bacLimits.length > 0 ? (
            runtimeConfig.bacLimits.map((limit) => (
              <View key={limit.key} style={styles.policyRow}>
                <Text style={styles.policyLabel}>{limit.label}</Text>
                <Text style={styles.policyValue}>{limit.limitG100ml.toFixed(3)} g/100ml</Text>
              </View>
            ))
          ) : (
            <Text style={styles.noteText}>
              Limits unavailable offline. The last loaded policy stays active.
            </Text>
          )}
        </Disclosure>

        <View style={styles.footer}>
          <Pressable
            style={styles.textButton}
            onPress={() => void handleShareReport()}
            accessibilityRole="button"
            accessibilityLabel="Share diagnostic report"
          >
            <Feather name="share-2" size={15} color={colors.primaryDark} />
            <Text style={styles.textButtonLabel}>Share diagnostic report</Text>
          </Pressable>
          <Text style={styles.footerText}>
            Closing this screen does not disconnect the breathalyser.
          </Text>
        </View>
      </>
    );
  };
const renderHero = () => {
    const steps = buildSetupSteps(snapshot);
    const nextStep =
      steps.find((step) => step.state === 'attention') ??
      steps.find((step) => step.state === 'current') ??
      null;
    const isConnecting = snapshot.connection === 'connecting';
    const hasDevice =
      snapshot.connection === 'connected' || snapshot.connection === 'connecting';

    let actionLabel = 'Open live readings';
    let actionTab: DeviceSettingsTab = 'live';
    if (nextStep?.key === 'connect') {
      actionLabel =
        snapshot.connection === 'error' ? 'Reconnect' : 'Connect a breathalyser';
      actionTab = 'connect';
    } else if (nextStep?.key === 'warmup' || nextStep?.key === 'sensor') {
      actionLabel = 'View live readings';
      actionTab = 'live';
    } else if (!nextStep && !isBaselineSet(snapshot.calibration)) {
      actionLabel = 'Set clean-air baseline (recommended)';
      actionTab = 'calibrate';
    }

    return (
      <View style={styles.statusHero}>
        <View style={styles.statusHeroPillRow}>
          <View style={styles.statusHeroTitleBlock}>
            <Text style={styles.statusHeroTitle}>
              {hasDevice ? deviceIdentity : 'No breathalyser connected'}
            </Text>
            <Text style={styles.statusHeroMeta}>
              {snapshot.deviceSerial ? `Serial ${snapshot.deviceSerial}` : 'Serial not reported yet'}
              {snapshot.deviceAddress ? ` · ${snapshot.deviceAddress}` : ''}
            </Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: status.background }]}>
            <View style={[styles.statusDot, { backgroundColor: status.color }]} />
            <Text style={[styles.statusPillText, { color: status.color }]}>
              {statusFromSnapshot(snapshot).label}
            </Text>
          </View>
        </View>

        <Text style={styles.statusHeroDetail} numberOfLines={2}>
          {status.detail}
        </Text>

        <Pressable
          style={[styles.primaryButton, isConnecting ? styles.buttonDisabled : null]}
          onPress={() => setActiveTab(actionTab)}
          disabled={isConnecting}
          accessibilityRole="button"
          accessibilityLabel={isConnecting ? 'Connecting' : actionLabel}
          accessibilityState={{ disabled: isConnecting }}
        >
          {isConnecting ? (
            <ActivityIndicator size="small" color={colors.background} />
          ) : (
            <Feather name="arrow-right" size={16} color={colors.background} />
          )}
          <Text style={styles.primaryButtonText}>
            {isConnecting ? 'Connecting…' : actionLabel}
          </Text>
        </Pressable>
      </View>
    );
  };

  const renderStepper = () => {
    const steps = buildSetupSteps(snapshot);
    const required = steps.filter(
      (step) => step.key === 'connect' || step.key === 'warmup' || step.key === 'sensor'
    );
    const doneCount = required.filter((step) => step.state === 'done').length;
    const allDone = doneCount === required.length;
    const outstanding = steps.find((step) => step.state !== 'done');

    return (
      <View style={styles.setupStepper}>
        <Text style={allDone ? styles.stepperCaptionSuccess : styles.stepperCaption}>
          {allDone
            ? 'Ready for roadside testing'
            : `Setup: ${doneCount} of ${required.length} required steps done`}
        </Text>
        <View style={styles.stepperItems}>
          {steps.map((step) => (
            <StepperItem key={step.key} step={step} onPress={() => setActiveTab(step.tab)} />
          ))}
        </View>
        <Text style={styles.stepperDetail}>{outstanding?.detail ?? ''}</Text>
      </View>
    );
  };
const renderTabBar = () => (
    <View style={styles.tabBar}>
      {TABS.map((tab) => {
        const active = activeTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            style={[styles.tabButton, active ? styles.tabButtonActive : null]}
            onPress={() => setActiveTab(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${tab.label} tab`}
          >
            <Feather
              name={tab.icon}
              size={16}
              color={active ? colors.primaryDark : colors.textSecondary}
            />
            <Text style={[styles.tabLabel, active ? styles.tabLabelActive : null]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  const renderBanner = () => {
    if (!inlineMessage) return null;
    return (
      <View style={styles.bannerRow}>
        <View
          style={[
            styles.inlineMessage,
            inlineMessage.type === 'success'
              ? styles.inlineMessageSuccess
              : inlineMessage.type === 'error'
                ? styles.inlineMessageError
                : styles.inlineMessageInfo
          ]}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <Feather
            name={
              inlineMessage.type === 'success'
                ? 'check-circle'
                : inlineMessage.type === 'error'
                  ? 'alert-circle'
                  : 'info'
            }
            size={16}
            color={
              inlineMessage.type === 'success'
                ? colors.successText
                : inlineMessage.type === 'error'
                  ? colors.errorText
                  : colors.accentBlue
            }
          />
          <Text style={styles.inlineMessageText}>{inlineMessage.text}</Text>
        </View>
        <Pressable
          style={styles.bannerDismiss}
          onPress={() => setInlineMessage(null)}
          accessibilityRole="button"
          accessibilityLabel="Dismiss message"
        >
          <Text style={styles.bannerDismissText}>Dismiss</Text>
        </Pressable>
      </View>
    );
  };
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
                  <Text style={styles.headerTitle}>Breathalyser settings</Text>
                </View>
              </View>
              <Pressable
                style={styles.closeButton}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close breathalyser settings"
                hitSlop={10}
              >
                <Feather name="x" size={22} color={colors.background} />
              </Pressable>
            </View>

            {renderHero()}
            {renderStepper()}
            {renderTabBar()}

            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {renderBanner()}
              {activeTab === 'connect' ? renderConnectTab() : null}
              {activeTab === 'calibrate' ? renderCalibrateTab() : null}
              {activeTab === 'live' ? renderLiveTab() : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { Camera, CameraView, type BarcodeScanningResult } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../lib/AuthContext';
import { generateId } from '../lib/id';
import { saveLocally, syncPendingRecords } from '../services/sync';
import { useSync } from '../lib/SyncContext';
import { decryptLicensePayload, parseDecryptedLicensePayload, type DecryptedLicenseData } from '../lib/licenseDecryptor';
import type { DriverLicenseData } from '../services/scanService';
import { OfficerBottomNav } from '../components/OfficerBottomNav';
import { OfficerHome } from '../components/OfficerHome';

type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  OfficerDashboard: undefined;
  OfficerReports: undefined;
  Audit: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, 'OfficerDashboard'>;

type OfficerStep = 'idle' | 'scan' | 'reading' | 'saved';

const DEV_SCAN_TIMEOUT_MS = 3000;
const DEV_BAC_TIMEOUT_MS = 2000;

function randomDevBac(): string {
  const value = Math.random() * 0.12;
  return value.toFixed(3);
}

function bacStatus(bac: string): { label: string; color: string } {
  if (!bac) return { label: 'AWAITING', color: '#4338ca' };
  const reading = parseFloat(bac);
  if (Number.isNaN(reading)) return { label: 'AWAITING', color: '#4338ca' };
  if (reading >= 0.05) return { label: 'FAIL', color: '#dc2626' };
  if (reading === 0) return { label: 'PASS', color: '#16a34a' };
  return { label: 'PASS', color: '#16a34a' };
}

const DEV_DUMMY_LICENSE: DriverLicenseData = {
  name: 'Thabang',
  surname: 'Kutumela',
  initials: 'TJ',
  idNumber: '9504125553083',
  licenseNumber: 'DL123456789',
  dob: '1995-04-12',
  expiryDate: '2028-08-01',
  licenseCodes: 'B EB',
};

const DEV_DUMMY_DECRYPTED: DecryptedLicenseData = {
  vehicleCodes: ['B', 'EB'],
  surname: 'Kutumela',
  initials: 'TJ',
  prdpCode: 'P',
  idCountryOfIssue: 'ZAF',
  licenseCountryOfIssue: 'ZAF',
  vehicleRestrictions: ['None'],
  printableStrings: ['Kutumela TJ', 'B EB', 'ZAF', '9504125553083', 'DL123456789'],
  rawHex: '00'.repeat(128),
};

function normalizeDate(value: string): string | undefined {
  const normalized = value.replace(/\//g, '-').replace(/\s+/g, ' ').trim();
  const numeric = normalized.replace(/[^0-9\-]/g, '');

  if (/^\d{8}$/.test(numeric)) {
    const yearFirst = `${numeric.slice(0, 4)}-${numeric.slice(4, 6)}-${numeric.slice(6, 8)}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(yearFirst)) {
      return yearFirst;
    }

    const yearLast = `${numeric.slice(4, 8)}-${numeric.slice(0, 2)}-${numeric.slice(2, 4)}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(yearLast)) {
      return yearLast;
    }
  }

  const match = normalized.match(/\b\d{4}-\d{2}-\d{2}\b|\b\d{2}-\d{2}-\d{4}\b/);
  if (!match) return undefined;
  const parts = match[0].split('-');
  if (parts[0].length === 4) {
    return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
  }
  return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
}

function normalizePdf417Payload(rawPayload: string): string {
  return rawPayload
    .replace(/\r/g, '')
    .replace(/\u001d|\u001e|\u001f/g, '\n')
    .replace(/[|;]/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1A\x1C\x7F]/g, ' ')
    .trim();
}

function sanitizePayloadForDisplay(rawPayload: string): string {
  return normalizePdf417Payload(rawPayload)
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .replace(/\n+/g, '\n')
    .trim();
}

function formatRawPayloadForDisplay(rawPayload: string): string {
  const sanitized = sanitizePayloadForDisplay(rawPayload);
  const hasBinary = /[\x00-\x1F\x7F-\x9F\uFFFD]/.test(rawPayload);
  const payloadSizeLabel = `Payload length: ${rawPayload.length} bytes`;

  if (!sanitized && rawPayload.length > 0) {
    const hexPreview = Array.from(rawPayload, (char) => `0x${(char.charCodeAt(0) & 0xff).toString(16).padStart(2, '0')}`)
      .slice(0, 64)
      .join(' ');
    return `${payloadSizeLabel}\n${hexPreview}${rawPayload.length > 64 ? ' ...' : ''}`;
  }

  const formatted = hasBinary && sanitized
    ? `${sanitized}\n\n[Contains non-printable binary bytes]`
    : sanitized;

  return `${payloadSizeLabel}${formatted ? `\n\n${formatted}` : ''}`.trim();
}

function parseAamvaBarcodeData(rawPayload: string): DriverLicenseData {
  const payload = normalizePdf417Payload(rawPayload);
  const knownTags = [
    'DAA', 'DAB', 'DAC', 'DAD', 'DAE', 'DAF', 'DAG', 'DAH', 'DAI', 'DAJ', 'DAK', 'DAL', 'DAM', 'DAN',
    'DAO', 'DAP', 'DAQ', 'DAR', 'DAS', 'DAT', 'DAU', 'DAV', 'DAW', 'DAX', 'DAY', 'DAZ',
    'DBA', 'DBB', 'DBC', 'DBD', 'DBE', 'DBF', 'DBG', 'DBH', 'DBI', 'DBJ', 'DBK',
    'DCG', 'DCH', 'DCI', 'DCJ', 'DCK', 'DCL', 'DCM', 'DCN', 'DCO', 'DCP', 'DCQ', 'DCR', 'DCS', 'DCT', 'DCU', 'DCV', 'DCW', 'DDA', 'DDB', 'DDC', 'DDD', 'DDE', 'DDF', 'DDG', 'DDH'
  ];

  const positions: Array<{ tag: string; index: number }> = [];
  for (const tag of knownTags) {
    let index = payload.indexOf(tag);
    while (index !== -1) {
      positions.push({ tag, index });
      index = payload.indexOf(tag, index + tag.length);
    }
  }

  if (positions.length === 0) {
    return parsePdf417BarcodeDataFallback(rawPayload);
  }

  positions.sort((a, b) => a.index - b.index);
  const parsed = new Map<string, string>();

  for (let i = 0; i < positions.length; i += 1) {
    const current = positions[i];
    const start = current.index + current.tag.length;
    const end = i + 1 < positions.length ? positions[i + 1].index : payload.length;
    const value = payload.slice(start, end).replace(/[\n\r]/g, ' ').trim();
    if (value) {
      parsed.set(current.tag, value);
    }
  }

  const rawName = parsed.get('DAA') ?? parsed.get('DCT') ?? '';
  let name = parsed.get('DAC') ?? '';
  let surname = parsed.get('DCS') ?? '';

  if (!name && rawName) {
    const parts = rawName.split(',').map((part) => part.trim());
    if (parts.length >= 2) {
      surname = parts[0];
      name = parts.slice(1).join(' ');
    } else {
      const words = rawName.split(' ').filter(Boolean);
      surname = words.pop() ?? '';
      name = words.join(' ');
    }
  }

  if (!name && !surname) {
    const dee = parsed.get('DCT') ?? parsed.get('DCS');
    if (dee) {
      const words = dee.split(',').map((part) => part.trim());
      if (words.length >= 2) {
        surname = words[0];
        name = words.slice(1).join(' ');
      }
    }
  }

  if (!name) name = 'Unknown';
  if (!surname) surname = 'Unknown';

  const dob = normalizeDate(parsed.get('DBB') ?? parsed.get('DBD') ?? '');
  const expiryDate = normalizeDate(parsed.get('DBA') ?? parsed.get('DBE') ?? '');
  const idNumber = parsed.get('DAQ') ?? parsed.get('IDN') ?? '';
  const licenseNumber = parsed.get('DAQ') ?? parsed.get('DAQ') ?? '';
  const licenseCodes = [parsed.get('DCA'), parsed.get('DCB'), parsed.get('DCD')]
    .filter(Boolean)
    .join(' ')
    .trim();

  return {
    name,
    surname,
    initials: parsed.get('DAC') ?? parsed.get('DAG') ?? '',
    idNumber,
    licenseNumber,
    dob: dob ?? '',
    expiryDate: expiryDate ?? '',
    licenseCodes
  };
}

function parsePdf417BarcodeDataFallback(rawPayload: string): DriverLicenseData {
  const normalizedText = rawPayload
    .replace(/\r/g, '\n')
    .replace(/[|;]/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const lines = normalizedText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const nameCandidate = extractLabeledValue(lines, [
    'full name',
    'name',
    'driver name',
    'given names',
    'given name'
  ]);
  const surnameCandidate = extractLabeledValue(lines, ['surname', 'last name']);
  const initialsCandidate = extractLabeledValue(lines, ['initials']);
  const idCandidate = extractLabeledValue(lines, [
    'id number',
    'id no',
    'idnumber',
    'identity number',
    'identity no',
    'identity'
  ]) ?? findPattern(lines, /\b\d{13}\b/);
  const licenseNumberCandidate = extractLabeledValue(lines, [
    'license number',
    'licence number',
    'dl number',
    'driver licence number',
    'driver license number',
    'license no',
    'licence no'
  ]) ?? findPattern(lines, /\b[A-Z0-9]{6,12}\b/);
  const dobCandidate = extractLabeledValue(lines, ['date of birth', 'dob', 'birth date'])
    ? normalizeDate(extractLabeledValue(lines, ['date of birth', 'dob', 'birth date'])!)
    : normalizeDate(findPattern(lines, /\b\d{4}[\/\-]\d{2}[\/\-]\d{2}\b|\b\d{2}[\/\-]\d{2}[\/\-]\d{4}\b/) ?? '');
  const expiryCandidate = extractLabeledValue(lines, [
    'expiry date',
    'expiry',
    'valid until',
    'valid to',
    'expires'
  ])
    ? normalizeDate(extractLabeledValue(lines, ['expiry date', 'expiry', 'valid until', 'valid to', 'expires'])!)
    : normalizeDate(findPattern(lines, /\b\d{4}[\/\-]\d{2}[\/\-]\d{2}\b|\b\d{2}[\/\-]\d{2}[\/\-]\d{4}\b/) ?? '');
  const codesCandidate = extractLabeledValue(lines, ['license codes', 'license code', 'license categories', 'codes', 'code']);

  let name = nameCandidate ?? '';
  let surname = surnameCandidate ?? '';
  const initials = initialsCandidate ?? '';

  if (!name && surnameCandidate) {
    const potential = lines.find((line) => /^[A-Za-z ]+$/.test(line) && line.split(' ').length > 1);
    if (potential) {
      name = potential;
    }
  }

  if (!name && !surname && lines.length > 0) {
    const guess = lines[0].replace(/[^A-Za-z ]/g, '').trim();
    if (guess.length > 0) {
      const parts = guess.split(' ').filter(Boolean);
      if (parts.length > 1) {
        surname = parts.pop() ?? '';
        name = parts.join(' ');
      } else {
        name = guess;
      }
    }
  }

  if (!name) {
    name = 'Unknown';
  }

  return {
    name,
    surname,
    initials,
    idNumber: idCandidate ?? '',
    licenseNumber: licenseNumberCandidate ?? '',
    dob: dobCandidate ?? '',
    expiryDate: expiryCandidate ?? '',
    licenseCodes: codesCandidate ?? ''
  };
}

function extractLabeledValue(lines: string[], labels: string[]): string | undefined {
  const regex = new RegExp(`\\b(?:${labels.join('|')})\\b`, 'i');
  const line = lines.find((item) => regex.test(item));
  if (!line) return undefined;
  const parts = line.split(/[:=]/);
  if (parts.length > 1) {
    return parts.slice(1).join(':').trim();
  }
  return line.replace(regex, '').replace(/^[\s:-]+/, '').trim();
}

function findPattern(lines: string[], pattern: RegExp): string | undefined {
  const line = lines.find((item) => pattern.test(item));
  return line ? line.match(pattern)?.[0] : undefined;
}

function parsePdf417BarcodeData(rawPayload: string): DriverLicenseData {
  return parseAamvaBarcodeData(rawPayload);
}

export function OfficerDashboardScreen({ navigation }: Props) {
  const { profile, signOut } = useAuth();
  const { pendingCount, failedCount, syncedCount, isSyncing, lastSyncedAt, forceSync, refreshCounts } = useSync();
  const [syncModalVisible, setSyncModalVisible] = useState(false);
  const [step, setStep] = useState<OfficerStep>('idle');
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scannedData, setScannedData] = useState<DriverLicenseData | null>(null);
  const [licensePayload, setLicensePayload] = useState<string | null>(null);
  const [decryptedLicenseData, setDecryptedLicenseData] = useState<DecryptedLicenseData | null>(null);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [barcodeScanned, setBarcodeScanned] = useState(false);
  const [bacReading, setBacReading] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [lastSavedTestId, setLastSavedTestId] = useState<string | null>(null);
  const [lastSavedDriver, setLastSavedDriver] = useState<DriverLicenseData | null>(null);
  const [isRetest, setIsRetest] = useState(false);
  const devTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bacTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!__DEV__ || step !== 'scan') {
      if (devTimerRef.current) {
        clearTimeout(devTimerRef.current);
        devTimerRef.current = null;
      }
      return;
    }

    devTimerRef.current = setTimeout(() => {
      if (barcodeScanned) return;
      setScannedData(DEV_DUMMY_LICENSE);
      setDecryptedLicenseData(DEV_DUMMY_DECRYPTED);
      setLicensePayload(null);
      setDecryptError(null);
      setStep('reading');
    }, DEV_SCAN_TIMEOUT_MS);

    return () => {
      if (devTimerRef.current) {
        clearTimeout(devTimerRef.current);
        devTimerRef.current = null;
      }
    };
  }, [step, barcodeScanned]);

  useEffect(() => {
    if (!__DEV__ || step !== 'reading' || bacReading) {
      if (bacTimerRef.current) {
        clearTimeout(bacTimerRef.current);
        bacTimerRef.current = null;
      }
      return;
    }

    bacTimerRef.current = setTimeout(() => {
      setBacReading(randomDevBac());
    }, DEV_BAC_TIMEOUT_MS);

    return () => {
      if (bacTimerRef.current) {
        clearTimeout(bacTimerRef.current);
        bacTimerRef.current = null;
      }
    };
  }, [step, bacReading]);

  if (!profile) {
    return null;
  }

  const startScan = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera access denied');
      return;
    }

    setHasPermission(true);
    setBarcodeScanned(false);
    setLicensePayload(null);
    setDecryptedLicenseData(null);
    setDecryptError(null);
    setStep('scan');
  };

  const handleBarcodeScanned = (scanningResult: BarcodeScanningResult) => {
    if (barcodeScanned) return;
    setBarcodeScanned(true);

    const rawPayload = scanningResult.data?.trim();
    if (!rawPayload) {
      Alert.alert('Scan failed', 'No barcode payload was decoded. Please try again.');
      setStep('idle');
      setBarcodeScanned(false);
      return;
    }

    try {
      const decryptedBytes = decryptLicensePayload(rawPayload);
      const parsedDecrypted = parseDecryptedLicensePayload(decryptedBytes);
      setDecryptedLicenseData(parsedDecrypted);
      setDecryptError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDecryptedLicenseData(null);
      setDecryptError(message);
    }

    const data = parsePdf417BarcodeData(rawPayload);
    setScannedData(data);
    setLicensePayload(formatRawPayloadForDisplay(rawPayload));
    setStep('reading');
  };

  const cancelScan = () => {
    setStep('idle');
    setBarcodeScanned(false);
    setLicensePayload(null);
    setDecryptedLicenseData(null);
    setDecryptError(null);
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera access denied', 'Please allow camera access to take evidence photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: false
    });

    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handleRetest = () => {
    if (!lastSavedTestId || !lastSavedDriver) return;
    
    setScannedData(lastSavedDriver);
    setBacReading('');
    setPhotoUri(null);
    setIsRetest(true);
    setStep('reading');
  };

  const handleFinishSession = () => {
    setStep('idle');
    setScannedData(null);
    setLastSavedTestId(null);
    setLastSavedDriver(null);
    setIsRetest(false);
    Alert.alert('Record saved', 'Record saved locally. It will sync when network is available.');
  };

  const saveRecord = async () => {
    if (!scannedData || !bacReading || !profile) {
      return;
    }

    const reading = parseFloat(bacReading);
    if (Number.isNaN(reading)) {
      Alert.alert('Invalid BAC', 'Please enter a valid numeric BAC reading.');
      return;
    }

    setIsSaving(true);
    try {
      const isOver = reading >= 0.05;
      const result = reading === 0 ? 'pass' : isOver ? 'fail' : 'pass';
      const id = generateId();

      await saveLocally({
        id,
        officerId: profile.officerId ?? null,
        officerName: profile.name,
        badgeNumber: profile.badgeNumber,
        driverName: `${scannedData.name} ${scannedData.surname}`.trim(),
        driverId: scannedData.licenseNumber || scannedData.idNumber,
        driverDob: scannedData.dob,
        bacReading: reading,
        result,
        location: { lat: -25.7479, lng: 28.2293 },
        photoUri,
        originalTestId: isRetest ? lastSavedTestId : null
      });

      setLastSavedTestId(id);
      setLastSavedDriver(scannedData);
      setIsRetest(false);
      setStep('saved');
      setBacReading('');
      setPhotoUri(null);
      await refreshCounts();

      syncPendingRecords().catch(() => {
        // Background sync attempt — errors are non-blocking
      });
    } catch (error) {
      console.error('Save failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to save record. Please try again.';
      Alert.alert('Save failed', message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <View style={styles.headerTitle}>
          <View style={styles.iconBadge}>
            <Feather name="shield" size={20} color="#fff" />
          </View>
          <View>
            <Text style={styles.headerLabel}>OFFICER PORTAL</Text>
            <Text style={styles.headerSubtitle}>{profile.name} • {profile.badgeNumber}</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.syncBadge}
            onPress={() => setSyncModalVisible(true)}
          >
            {isSyncing ? (
              <ActivityIndicator size="small" color="#4338ca" />
            ) : pendingCount > 0 ? (
              <>
                <Feather name="cloud-off" size={14} color="#f59e0b" />
                <Text style={styles.syncBadgeText}>{pendingCount}</Text>
              </>
            ) : (
              <Feather name="check-circle" size={14} color="#22c55e" />
            )}
          </Pressable>
          <Pressable
            style={styles.signOutButton}
            onPress={async () => {
              await signOut();
              navigation.replace('Login');
            }}
          >
            <Feather name="log-out" size={20} color="#475569" />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} style={styles.contentScroll}>
        {step === 'idle' && (
          <OfficerHome
            profile={profile}
            pendingCount={pendingCount}
            failedCount={failedCount}
            syncedCount={syncedCount}
            isSyncing={isSyncing}
            lastSyncedAt={lastSyncedAt}
            onStartSession={startScan}
            onForceSync={forceSync}
            onOpenReports={() => navigation.navigate('OfficerReports')}
            onOpenAudit={() => navigation.navigate('Audit')}
          />
        )}

        {step === 'scan' && hasPermission && (
          <View style={styles.cameraContainer}>
            <CameraView
              style={styles.camera}
              facing="back"
              ratio="16:9"
              barcodeScannerSettings={{ barcodeTypes: ['pdf417'] }}
              onBarcodeScanned={handleBarcodeScanned}
            />
            <View style={styles.scanOverlay} />
            <View style={styles.scanInstructions}>
              <Text style={styles.scanHint}>
                {barcodeScanned ? 'Reading barcode...' : 'Point the PDF417 barcode inside the frame.'}
              </Text>
            </View>
            <View style={styles.scanActions}>
              <Pressable style={styles.secondaryButton} onPress={cancelScan}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        )}

        {step === 'reading' && (
          <View style={styles.card}>
            <View style={styles.profileSummary}>
              <View style={styles.profileIcon}>
                <MaterialCommunityIcons name="account" size={24} color="#94a3b8" />
              </View>
              <View>
                <Text style={styles.overline}>Subject Identified</Text>
                <Text style={styles.subjectName}>{scannedData?.name} {scannedData?.surname}</Text>
                <Text style={styles.subjectLicense}>ID: {scannedData?.idNumber}</Text>
                <Text style={styles.subjectLicense}>License: {scannedData?.licenseNumber}</Text>
              </View>
            </View>

            {decryptedLicenseData ? (
              <View style={styles.decryptedCard}>
                <Text style={styles.overline}>Decrypted license payload</Text>
                <Text style={styles.decryptedRow}>Surname: {decryptedLicenseData.surname || 'Unknown'}</Text>
                <Text style={styles.decryptedRow}>Initials: {decryptedLicenseData.initials || 'Unknown'}</Text>
                {decryptedLicenseData.prdpCode ? (
                  <Text style={styles.decryptedRow}>PrDP Code: {decryptedLicenseData.prdpCode}</Text>
                ) : null}
                <Text style={styles.decryptedRow}>Vehicle codes: {decryptedLicenseData.vehicleCodes.filter(Boolean).join(', ') || 'N/A'}</Text>
                <Text style={styles.decryptedRow}>License country: {decryptedLicenseData.licenseCountryOfIssue || 'N/A'}</Text>
                <Text style={styles.decryptedRow}>Restrictions: {decryptedLicenseData.vehicleRestrictions.filter(Boolean).join(', ') || 'N/A'}</Text>
              </View>
            ) : null}
            {decryptedLicenseData?.printableStrings?.length ? (
              <View style={styles.decryptedPreviewCard}>
                <Text style={styles.overline}>Decrypted payload preview</Text>
                {decryptedLicenseData.printableStrings.slice(0, 5).map((item, index) => (
                  <Text key={index} style={styles.decryptedPreviewText} numberOfLines={2} ellipsizeMode="tail">
                    • {item}
                  </Text>
                ))}
                {decryptedLicenseData.printableStrings.length > 5 ? (
                  <Text style={styles.decryptedPreviewHint}>Showing first 5 parsed strings.</Text>
                ) : null}
              </View>
            ) : null}
            {decryptError ? (
              <View style={styles.decryptErrorCard}>
                <Text style={styles.decryptErrorLabel}>Decrypt error</Text>
                <Text style={styles.decryptErrorText}>{decryptError}</Text>
              </View>
            ) : null}
            {licensePayload ? (
              <View style={styles.rawPayloadCard}>
                <Text style={styles.overline}>Raw barcode payload</Text>
                <Text style={styles.rawPayloadText}>{licensePayload}</Text>
              </View>
            ) : null}

            <View style={styles.bacSection}>
              <Text style={styles.overline}>BAC Reading (g/100ml)</Text>
              <TextInput
                keyboardType="decimal-pad"
                placeholder="0.000"
                placeholderTextColor="#94a3b8"
                value={bacReading}
                onChangeText={setBacReading}
                style={styles.bacInput}
              />
              <Text style={styles.bacSuffix}>BAC</Text>
            </View>

            <View style={styles.statusRow}>
              <View style={styles.statusCard}> 
                <Text style={styles.statusLabel}>Legal Limit</Text>
                <Text style={styles.statusValue}>0.050</Text>
              </View>
              <View style={[styles.statusCardAlt, { borderColor: bacStatus(bacReading).color }]}>
                <Text style={[styles.statusLabelAlt, { color: bacStatus(bacReading).color }]}>Status</Text>
                <Text style={[styles.statusValueAlt, { color: bacStatus(bacReading).color }]}>{bacStatus(bacReading).label}</Text>
              </View>
            </View>

            <View style={styles.evidenceSection}>
              <Text style={styles.overline}>Evidence Photo (optional)</Text>
              {photoUri ? (
                <View style={styles.photoPreview}>
                  <Image source={{ uri: photoUri }} style={styles.photoImage} />
                  <Pressable style={styles.photoRemove} onPress={() => setPhotoUri(null)}>
                    <Feather name="x" size={14} color="#fff" />
                  </Pressable>
                </View>
              ) : (
                <Pressable style={styles.photoButton} onPress={takePhoto}>
                  <Feather name="camera" size={18} color="#4338ca" />
                  <Text style={styles.photoButtonText}>Take Photo</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.actionRow}>
              <Pressable style={[styles.primaryButton, (!bacReading || isSaving) && styles.buttonDisabled]} onPress={saveRecord} disabled={!bacReading || isSaving}>
                {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}><Feather name="shield" size={18} color="#fff" />  COMMIT TO LEDGER</Text>}
              </Pressable>
              <Pressable onPress={() => setStep('idle')}>
                <Text style={styles.abortText}>Abort Session</Text>
              </Pressable>
            </View>
          </View>
        )}

        {step === 'saved' && (
          <View style={styles.card}>
            <View style={styles.savedIcon}>
              <Feather name="check-circle" size={48} color="#16a34a" />
            </View>
            <Text style={styles.savedTitle}>Record Saved</Text>
            <Text style={styles.savedSubtitle}>
              Test record has been committed to the ledger and will sync when network is available.
            </Text>

            {lastSavedDriver && (
              <View style={styles.savedDriverCard}>
                <Text style={styles.overline}>Driver</Text>
                <Text style={styles.savedDriverName}>
                  {lastSavedDriver.name} {lastSavedDriver.surname}
                </Text>
                <Text style={styles.savedDriverId}>
                  ID: {lastSavedDriver.licenseNumber || lastSavedDriver.idNumber}
                </Text>
              </View>
            )}

            <View style={styles.actionRow}>
              <Pressable style={styles.secondaryActionButton} onPress={handleRetest}>
                <Feather name="refresh-cw" size={18} color="#4338ca" />
                <Text style={styles.secondaryActionText}>Retest Driver</Text>
              </Pressable>
              <Pressable style={styles.primaryButton} onPress={handleFinishSession}>
                <Text style={styles.primaryButtonText}>Finish Session</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>

      <OfficerBottomNav active="OfficerDashboard" />

      <Modal
        visible={syncModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSyncModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setSyncModalVisible(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sync Status</Text>
              <Pressable onPress={() => setSyncModalVisible(false)}>
                <Feather name="x" size={20} color="#64748b" />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.modalRow}>
                <View style={[styles.modalDot, { backgroundColor: '#22c55e' }]} />
                <Text style={styles.modalLabel}>Synced</Text>
                <Text style={styles.modalValue}>{syncedCount}</Text>
              </View>

              <View style={styles.modalRow}>
                <View style={[styles.modalDot, { backgroundColor: '#f59e0b' }]} />
                <Text style={styles.modalLabel}>Pending Sync</Text>
                <Text style={styles.modalValue}>{pendingCount}</Text>
              </View>

              <View style={styles.modalRow}>
                <View style={[styles.modalDot, { backgroundColor: '#ef4444' }]} />
                <Text style={styles.modalLabel}>Failed</Text>
                <Text style={styles.modalValue}>{failedCount}</Text>
              </View>
            </View>

            {lastSyncedAt && (
              <View style={styles.modalFooter}>
                <Feather name="clock" size={12} color="#94a3b8" />
                <Text style={styles.modalFooterText}>
                  Last sync: {lastSyncedAt.toLocaleTimeString()}
                </Text>
              </View>
            )}

            <Pressable
              style={[styles.modalSyncButton, isSyncing && styles.buttonDisabled]}
              onPress={async () => {
                await forceSync();
                setSyncModalVisible(false);
              }}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Feather name="refresh-cw" size={16} color="#fff" />
                  <Text style={styles.modalSyncButtonText}>Force Sync</Text>
                </>
              )}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  header: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingTop: Platform.OS === 'android' ? 50 : 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  syncBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#f59e0b'
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  iconBadge: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#4338ca',
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerLabel: {
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '700',
    letterSpacing: 1.5
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2
  },
  signOutButton: {
    padding: 8
  },
  contentScroll: {
    flex: 1
  },
  content: {
    flexGrow: 1,
    padding: 20
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 7
  },
  cardIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 8
  },
  cardText: {
    color: '#64748b',
    lineHeight: 22,
    marginBottom: 24
  },
  primaryButton: {
    backgroundColor: '#0D253F',
    borderRadius: 16,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700'
  },
  cameraContainer: {
    flex: 1,
    minHeight: 360,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#000'
  },
  camera: {
    flex: 1
  },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderColor: '#4338ca',
    borderRadius: 24,
    margin: 20
  },
  scanInstructions: {
    position: 'absolute',
    top: 30,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    borderRadius: 16,
    padding: 12
  },
  scanHint: {
    color: '#ffffff',
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20
  },
  scanActions: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12
  },
  rawPayloadCard: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: '#eef2ff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#c7d2fe'
  },
  rawPayloadText: {
    marginTop: 8,
    color: '#475569',
    fontSize: 12,
    lineHeight: 18
  },
  decryptedCard: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#c7d2f4'
  },
  decryptedRow: {
    marginTop: 6,
    color: '#0f172a',
    fontSize: 13,
    lineHeight: 20
  },
  decryptedPreviewCard: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: '#eef2ff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#c7d2fe'
  },
  decryptedPreviewText: {
    marginTop: 8,
    color: '#334155',
    fontSize: 13,
    lineHeight: 20
  },
  decryptedPreviewHint: {
    marginTop: 10,
    color: '#64748b',
    fontSize: 12
  },
  decryptErrorCard: {
    marginBottom: 20,
    padding: 14,
    backgroundColor: '#fef2f2',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#fecaca'
  },
  decryptErrorLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#b91c1c'
  },
  decryptErrorText: {
    marginTop: 6,
    color: '#991b1b',
    fontSize: 12,
    lineHeight: 18
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  secondaryButtonText: {
    color: '#ffffff',
    fontWeight: '700'
  },
  captureButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: '#4338ca',
    alignItems: 'center',
    justifyContent: 'center'
  },
  captureButtonText: {
    color: '#ffffff',
    fontWeight: '700'
  },
  profileSummary: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    marginBottom: 20,
    padding: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 20
  },
  profileIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  overline: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#64748b',
    marginBottom: 4
  },
  subjectName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a'
  },
  subjectLicense: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2
  },
  bacSection: {
    marginBottom: 20
  },
  bacInput: {
    marginTop: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 20,
    paddingVertical: 22,
    paddingHorizontal: 18,
    fontSize: 32,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center'
  },
  bacSuffix: {
    position: 'absolute',
    right: 26,
    top: 56,
    color: '#94a3b8',
    fontWeight: '700'
  },
  statusRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20
  },
  statusCard: {
    flex: 1,
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center'
  },
  statusCardAlt: {
    flex: 1,
    padding: 16,
    backgroundColor: '#eef2ff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#c7d2fe',
    alignItems: 'center'
  },
  statusLabel: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '800',
    letterSpacing: 1
  },
  statusLabelAlt: {
    fontSize: 10,
    color: '#4338ca',
    fontWeight: '800',
    letterSpacing: 1
  },
  statusValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 6
  },
  statusValueAlt: {
    fontSize: 16,
    fontWeight: '800',
    color: '#4338ca',
    marginTop: 6
  },
  evidenceSection: {
    marginBottom: 20
  },
  photoButton: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#c7d2fe',
    backgroundColor: '#eef2ff',
    borderStyle: 'dashed'
  },
  photoButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4338ca'
  },
  photoPreview: {
    marginTop: 12,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative'
  },
  photoImage: {
    width: '100%',
    height: 180,
    borderRadius: 20
  },
  photoRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  actionRow: {
    gap: 12
  },
  abortText: {
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontSize: 12,
    color: '#64748b'
  },
  buttonDisabled: {
    opacity: 0.7
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    width: '100%',
    maxWidth: 340,
    padding: 24,
    shadowColor: '#0f172a',
    shadowOpacity: 0.15,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  modalBody: {
    gap: 12,
    marginBottom: 16,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#f8fafc',
    borderRadius: 14,
  },
  modalDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  modalLabel: {
    flex: 1,
    fontSize: 14,
    color: '#334155',
    fontWeight: '600',
  },
  modalValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  modalFooterText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  modalSyncButton: {
    backgroundColor: '#4338ca',
    borderRadius: 14,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  modalSyncButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  savedIcon: {
    alignItems: 'center',
    marginBottom: 16
  },
  savedTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 8
  },
  savedSubtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20
  },
  savedDriverCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24
  },
  savedDriverName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 4
  },
  savedDriverId: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4
  },
  secondaryActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: '#c7d2fe'
  },
  secondaryActionText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#4338ca'
  },
});

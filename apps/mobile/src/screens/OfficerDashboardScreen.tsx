import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { Camera, CameraView, type BarcodeScanningResult } from 'expo-camera';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../lib/AuthContext';
import { createTest } from '../services/api';
import type { DriverLicenseData } from '../services/scanService';

type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  OfficerDashboard: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, 'OfficerDashboard'>;

type OfficerStep = 'idle' | 'scan' | 'reading';

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
  const [step, setStep] = useState<OfficerStep>('idle');
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scannedData, setScannedData] = useState<DriverLicenseData | null>(null);
  const [licensePayload, setLicensePayload] = useState<string | null>(null);
  const [barcodeScanned, setBarcodeScanned] = useState(false);
  const [bacReading, setBacReading] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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

    const data = parsePdf417BarcodeData(rawPayload);
    setScannedData(data);
    setLicensePayload(sanitizePayloadForDisplay(rawPayload));
    setStep('reading');
  };

  const cancelScan = () => {
    setStep('idle');
    setBarcodeScanned(false);
    setLicensePayload(null);
  };

  const saveRecord = async () => {
    if (!scannedData || !bacReading) {
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
      await createTest({
        driverName: scannedData.name,
        driverId: scannedData.licenseNumber,
        driverDob: scannedData.dob,
        bacReading: reading,
        result: reading === 0 ? 'pass' : isOver ? 'fail' : 'pass',
        location: { lat: -25.7479, lng: 28.2293 }
      });

      setStep('idle');
      setScannedData(null);
      setBacReading('');
      Alert.alert('Record saved', 'Record saved to incorruptible ledger.');
    } catch (error) {
      Alert.alert('Save failed', 'Failed to sync record. Please try again later.');
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
        <Pressable
          style={styles.signOutButton}
          onPress={() => {
            signOut();
            navigation.replace('Login');
          }}
        >
          <Feather name="log-out" size={20} color="#475569" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} style={styles.contentScroll}>
        {step === 'idle' && (
          <View style={styles.card}>
            <View style={styles.cardIcon}>
              <Feather name="camera" size={32} color="#4338ca" />
            </View>
            <Text style={styles.cardTitle}>New Roadside Stop</Text>
            <Text style={styles.cardText}>Scan the driver's license to begin an incorruptible DUI record session.</Text>
            <Pressable style={styles.primaryButton} onPress={startScan}>
              <Feather name="camera" size={20} color="#fff" />
              <Text style={styles.primaryButtonText}>START SESSION</Text>
            </Pressable>
          </View>
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
              <View style={styles.statusCardAlt}>
                <Text style={styles.statusLabelAlt}>Status</Text>
                <Text style={styles.statusValueAlt}>AWAITING</Text>
              </View>
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
      </ScrollView>

      <View style={styles.bottomNav}>
        <Pressable style={styles.navItem}>
          <Ionicons name="bar-chart" size={24} color="#4338ca" />
          <Text style={styles.navLabel}>Reports</Text>
        </Pressable>
        <Pressable style={styles.navItem}>
          <Feather name="search" size={24} color="#94a3b8" />
          <Text style={styles.navLabelInactive}>Audit</Text>
        </Pressable>
      </View>
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
    paddingTop: Platform.OS === 'android' ? 24 : 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
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
    backgroundColor: '#4338ca',
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
  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#ffffff'
  },
  navItem: {
    alignItems: 'center'
  },
  navLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4338ca',
    marginTop: 4,
    letterSpacing: 1
  },
  navLabelInactive: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94a3b8',
    marginTop: 4,
    letterSpacing: 1
  },
  buttonDisabled: {
    opacity: 0.7
  }
});

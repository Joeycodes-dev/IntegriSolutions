import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../lib/AuthContext';
import { createTest } from '../services/api';
import { scanDriverLicense, type DriverLicenseData } from '../services/scanService';

type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  OfficerDashboard: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, 'OfficerDashboard'>;

type OfficerStep = 'idle' | 'scan' | 'reading';

export function OfficerDashboardScreen({ navigation }: Props) {
  const { profile, signOut } = useAuth();
  const cameraRef = useRef<React.ElementRef<typeof CameraView> | null>(null);
  const [step, setStep] = useState<OfficerStep>('idle');
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scannedData, setScannedData] = useState<DriverLicenseData | null>(null);
  const [bacReading, setBacReading] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

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
    setStep('scan');
  };

  const captureAndProcess = async () => {
    if (!cameraRef.current) return;

    try {
      setIsProcessing(true);
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.7 });
      if (!photo.base64) {
        throw new Error('Failed to capture image');
      }

      const data = await scanDriverLicense(photo.base64);
      setScannedData(data);
      setStep('reading');
    } catch (error) {
      Alert.alert('Scan failed', 'Unable to process the license image. Please try again.');
      setStep('idle');
    } finally {
      setIsProcessing(false);
    }
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

      <View style={styles.content}>
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
            <CameraView ref={cameraRef} style={styles.camera} facing="back" ratio="16:9" />
            <View style={styles.scanOverlay} />
            <View style={styles.scanActions}>
              <Pressable style={styles.secondaryButton} onPress={() => setStep('idle')}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.captureButton} onPress={captureAndProcess} disabled={isProcessing}>
                {isProcessing ? <ActivityIndicator color="#fff" /> : <Text style={styles.captureButtonText}>Capture License</Text>}
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
                <Text style={styles.subjectName}>{scannedData?.name}</Text>
                <Text style={styles.subjectLicense}>{scannedData?.licenseNumber}</Text>
              </View>
            </View>

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
      </View>

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
  content: {
    flex: 1,
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
  scanActions: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12
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

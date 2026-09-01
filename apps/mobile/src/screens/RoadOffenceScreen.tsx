import { useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../lib/AuthContext';
import { generateId } from '../lib/id';
import { createRoadOffence, type RoadOffenceAction, type RoadOffenceType, uploadRoadOffencePhotos } from '../services/api';
import { OfficerBottomNav } from '../components/OfficerBottomNav';

type RootStackParamList = {
  OfficerDashboard: undefined;
  OfficerReports: undefined;
  OfficerShifts: undefined;
  EmergencyChat: undefined;
  Audit: undefined;
  RoadOffence: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, 'RoadOffence'>;

const OFFENCES: Array<{ value: RoadOffenceType; label: string }> = [
  { value: 'driving_without_valid_licence', label: 'Driving without a valid licence' },
  { value: 'expired_driving_licence', label: 'Expired driving licence' },
  { value: 'expired_vehicle_licence_disc', label: 'Expired vehicle licence disc' },
  { value: 'vehicle_not_roadworthy', label: 'Vehicle not roadworthy' },
  { value: 'defective_lights', label: 'Defective lights' },
  { value: 'unsafe_tyres', label: 'Defective or unsafe tyres' },
  { value: 'no_seat_belt', label: 'No seat belt' },
  { value: 'mobile_phone_use', label: 'Using a mobile phone while driving' },
  { value: 'speeding', label: 'Speeding' },
  { value: 'traffic_control_non_compliance', label: 'Failure to obey a traffic sign, signal, or road marking' },
  { value: 'reckless_or_negligent_driving', label: 'Reckless or negligent driving' },
  { value: 'unsafe_overtaking', label: 'Unsafe overtaking' },
  { value: 'overloading', label: 'Overloading' },
  { value: 'registration_or_number_plate_non_compliance', label: 'Number plate or registration non-compliance' },
  { value: 'other', label: 'Other road offence' }
];

const ACTIONS: Array<{ value: RoadOffenceAction; label: string }> = [
  { value: 'warning', label: 'Warning issued' },
  { value: 'fine_or_notice', label: 'Fine or notice issued' },
  { value: 'vehicle_discontinued', label: 'Vehicle discontinued' },
  { value: 'referred', label: 'Referred' },
  { value: 'arrested', label: 'Arrested' },
  { value: 'other', label: 'Other action' }
];

async function captureLocation() {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') throw new Error('Location permission is required to submit a road offence.');
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  if (!Number.isFinite(position.coords.latitude) || !Number.isFinite(position.coords.longitude)) {
    throw new Error('Could not read valid GPS coordinates from this device.');
  }
  return { lat: position.coords.latitude, lng: position.coords.longitude };
}

export function RoadOffenceScreen({ navigation }: Props) {
  const { profile } = useAuth();
  const [offenceType, setOffenceType] = useState<RoadOffenceType | null>(null);
  const [actionTaken, setActionTaken] = useState<RoadOffenceAction | null>(null);
  const [driverName, setDriverName] = useState('');
  const [driverIdentifier, setDriverIdentifier] = useState('');
  const [vehicleRegistration, setVehicleRegistration] = useState('');
  const [vehicleDescription, setVehicleDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [photos, setPhotos] = useState<Array<{ uri: string; name: string; type: string }>>([]);
  const [picker, setPicker] = useState<'offence' | 'action' | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const offenceLabel = OFFENCES.find((option) => option.value === offenceType)?.label ?? 'Select offence type';
  const actionLabel = ACTIONS.find((option) => option.value === actionTaken)?.label ?? 'Select action taken';

  const addPhoto = async (source: 'camera' | 'library') => {
    const permission = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Photo permission required', 'Allow access to capture or select supporting evidence.');
      return;
    }
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.75 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.75 });
    if (result.canceled) return;
    const additions = result.assets.slice(0, 5 - photos.length).map((asset, index) => ({
      uri: asset.uri,
      name: asset.fileName || `road-offence-evidence-${Date.now()}-${index}.jpg`,
      type: asset.mimeType || 'image/jpeg'
    }));
    setPhotos((current) => [...current, ...additions]);
  };

  const choosePhotoSource = () => {
    if (photos.length >= 5) {
      Alert.alert('Photo limit reached', 'You can attach up to five supporting photos.');
      return;
    }
    Alert.alert('Add supporting photo', 'Choose where to get the evidence photo.', [
      { text: 'Take photo', onPress: () => void addPhoto('camera') },
      { text: 'Choose from library', onPress: () => void addPhoto('library') },
      { text: 'Cancel', style: 'cancel' }
    ]);
  };

  const submit = async () => {
    if (!offenceType || !actionTaken || !notes.trim()) {
      Alert.alert('Details required', 'Select an offence, select the action taken, and enter the observed facts.');
      return;
    }
    setSaving(true);
    try {
      const location = await captureLocation();
      const id = generateId();
      await createRoadOffence({
        id, offenceType, actionTaken, driverName, driverIdentifier,
        vehicleRegistration, vehicleDescription, notes, referenceNumber, location
      });
      if (photos.length > 0) {
        try {
          await uploadRoadOffencePhotos(id, photos);
        } catch (error) {
          Alert.alert('Record submitted', `The offence record is locked, but ${photos.length} supporting photo${photos.length === 1 ? '' : 's'} could not upload: ${error instanceof Error ? error.message : 'Unknown upload error'}`);
        }
      }
      setSubmitted(true);
    } catch (error) {
      Alert.alert('Submission failed', error instanceof Error ? error.message : 'Could not submit road offence.');
    } finally {
      setSaving(false);
    }
  };

  if (!profile) return null;

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.navigate('OfficerDashboard')} style={styles.backButton} accessibilityLabel="Back to home">
          <Feather name="arrow-left" size={21} color="#0f172a" />
        </Pressable>
        <View><Text style={styles.title}>Road Offence</Text><Text style={styles.subtitle}>New immutable roadside record</Text></View>
      </View>
      {submitted ? (
        <View style={styles.success}><Feather name="check-circle" size={48} color="#15803d" /><Text style={styles.successTitle}>Road offence submitted</Text><Text style={styles.successText}>This record is locked. Any follow-up is recorded through superuser review.</Text><Pressable style={styles.primary} onPress={() => navigation.navigate('OfficerDashboard')}><Text style={styles.primaryText}>Return to home</Text></Pressable></View>
      ) : (
        <KeyboardAvoidingView style={styles.formArea} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
          <Text style={styles.officer}>Reporting officer: {profile.name} {profile.surname} · {profile.badgeNumber}</Text>
          <Text style={styles.label}>OFFENCE TYPE *</Text>
          <Pressable style={styles.select} onPress={() => setPicker('offence')}><Text style={styles.selectText}>{offenceLabel}</Text><Feather name="chevron-down" size={18} color="#475569" /></Pressable>
          <Text style={styles.label}>ACTION TAKEN *</Text>
          <Pressable style={styles.select} onPress={() => setPicker('action')}><Text style={styles.selectText}>{actionLabel}</Text><Feather name="chevron-down" size={18} color="#475569" /></Pressable>
          <Text style={styles.section}>Driver and vehicle</Text>
          <TextInput value={driverName} onChangeText={setDriverName} placeholder="Driver name (if available)" style={styles.input} />
          <TextInput value={driverIdentifier} onChangeText={setDriverIdentifier} placeholder="ID or driving licence number (if available)" style={styles.input} />
          <TextInput value={vehicleRegistration} onChangeText={setVehicleRegistration} placeholder="Vehicle registration (if available)" autoCapitalize="characters" style={styles.input} />
          <TextInput value={vehicleDescription} onChangeText={setVehicleDescription} placeholder="Vehicle description (make, model, colour)" style={styles.input} />
          <Text style={styles.label}>OBSERVED FACTS *</Text>
          <TextInput value={notes} onChangeText={setNotes} placeholder={offenceType === 'other' ? 'Describe the other road offence clearly' : 'Record the observed facts'} multiline style={[styles.input, styles.notes]} />
          <TextInput value={referenceNumber} onChangeText={setReferenceNumber} placeholder="Fine, notice, or reference number (if issued)" style={styles.input} />
          <Text style={styles.section}>Supporting photos</Text>
          <Text style={styles.evidenceHint}>Optional. Attach up to five photos before the record is locked.</Text>
          <View style={styles.photoRow}>
            {photos.map((photo, index) => <View key={`${photo.uri}-${index}`} style={styles.photoTile}><Image source={{ uri: photo.uri }} style={styles.photo} /><Pressable onPress={() => setPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index))} style={styles.removePhoto} accessibilityLabel="Remove supporting photo"><Feather name="x" size={14} color="#fff" /></Pressable></View>)}
            {photos.length < 5 && <Pressable onPress={choosePhotoSource} style={styles.addPhoto}><Feather name="camera" size={21} color="#0f172a" /><Text style={styles.addPhotoText}>Add photo</Text></Pressable>}
          </View>
          <Text style={styles.locationNote}>GPS location and time are captured automatically when you submit.</Text>
          <Pressable style={[styles.primary, saving && styles.disabled]} disabled={saving} onPress={() => void submit()}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Submit and lock record</Text>}</Pressable>
        </ScrollView>
        </KeyboardAvoidingView>
      )}
      <OfficerBottomNav active="OfficerDashboard" />
      <Modal visible={picker !== null} transparent animationType="slide" onRequestClose={() => setPicker(null)}><Pressable style={styles.modalOverlay} onPress={() => setPicker(null)}><Pressable style={styles.sheet} onPress={() => {}}><Text style={styles.sheetTitle}>{picker === 'offence' ? 'Select offence type' : 'Select action taken'}</Text><ScrollView>{(picker === 'offence' ? OFFENCES : ACTIONS).map((option) => <Pressable key={option.value} style={styles.option} onPress={() => { if (picker === 'offence') setOffenceType(option.value as RoadOffenceType); else setActionTaken(option.value as RoadOffenceAction); setPicker(null); }}><Text style={styles.optionText}>{option.label}</Text></Pressable>)}</ScrollView></Pressable></Pressable></Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f8fafc' }, formArea: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 18, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e2e8f0' }, backButton: { padding: 6 }, title: { color: '#0f172a', fontWeight: '700', fontSize: 19 }, subtitle: { color: '#64748b', fontSize: 12, marginTop: 2 }, content: { padding: 18, gap: 10, paddingBottom: 150 }, officer: { backgroundColor: '#e0f2fe', color: '#0c4a6e', padding: 12, borderRadius: 6, fontSize: 12, marginBottom: 8 }, label: { color: '#475569', fontSize: 11, fontWeight: '700', marginTop: 6 }, section: { color: '#0f172a', fontSize: 15, fontWeight: '700', marginTop: 14 }, select: { height: 48, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6, backgroundColor: '#fff', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, selectText: { color: '#0f172a', fontSize: 14, flex: 1, paddingRight: 8 }, input: { minHeight: 48, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6, backgroundColor: '#fff', paddingHorizontal: 12, color: '#0f172a', fontSize: 14 }, notes: { minHeight: 115, textAlignVertical: 'top', paddingTop: 12 }, evidenceHint: { color: '#64748b', fontSize: 12 }, photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, photoTile: { width: 80, height: 80, position: 'relative' }, photo: { width: 80, height: 80, borderRadius: 6 }, removePhoto: { position: 'absolute', top: -6, right: -6, width: 23, height: 23, borderRadius: 12, backgroundColor: '#b91c1c', alignItems: 'center', justifyContent: 'center' }, addPhoto: { width: 80, height: 80, borderWidth: 1, borderStyle: 'dashed', borderColor: '#94a3b8', borderRadius: 6, alignItems: 'center', justifyContent: 'center', gap: 4 }, addPhotoText: { color: '#334155', fontSize: 11, fontWeight: '600' }, locationNote: { color: '#64748b', fontSize: 12, marginVertical: 6 }, primary: { minHeight: 48, borderRadius: 6, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, marginTop: 6 }, primaryText: { color: '#fff', fontSize: 14, fontWeight: '700' }, disabled: { opacity: 0.55 }, success: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 16 }, successTitle: { color: '#0f172a', fontSize: 20, fontWeight: '700' }, successText: { color: '#475569', fontSize: 14, textAlign: 'center', lineHeight: 21 }, modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' }, sheet: { maxHeight: '75%', backgroundColor: '#fff', borderTopLeftRadius: 12, borderTopRightRadius: 12, padding: 18 }, sheetTitle: { color: '#0f172a', fontSize: 17, fontWeight: '700', marginBottom: 8 }, option: { paddingVertical: 15, borderBottomWidth: 1, borderColor: '#e2e8f0' }, optionText: { color: '#1e293b', fontSize: 15 }
});
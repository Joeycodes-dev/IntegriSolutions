import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { login, register } from '../services/auth';
import { useAuth } from '../lib/AuthContext';
import type { UserProfile } from '../types';
import { Feather } from '@expo/vector-icons';

import { colors } from '../styles/colors';
import { styles } from './LoginScreen.styles';


type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  OfficerDashboard: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

const PROVINCES = ['Gauteng', 'Western Cape', 'KwaZulu-Natal', 'Eastern Cape', 'Free State', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape'];
const REGIONS = ['Johannesburg', 'Pretoria', 'Cape Town', 'Durban', 'Port Elizabeth', 'Bloemfontein', 'Polokwane', 'Nelspruit', 'Rustenburg', 'Kimberley'];
const EMPLOYMENT_STATUS = ['Active'];
const OFFICER_TYPES = [
  { id: 1, name: 'Traffic Officer' },
  { id: 2, name: 'Road Safety Officer' },
  { id: 3, name: 'Highway Patrol' }
];
const ROLES = [
  { id: 1, name: 'Officer' }
];

export function LoginScreen({ navigation }: Props) {
  const [isLogin, setIsLogin] = useState(true);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [badgeNumber, setBadgeNumber] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [employmentStatus, setEmploymentStatus] = useState('Active');
  const [province, setProvince] = useState('Gauteng');
  const [region, setRegion] = useState('Johannesburg');
  const [officerTypeId, setOfficerTypeId] = useState(1);
  const [roleId, setRoleId] = useState(1);
  const [devMode, setDevMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signIn, signInLocal, isRestoring, profile } = useAuth();

  useEffect(() => {
    if (!isRestoring && profile) {
      navigation.replace('OfficerDashboard');
    }
  }, [isRestoring, profile, navigation]);

  const handleSubmit = async () => {
    setError(null);
    setIsLoading(true);

    if (!email || !password) {
      setError('Email and password are required.');
      setIsLoading(false);
      return;
    }

    if (!isLogin) {
      if (!name || !surname || !badgeNumber || !idNumber) {
        setError('Please complete all required fields.');
        setIsLoading(false);
        return;
      }
    }

    try {
      if (devMode) {
        const profile: UserProfile = {
          uid: `local-${Date.now()}`,
          email,
          name: isLogin ? email.split('@')[0] : name,
          surname: isLogin ? '' : surname,
          badgeNumber: isLogin ? '0000' : badgeNumber,
          idNumber: isLogin ? '0000000000000' : idNumber,
          employmentStatus: 'Active',
          province: 'Gauteng',
          region: 'Johannesburg',
          officerTypeId: 1,
          roleId: 1,
          createdAt: new Date().toISOString()
        };

        await signInLocal(profile);
        navigation.replace('OfficerDashboard');
        return;
      }

      if (isLogin) {
        const response = await login(email.trim(), password);
        if (response.session?.access_token && response.profile) {
          await signIn(response.profile as UserProfile, response.session.access_token);
          navigation.replace('OfficerDashboard');
          return;
        }

        throw new Error('Login failed.');
      }

      const response = await register({
        email: email.trim(),
        password,
        name: name.trim(),
        surname: surname.trim(),
        badgeNumber: badgeNumber.trim(),
        idNumber: idNumber.trim(),
        employmentStatus,
        province,
        region,
        officerTypeId,
        roleId
      });

      if (response.session?.access_token && response.profile) {
        await signIn(response.profile as UserProfile, response.session.access_token);
        navigation.replace('OfficerDashboard');
        return;
      }

      Alert.alert('Registration complete', 'Please sign in with your new credentials.');
      setIsLogin(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auth failed');
    } finally {
      setIsLoading(false);
    }
  };

  const renderDropdown = <T extends string | number>(
    label: string,
    value: T,
    options: { label: string; value: T }[],
    onChange: (val: T) => void
  ) => (
    <View style={styles.dropdownContainer}>
      <Text style={styles.dropdownLabel}>{label}</Text>
      <View style={styles.dropdownRow}>
        {options.map((opt) => (
          <Pressable
            key={opt.value}
            style={[styles.dropdownButton, value === opt.value && styles.dropdownButtonActive]}
            onPress={() => onChange(opt.value)}
          >
            <Text style={[styles.dropdownButtonText, value === opt.value && styles.dropdownButtonTextActive]}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

          <View style={styles.card}>
            <View style={styles.tabHeader}>
              <TouchableOpacity onPress={() => setIsLogin(true)} style={styles.tabButton}>
                <Text style={[styles.tabLabel, isLogin && styles.activeTabLabel]}>Login</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setIsLogin(false)} style={styles.tabButton}>
                <Text style={[styles.tabLabel, !isLogin && styles.activeTabLabel]}>Register</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.subtitle}>Enter Your Details Below To Proceed</Text>

            <View style={styles.form}>
              {!isLogin && (
                <>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>First Name</Text>
                    <TextInput
                      value={name}
                      onChangeText={setName}
                      placeholder="First Name"
                      style={styles.input}
                      placeholderTextColor={colors.neutralGray}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Surname</Text>
                    <TextInput
                      value={surname}
                      onChangeText={setSurname}
                      placeholder="Surname"
                      style={styles.input}
                      placeholderTextColor={colors.neutralGray}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Badge / ID Number</Text>
                    <TextInput
                      value={badgeNumber}
                      onChangeText={setBadgeNumber}
                      placeholder="Badge / ID Number"
                      style={styles.input}
                      placeholderTextColor={colors.neutralGray}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>SA ID Number</Text>
                    <TextInput
                      value={idNumber}
                      onChangeText={setIdNumber}
                      placeholder="SA ID Number (13 digits)"
                      keyboardType="number-pad"
                      maxLength={13}
                      style={styles.input}
                      placeholderTextColor={colors.neutralGray}
                    />
                  </View>

                  {renderDropdown('Employment Status', employmentStatus, EMPLOYMENT_STATUS.map(s => ({ label: s, value: s })), setEmploymentStatus)}
                  {renderDropdown('Province', province, PROVINCES.map(p => ({ label: p, value: p })), setProvince)}
                  {renderDropdown('Region', region, REGIONS.map(r => ({ label: r, value: r })), setRegion)}
                  {renderDropdown('Officer Type', officerTypeId, OFFICER_TYPES.map(t => ({ label: t.name, value: t.id })), setOfficerTypeId)}
                  {renderDropdown('Role', roleId, ROLES.map(r => ({ label: r.name, value: r.id })), setRoleId)}
                </>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Officer ID / Email</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="SA-TRF-1217 or Email"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={styles.input}
                  textContentType="emailAddress"
                  placeholderTextColor={colors.neutralGray}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Password</Text>
                <View style={styles.passwordContainer}>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="**********"
                    secureTextEntry={!isPasswordVisible}
                    style={styles.passwordInput}
                    textContentType="password"
                    placeholderTextColor={colors.neutralGray}
                  />
                  <TouchableOpacity onPress={() => setIsPasswordVisible(!isPasswordVisible)}>
                    <Feather
                      name={isPasswordVisible ? 'eye-off' : 'eye'}
                      size={20}
                      color={colors.neutralGray}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {isLogin && (
                <TouchableOpacity style={styles.forgotPassword}>
                  <Text style={styles.linkText}>Forgot Password?</Text>
                </TouchableOpacity>
              )}

              {__DEV__ ? (
                <Pressable style={styles.devRow} onPress={() => setDevMode((current) => !current)}>
                  <View style={[styles.devToggle, devMode && styles.devToggleActive]}>
                    <View style={[styles.devDot, devMode && styles.devDotActive]} />
                  </View>
                  <Text style={styles.devLabel}>Developer bypass login</Text>
                </Pressable>
              ) : null}

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable style={[styles.primaryButton, isLoading && styles.buttonDisabled]} onPress={handleSubmit} disabled={isLoading}>
                {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{isLogin ? 'Login to Portal' : 'Register Service Profile'}</Text>}
              </Pressable>

              <View style={styles.footerContainer}>
                <Text style={styles.switchText}>
                  {isLogin ? "Don't have an account?" : 'Already have an account?'}
                  <Text style={styles.switchText} onPress={() => setIsLogin(!isLogin)}>
                    {isLogin ? ' Register' : ' Login'}
                  </Text>
                </Text>
              </View>

            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView >
  );
}

// const styles = StyleSheet.create({
//   page: {
//     flex: 1,
//     backgroundColor: '#f8fafc'
//   },
//   container: {
//     flexGrow: 1,
//     justifyContent: 'center',
//     padding: 24
//   },
//   card: {
//     backgroundColor: '#ffffff',
//     borderRadius: 24,
//     padding: 28,
//     shadowColor: '#0f172a',
//     shadowOpacity: 0.08,
//     shadowRadius: 28,
//     shadowOffset: { width: 0, height: 14 },
//     elevation: 8
//   },
//   headerSection: {
//     alignItems: 'center',
//     marginBottom: 28
//   },
//   brandBadge: {
//     width: 48,
//     height: 48,
//     borderRadius: 16,
//     backgroundColor: '#4338ca',
//     alignItems: 'center',
//     justifyContent: 'center',
//     marginBottom: 18,
//     shadowColor: '#4338ca',
//     shadowOpacity: 0.22,
//     shadowRadius: 10,
//     shadowOffset: { width: 0, height: 6 },
//     elevation: 5
//   },
//   brandBadgeText: {
//     color: '#fff',
//     fontWeight: '900',
//     fontSize: 24,
//     letterSpacing: 0.5
//   },
//   title: {
//     fontSize: 34,
//     fontWeight: '800',
//     color: '#0f172a',
//     marginBottom: 8,
//     textAlign: 'center'
//   },
//   titleAccent: {
//     color: '#4338ca'
//   },
//   subtitle: {
//     fontSize: 16,
//     color: '#475569',
//     marginBottom: 28,
//     textAlign: 'center'
//   },
//   form: {
//     gap: 14
//   },
//   input: {
//     backgroundColor: '#f8fafc',
//     borderColor: '#e2e8f0',
//     borderWidth: 1,
//     borderRadius: 16,
//     paddingHorizontal: 16,
//     paddingVertical: 14,
//     fontSize: 16,
//     color: '#0f172a'
//   },
//   dropdownContainer: {
//     gap: 6
//   },
//   dropdownLabel: {
//     fontSize: 12,
//     fontWeight: '700',
//     color: '#64748b',
//     letterSpacing: 0.5,
//     textTransform: 'uppercase'
//   },
//   dropdownRow: {
//     flexDirection: 'row',
//     flexWrap: 'wrap',
//     gap: 8
//   },
//   dropdownButton: {
//     paddingVertical: 8,
//     paddingHorizontal: 12,
//     borderRadius: 10,
//     backgroundColor: '#f8fafc',
//     borderWidth: 1,
//     borderColor: '#e2e8f0'
//   },
//   dropdownButtonActive: {
//     backgroundColor: '#eef2ff',
//     borderColor: '#4338ca'
//   },
//   dropdownButtonText: {
//     fontSize: 12,
//     color: '#475569',
//     fontWeight: '600'
//   },
//   dropdownButtonTextActive: {
//     color: '#4338ca'
//   },
//   devRow: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     gap: 12,
//     marginVertical: 8
//   },
//   devToggle: {
//     width: 44,
//     height: 24,
//     borderRadius: 999,
//     backgroundColor: '#e2e8f0',
//     justifyContent: 'center',
//     padding: 3
//   },
//   devToggleActive: {
//     backgroundColor: '#4338ca'
//   },
//   devDot: {
//     width: 18,
//     height: 18,
//     borderRadius: 9,
//     backgroundColor: '#ffffff',
//     alignSelf: 'flex-start'
//   },
//   devDotActive: {
//     alignSelf: 'flex-end'
//   },
//   devLabel: {
//     color: '#475569',
//     fontSize: 14
//   },
//   primaryButton: {
//     backgroundColor: '#4338ca',
//     borderRadius: 16,
//     height: 56,
//     alignItems: 'center',
//     justifyContent: 'center'
//   },
//   buttonDisabled: {
//     opacity: 0.7
//   },
//   primaryButtonText: {
//     color: '#ffffff',
//     fontSize: 16,
//     fontWeight: '700'
//   },
//   switchText: {
//     marginTop: 14,
//     textAlign: 'center',
//     color: '#64748b',
//     fontSize: 14
//   },
//   switchLink: {
//     color: '#4338ca',
//     fontWeight: '700'
//   },
//   error: {
//     color: '#b91c1c',
//     textAlign: 'center'
//   }
// });

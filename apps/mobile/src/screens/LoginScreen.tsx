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
import { Feather, Ionicons } from '@expo/vector-icons';

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
            <View style={styles.headerContainer}>
              <View style={styles.logoBox}>
                <Ionicons name="shield-checkmark" size={34} color="#FFFFFF" />
              </View>
              <Text style={styles.mainTitle}>Integri<Text style={styles.titleAccent}>Scan</Text>
              </Text>
            </View>

            <View style={styles.tabHeader}>
              <TouchableOpacity onPress={() => setIsLogin(true)} style={styles.tabButton}>
                <Text style={[styles.tabLabel, isLogin && styles.activeTabLabel]}>Login</Text>
                {isLogin && <View style={styles.activeIndicator} />}
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setIsLogin(false)} style={styles.tabButton}>
                <Text style={[styles.tabLabel, !isLogin && styles.activeTabLabel]}>Register</Text>
                {!isLogin && <View style={styles.activeIndicator} />}
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
                {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{isLogin ? 'Login' : 'Register Service Profile'}</Text>}
              </Pressable>

              <View style={styles.footerContainer}>
                <Text style={styles.switchText}>
                  {isLogin ? "Don't have an account?" : 'Already have an account?'}
                  <Text style={styles.switchLink} onPress={() => setIsLogin(!isLogin)}>
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

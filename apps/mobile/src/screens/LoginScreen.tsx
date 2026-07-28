import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { Feather, Ionicons } from '@expo/vector-icons';

import { completeOfficerInvite, login } from '../services/auth';
import { useAuth } from '../lib/AuthContext';
import { canAccessMobileApp } from '../lib/roles';
import type { UserProfile } from '../types';

// importing external styles
import { styles } from './LoginScreen.styles';
import { colors } from '../styles/colors';

type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  OfficerDashboard: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;
type AuthMode = 'login' | 'invite';

const MOBILE_ACCESS_ERROR = 'This mobile app is for officer accounts. Supervisors and administrators must use the web portal.';

function ensureMobileAccess(profile: UserProfile): void {
  if (!canAccessMobileApp(profile.roleId)) {
    throw new Error(MOBILE_ACCESS_ERROR);
  }
}

export function LoginScreen({ navigation }: Props) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteConfirmPassword, setInviteConfirmPassword] = useState('');
  const [devMode, setDevMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signIn, signInLocal, signOut, isRestoring, profile } = useAuth();

  useEffect(() => {
    if (!isRestoring && profile) {
      if (!canAccessMobileApp(profile.roleId)) {
        setError(MOBILE_ACCESS_ERROR);
        void signOut();
        return;
      }
      navigation.replace('OfficerDashboard');
    }
  }, [isRestoring, profile, signOut, navigation]);

  const switchMode = () => {
    setError(null);
    setMode((current) => current === 'login' ? 'invite' : 'login');
  };

  const handleSubmit = async () => {
    setError(null);
    setIsLoading(true);

    if (mode === 'invite') {
      if (!inviteLink.trim() || !invitePassword) {
        setError('Invite link and password are required.');
        setIsLoading(false);
        return;
      }

      if (invitePassword !== inviteConfirmPassword) {
        setError('Passwords do not match.');
        setIsLoading(false);
        return;
      }

      if (invitePassword.length < 6) {
        setError('Password must be at least 6 characters.');
        setIsLoading(false);
        return;
      }
    } else if (!email || !password) {
      setError('Email and password are required.');
      setIsLoading(false);
      return;
    }

    try {
      if (mode === 'invite') {
        const response = await completeOfficerInvite({
          invite: inviteLink.trim(),
          password: invitePassword
        });

        if (response.session?.access_token && response.profile) {
          const profile = response.profile as UserProfile;
          ensureMobileAccess(profile);
          await signIn(profile, response.session.access_token);
          navigation.replace('OfficerDashboard');
          return;
        }

        throw new Error('Invite setup failed.');
      }

      if (devMode) {
        const profile: UserProfile = {
          uid: `local-${Date.now()}`,
          email,
          name: email.split('@')[0],
          surname: '',
          badgeNumber: '0000',
          idNumber: '0000000000000',
          employmentStatus: 'Active',
          province: 'Gauteng',
          region: 'Johannesburg',
          officerTypeId: 1,
          roleId: 1,
          createdAt: new Date().toISOString()
        };

        ensureMobileAccess(profile);
        await signInLocal(profile);
        navigation.replace('OfficerDashboard');
        return;
      }

      const response = await login(email.trim(), password);
      if (response.session?.access_token && response.profile) {
        const profile = response.profile as UserProfile;
        ensureMobileAccess(profile);
        await signIn(profile, response.session.access_token);
        navigation.replace('OfficerDashboard');
        return;
      }

      throw new Error('Login failed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auth failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          
          {/* Header sits OUTSIDE the card */}
          <View style={styles.headerContainer}>
            <View style={styles.logoBox}>
              <Ionicons name="shield-checkmark" size={34} color="#fff" />
            </View>
            <Text style={styles.mainTitle}>
              Integri<Text style={styles.titleAccent}>Scan</Text>
            </Text>
            <Text style={styles.subtitle}>Safer Roads, Incorruptible Records</Text>
          </View>

          {/* Main Card Wrapper */}
          <View style={styles.card}>
            <View style={styles.form}>
              {mode === 'invite' ? (
                <>
                  <Text style={styles.inviteHelp}>
                    Paste the invite link from your email, then create your password. Your email address is already tied to the invite.
                  </Text>
                  
                  <TextInput
                    value={inviteLink}
                    onChangeText={setInviteLink}
                    placeholder="Paste invite link"
                    style={[styles.input, styles.inviteInput]}
                    multiline
                    autoCapitalize="none"
                    placeholderTextColor="#94a3b8"
                  />
                  
                  {/* Create Password with Eye Toggle */}
                  <View style={styles.passwordContainer}>
                    <TextInput
                      value={invitePassword}
                      onChangeText={setInvitePassword}
                      placeholder="Create password"
                      secureTextEntry={!isPasswordVisible}
                      style={styles.passwordInput}
                      textContentType="newPassword"
                      placeholderTextColor="#94a3b8"
                    />
                    <TouchableOpacity onPress={() => setIsPasswordVisible(!isPasswordVisible)}>
                      <Feather name={isPasswordVisible ? 'eye' : 'eye-off'} size={20} color={colors.neutralGray} />
                    </TouchableOpacity>
                  </View>

                  {/* Confirm Password with Eye Toggle */}
                  <View style={[styles.passwordContainer, { marginTop: 14 }]}>
                    <TextInput
                      value={inviteConfirmPassword}
                      onChangeText={setInviteConfirmPassword}
                      placeholder="Confirm password"
                      secureTextEntry={!isPasswordVisible}
                      style={styles.passwordInput}
                      textContentType="newPassword"
                      placeholderTextColor="#94a3b8"
                    />
                    <TouchableOpacity onPress={() => setIsPasswordVisible(!isPasswordVisible)}>
                      <Feather name={isPasswordVisible ? 'eye' : 'eye-off'} size={20} color={colors.neutralGray} />
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="Email"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    style={styles.input}
                    textContentType="emailAddress"
                    placeholderTextColor="#94a3b8"
                  />
                  
                  {/* Login Password with Eye Toggle - Fixed style={styles.passwordInput} */}
                  <View style={styles.passwordContainer}>
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      placeholder="Password"
                      secureTextEntry={!isPasswordVisible}
                      style={styles.passwordInput}
                      textContentType="password"
                      placeholderTextColor="#94a3b8"
                    />
                    <TouchableOpacity onPress={() => setIsPasswordVisible(!isPasswordVisible)}>
                      <Feather name={isPasswordVisible ? 'eye' : 'eye-off'} size={20} color={colors.neutralGray} />
                    </TouchableOpacity>
                  </View>

                  {__DEV__ ? (
                    <Pressable style={styles.devRow} onPress={() => setDevMode((current) => !current)}>
                      <View style={[styles.devToggle, devMode && styles.devToggleActive]}>
                        <View style={[styles.devDot, devMode && styles.devDotActive]} />
                      </View>
                      <Text style={styles.devLabel}>Developer bypass login</Text>
                    </Pressable>
                  ) : null}
                </>
              )}

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable style={[styles.primaryButton, isLoading && styles.buttonDisabled]} onPress={handleSubmit} disabled={isLoading}>
                {isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>{mode === 'invite' ? 'Create Officer Login' : 'Login to Portal'}</Text>
                )}
              </Pressable>

              <View style={styles.footerContainer}>
                <Text style={styles.switchText}>
                  {mode === 'login' ? 'Need access?' : 'Already onboarded?'}
                  <Text style={styles.switchLink} onPress={switchMode}>
                    {mode === 'login' ? ' Get invite link from admin' : ' Login'}
                  </Text>
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
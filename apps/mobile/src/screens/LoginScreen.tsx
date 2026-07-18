import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { completeOfficerInvite, login } from '../services/auth';
import { useAuth } from '../lib/AuthContext';
import { canAccessMobileApp } from '../lib/roles';
import type { UserProfile } from '../types';

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
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={styles.headerSection}>
            <View style={styles.brandBadge}>
              <Text style={styles.brandBadgeText}>IS</Text>
            </View>
            <Text style={styles.title}>
              Integri<Text style={styles.titleAccent}>Scan</Text>
            </Text>
            <Text style={styles.subtitle}>Safer Roads, Incorruptible Records</Text>
          </View>

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
                <TextInput
                  value={invitePassword}
                  onChangeText={setInvitePassword}
                  placeholder="Create password"
                  secureTextEntry
                  style={styles.input}
                  textContentType="newPassword"
                  placeholderTextColor="#94a3b8"
                />
                <TextInput
                  value={inviteConfirmPassword}
                  onChangeText={setInviteConfirmPassword}
                  placeholder="Confirm password"
                  secureTextEntry
                  style={styles.input}
                  textContentType="newPassword"
                  placeholderTextColor="#94a3b8"
                />
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
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  secureTextEntry
                  style={styles.input}
                  textContentType="password"
                  placeholderTextColor="#94a3b8"
                />

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

            <Text style={styles.switchText}>
              {mode === 'login' ? 'Need access?' : 'Already onboarded?'}
              <Text style={styles.switchLink} onPress={switchMode}>
                {mode === 'login' ? ' Get invite link from admin' : ' Login'}
              </Text>
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 28,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 28
  },
  brandBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#4338ca',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    shadowColor: '#4338ca',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5
  },
  brandBadgeText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 24,
    letterSpacing: 0.5
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 8,
    textAlign: 'center'
  },
  titleAccent: {
    color: '#4338ca'
  },
  subtitle: {
    fontSize: 16,
    color: '#475569',
    marginBottom: 28,
    textAlign: 'center'
  },
  form: {
    gap: 14
  },
  input: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#0f172a'
  },
  inviteInput: {
    minHeight: 92,
    textAlignVertical: 'top'
  },
  inviteHelp: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center'
  },
  devRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 8
  },
  devToggle: {
    width: 44,
    height: 24,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
    justifyContent: 'center',
    padding: 3
  },
  devToggleActive: {
    backgroundColor: '#4338ca'
  },
  devDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ffffff',
    alignSelf: 'flex-start'
  },
  devDotActive: {
    alignSelf: 'flex-end'
  },
  devLabel: {
    color: '#475569',
    fontSize: 14
  },
  primaryButton: {
    backgroundColor: '#4338ca',
    borderRadius: 16,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center'
  },
  buttonDisabled: {
    opacity: 0.7
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700'
  },
  switchText: {
    marginTop: 14,
    textAlign: 'center',
    color: '#64748b',
    fontSize: 14
  },
  switchLink: {
    color: '#4338ca',
    fontWeight: '700'
  },
  error: {
    color: '#b91c1c',
    textAlign: 'center'
  }
});

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { login, register, type UserRole } from '../services/auth';
import { useAuth } from '../lib/AuthContext';
import type { UserProfile } from '../types';

type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  OfficerDashboard: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [badgeNumber, setBadgeNumber] = useState('');
  const [role, setRole] = useState<UserRole>('officer');
  const [devMode, setDevMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signIn, signInLocal } = useAuth();

  const handleSubmit = async () => {
    setError(null);
    setIsLoading(true);

    if (!email || !password || (!isLogin && (!name || !badgeNumber))) {
      setError('Please complete all required fields.');
      setIsLoading(false);
      return;
    }

    try {
      if (devMode) {
        const profile: UserProfile = {
          uid: `local-${Date.now()}`,
          email,
          name: isLogin ? email.split('@')[0] : name,
          badgeNumber: isLogin ? '0000' : badgeNumber,
          role: isLogin ? 'officer' : role,
          createdAt: new Date().toISOString()
        };

        signInLocal(profile);
        navigation.replace('OfficerDashboard');
        return;
      }

      if (isLogin) {
        const response = await login(email.trim(), password);
        if (response.session?.access_token && response.profile) {
          signIn(response.profile as UserProfile, response.session.access_token);
          navigation.replace('OfficerDashboard');
          return;
        }

        throw new Error('Login failed.');
      }

      const response = await register(email.trim(), password, name.trim(), badgeNumber.trim(), role);
      if (response.session?.access_token && response.profile) {
        signIn(response.profile as UserProfile, response.session.access_token);
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

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.container}>
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
            {!isLogin && (
              <>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Full Name"
                  style={styles.input}
                  placeholderTextColor="#94a3b8"
                />
                <TextInput
                  value={badgeNumber}
                  onChangeText={setBadgeNumber}
                  placeholder="Badge / ID Number"
                  style={styles.input}
                  placeholderTextColor="#94a3b8"
                />
                <View style={styles.roleRow}>
                  <Pressable
                    style={[styles.roleButton, role === 'officer' ? styles.roleButtonActive : styles.roleButtonInactive]}
                    onPress={() => setRole('officer')}
                  >
                    <Text style={[styles.roleButtonText, role === 'officer' && styles.roleButtonTextActive]}>Traffic Officer</Text>
                  </Pressable>
                  <Pressable
                    disabled
                    style={[
                      styles.roleButton,
                      styles.roleButtonInactive,
                      styles.disabledRoleButton
                    ]}
                  >
                    <Text style={[styles.roleButtonText, styles.disabledRoleButtonText]}>Supervisor</Text>
                  </Pressable>
                </View>
              </>
            )}

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

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable style={[styles.primaryButton, isLoading && styles.buttonDisabled]} onPress={handleSubmit} disabled={isLoading}>
              {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{isLogin ? 'Login to Portal' : 'Register Service Profile'}</Text>}
            </Pressable>

            <Text style={styles.switchText}>
              {isLogin ? "Don't have an account?" : 'Already have an account?'}
              <Text style={styles.switchLink} onPress={() => setIsLogin(!isLogin)}>
                {isLogin ? ' Register' : ' Login'}
              </Text>
            </Text>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  container: {
    flex: 1,
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
  roleRow: {
    flexDirection: 'row',
    gap: 10
  },
  roleButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1
  },
  roleButtonActive: {
    backgroundColor: '#eef2ff',
    borderColor: '#c7d2fe'
  },
  roleButtonInactive: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0'
  },
  disabledRoleButton: {
    opacity: 0.5
  },
  roleButtonText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '600'
  },
  disabledRoleButtonText: {
    color: '#94a3b8'
  },
  roleButtonTextActive: {
    color: '#4338ca'
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

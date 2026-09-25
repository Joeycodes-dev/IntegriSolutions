import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { UserProfile } from '../types';
import {
  setAccessToken,
  getAccessToken,
  clearAccessToken,
  saveProfile,
  getStoredProfile,
  clearStoredProfile
} from '../services/auth';
import { API_BASE_URL } from '../services/constants';
import { logAuditEvent } from '../services/audit';
import { canAccessMobileApp } from './roles';
import { onAuthExpired } from '../services/api';
import { breathalyzerSession } from '../services/breathalyzer';

const MOBILE_ACCESS_ERROR = 'This mobile app is for officer accounts. Supervisors and administrators must use the web portal.';

function assertMobileAccess(profile: UserProfile): void {
  if (!canAccessMobileApp(profile.roleId)) {
    throw new Error(MOBILE_ACCESS_ERROR);
  }
}

function isUsableStoredProfile(value: unknown): value is UserProfile {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Partial<UserProfile>;
  return (
    typeof profile.uid === 'string' &&
    typeof profile.email === 'string' &&
    typeof profile.name === 'string' &&
    typeof profile.surname === 'string' &&
    typeof profile.badgeNumber === 'string' &&
    typeof profile.idNumber === 'string' &&
    typeof profile.employmentStatus === 'string' &&
    typeof profile.province === 'string' &&
    typeof profile.region === 'string' &&
    typeof profile.officerTypeId === 'number' &&
    typeof profile.roleId === 'number' &&
    typeof profile.createdAt === 'string'
  );
}

type AuthContextType = {
  profile: UserProfile | null;
  token: string | null;
  isRestoring: boolean;
  signIn: (profile: UserProfile, token: string | null) => Promise<void>;
  signInLocal: (profile: UserProfile) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      let storedToken: string | null = null;
      let storedProfile: UserProfile | null = null;

      try {
        storedToken = await getAccessToken();
        const storedProfileValue = await getStoredProfile();
        storedProfile = isUsableStoredProfile(storedProfileValue) ? storedProfileValue : null;
        if (storedProfileValue && !storedProfile) {
          await clearAccessToken();
          await clearStoredProfile();
          return;
        }

        if (storedToken && storedProfile) {
          if (!canAccessMobileApp(storedProfile.roleId)) {
            await clearAccessToken();
            await clearStoredProfile();
            return;
          }

          // A process restart must remain usable when the officer is offline.
          // Only an explicit authentication rejection should discard the
          // stored session; transport failures and server 5xx responses are
          // treated as an offline session and can be validated on the next
          // authenticated request.
          let profileResponse: Response;
          try {
            profileResponse = await fetch(`${API_BASE_URL}/profile`, {
              headers: {
                Authorization: `Bearer ${storedToken}`
              }
            });
          } catch {
            if (!cancelled) {
              setProfile(storedProfile);
              setToken(storedToken);
            }
            return;
          }

          if (
            profileResponse.status === 401 ||
            profileResponse.status === 403 ||
            (profileResponse.status >= 400 &&
              profileResponse.status < 500 &&
              profileResponse.status !== 408 &&
              profileResponse.status !== 429)
          ) {
            await clearAccessToken();
            await clearStoredProfile();
            return;
          }

          if (profileResponse.ok) {
            const latestProfile = await profileResponse
              .json()
              .catch(() => null);
            if (isUsableStoredProfile(latestProfile)) {
              storedProfile = latestProfile;
              await saveProfile(latestProfile);
            }
          }

          if (!cancelled) {
            setProfile(storedProfile);
            setToken(storedToken);
          }
        } else if (
          storedProfile &&
          typeof storedProfile.uid === 'string' &&
          !storedToken &&
          storedProfile.uid.startsWith('local-') &&
          canAccessMobileApp(storedProfile.roleId)
        ) {
          // Local developer/offline login intentionally has no bearer token.
          if (!cancelled) {
            setProfile(storedProfile);
            setToken(null);
          }
        } else {
          await clearAccessToken();
          await clearStoredProfile();
        }
      } catch {
        // Secure-store failures should not manufacture a false sign-out. If
        // the stored values were readable before the failure, retain them.
        if (!cancelled && storedProfile) {
          setProfile(storedProfile);
          setToken(storedToken);
        }
      } finally {
        if (!cancelled) setIsRestoring(false);
      }
    }

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthExpired(() => {
      void breathalyzerSession.disconnect();
      setProfile(null);
      setToken(null);
      void clearAccessToken();
      void clearStoredProfile();
    });

    return unsubscribe;
  }, []);

  const signIn = useCallback(async (profileData: UserProfile, tokenValue: string | null) => {
    await breathalyzerSession.disconnect();
    assertMobileAccess(profileData);
    if (tokenValue) {
      await setAccessToken(tokenValue);
    } else {
      await clearAccessToken();
    }
    await saveProfile(profileData as any);
    setProfile(profileData);
    setToken(tokenValue);
    await logAuditEvent({
      action: 'auth.login',
      outcome: 'success',
      message: `Officer ${profileData.name} ${profileData.surname} signed in`,
      officerId: profileData.officerId ?? null,
      officerName: `${profileData.name} ${profileData.surname}`.trim(),
      badgeNumber: profileData.badgeNumber,
      metadata: { mode: tokenValue ? 'remote' : 'local' }
    });
  }, []);

  const signInLocal = useCallback(async (profileData: UserProfile) => {
    await breathalyzerSession.disconnect();
    assertMobileAccess(profileData);
    await clearAccessToken();
    await saveProfile(profileData as any);
    setProfile(profileData);
    setToken(null);
    await logAuditEvent({
      action: 'auth.login',
      outcome: 'success',
      message: `Officer ${profileData.name} ${profileData.surname} signed in (offline)`,
      officerId: profileData.officerId ?? null,
      officerName: `${profileData.name} ${profileData.surname}`.trim(),
      badgeNumber: profileData.badgeNumber,
      metadata: { mode: 'local' }
    });
  }, []);

  const signOut = useCallback(async () => {
    await breathalyzerSession.disconnect();
    const current = profile;
    // Clear in-memory auth state first so login screen does not auto-redirect back during logout.
    setProfile(null);
    setToken(null);

    try {
      const cleanup = await Promise.allSettled([
        clearAccessToken(),
        clearStoredProfile()
      ]);
      if (__DEV__) {
        cleanup
          .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
          .forEach((result) => {
            console.warn('Sign out cleanup warning:', result.reason);
          });
      }
      if (current) {
        await logAuditEvent({
          action: 'auth.logout',
          outcome: 'success',
          message: `Officer ${current.name} ${current.surname} signed out`,
          officerId: current.officerId ?? null,
          officerName: `${current.name} ${current.surname}`.trim(),
          badgeNumber: current.badgeNumber
        });
      }
    } catch (error) {
      if (__DEV__) {
        console.warn('Sign out warning:', error);
      }
    }
  }, [profile]);

  return (
    <AuthContext.Provider value={{ profile, token, isRestoring, signIn, signInLocal, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

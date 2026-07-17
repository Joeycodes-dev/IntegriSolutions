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
import { logAuditEvent } from '../services/audit';

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
    async function restoreSession() {
      try {
        const storedToken = await getAccessToken();
        const storedProfile = await getStoredProfile();
        if (storedToken && storedProfile) {
          setProfile(storedProfile);
          setToken(storedToken);
        }
      } catch {
        // Session restore failed — user needs to re-login
      } finally {
        setIsRestoring(false);
      }
    }
    restoreSession();
  }, []);

  const signIn = useCallback(async (profileData: UserProfile, tokenValue: string | null) => {
    setProfile(profileData);
    setToken(tokenValue);
    if (tokenValue) {
      await setAccessToken(tokenValue);
    }
    await saveProfile(profileData as any);
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
    setProfile(profileData);
    setToken(null);
    await clearAccessToken();
    await saveProfile(profileData as any);
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
    const current = profile;
    setProfile(null);
    setToken(null);
    await clearAccessToken();
    await clearStoredProfile();
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

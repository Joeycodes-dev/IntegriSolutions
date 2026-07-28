import { createContext, useContext, useEffect, useState } from 'react';
import { AUTH_EXPIRED_EVENT, clearAccessToken, getAccessToken, getProfile, setAccessToken } from '../services/api';
import type { UserProfile } from '../types';

const PROFILE_STORAGE_KEY = 'local_auth_profile';

function loadLocalProfile(): UserProfile | null {
  const stored = localStorage.getItem(PROFILE_STORAGE_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as UserProfile;
  } catch {
    return null;
  }
}

function saveLocalProfile(profile: UserProfile) {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

function clearLocalProfile() {
  localStorage.removeItem(PROFILE_STORAGE_KEY);
}

interface AuthContextType {
  user: UserProfile | null;
  profile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  signIn: (profileData: UserProfile, token: string) => void;
  signInLocal: (profile: UserProfile) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const clearAuthState = () => {
    clearAccessToken();
    clearLocalProfile();
    setUser(null);
    setProfile(null);
  };

  useEffect(() => {
    const initAuth = async () => {
      const savedProfile = loadLocalProfile();
      if (savedProfile) {
        setUser(savedProfile);
        setProfile(savedProfile);
        setLoading(false);
        return;
      }

      const token = getAccessToken();
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const profileData = await getProfile();
        setUser(profileData);
        setProfile(profileData);
      } catch (error) {
        console.error('Authentication refresh failed:', error);
        clearAccessToken();
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  useEffect(() => {
    const handleAuthExpired = () => {
      clearAuthState();
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    };
  }, []);

  const signIn = (profileData: UserProfile, token: string) => {
    setAccessToken(token);
    saveLocalProfile(profileData);
    setUser(profileData);
    setProfile(profileData);
  };

  const signInLocal = (profileData: UserProfile) => {
    clearAccessToken();
    saveLocalProfile(profileData);
    setUser(profileData);
    setProfile(profileData);
  };

  const signOut = async () => {
    clearAuthState();
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut, signIn, signInLocal }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

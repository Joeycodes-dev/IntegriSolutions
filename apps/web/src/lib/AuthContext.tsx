import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AUTH_EXPIRED_EVENT, clearAccessToken, getAccessToken, getProfile, getRuntimeConfig, setAccessToken } from '../services/api';
import type { UserProfile } from '../types';

const PROFILE_STORAGE_KEY = 'local_auth_profile';
const LAST_ACTIVITY_KEY = 'integriscan:last_activity';
const IDLE_CHECK_MS = 15_000;
const DEFAULT_SESSION_TIMEOUT_MINUTES = 30;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const;

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
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(DEFAULT_SESSION_TIMEOUT_MINUTES);
  const lastActivityRef = useRef<number>(Date.now());
  const idleTimerRef = useRef<number | null>(null);

  const clearAuthState = () => {
    clearAccessToken();
    clearLocalProfile();
    try {
      localStorage.removeItem(LAST_ACTIVITY_KEY);
    } catch {
      // ignore storage failures
    }
    setUser(null);
    setProfile(null);
  };

  const touchActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    try {
      localStorage.setItem(LAST_ACTIVITY_KEY, String(lastActivityRef.current));
    } catch {
      // ignore storage failures
    }
  }, []);

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
    const handleAuthExpired = (event: Event) => {
      // Ignore events from requests that were sent with a different token
      // (e.g. a stale background request resolving after a fresh sign-in).
      const detail = (event as CustomEvent).detail as
        | { message?: string; token?: string | null }
        | undefined;
      if (detail?.token != null && detail.token !== getAccessToken()) return;
      clearAuthState();
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    };
  }, []);

  // Sign out in other tabs when the token is cleared here.
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'backend_access_token' && !event.newValue) {
        clearAuthState();
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  // Fetch the administrator-configured idle timeout (web portal only).
  useEffect(() => {
    if (!user) {
      setSessionTimeoutMinutes(DEFAULT_SESSION_TIMEOUT_MINUTES);
      return;
    }
    let cancelled = false;
    getRuntimeConfig()
      .then((config) => {
        if (!cancelled) {
          setSessionTimeoutMinutes(config.auth.sessionTimeoutMinutes);
        }
      })
      .catch(() => {
        // Offline or unconfigured: keep the default idle timeout.
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Idle inactivity enforcement. The timeout is client-side inactivity only;
  // it is independent of Supabase JWT expiry and applies to the web portal only.
  useEffect(() => {
    if (!user) return;

    try {
      const stored = Number(localStorage.getItem(LAST_ACTIVITY_KEY) ?? '0');
      if (stored > lastActivityRef.current) lastActivityRef.current = stored;
    } catch {
      // ignore storage failures
    }
    touchActivity();

    let throttled = false;
    const onActivity = () => {
      if (throttled) return;
      throttled = true;
      setTimeout(() => {
        throttled = false;
      }, 2000);
      touchActivity();
    };
    const onFocus = () => {
      touchActivity();
    };

    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, onActivity));
    window.addEventListener('focus', onFocus);

    const checkIdle = () => {
      const idleMs = Date.now() - lastActivityRef.current;
      if (sessionTimeoutMinutes > 0 && idleMs >= sessionTimeoutMinutes * 60_000) {
        clearAuthState();
      }
    };
    idleTimerRef.current = window.setInterval(checkIdle, IDLE_CHECK_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, onActivity));
      window.removeEventListener('focus', onFocus);
      if (idleTimerRef.current != null) {
        window.clearInterval(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };
  }, [user, sessionTimeoutMinutes]);

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

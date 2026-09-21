import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AUTH_EXPIRED_EVENT, clearAccessToken, getAccessToken, getProfile, getRuntimeConfig, setAccessToken, setActorRoleId } from '../services/api';
import type { UserProfile } from '../types';

const LAST_ACTIVITY_KEY = 'integriscan:last_activity';
const IDLE_CHECK_MS = 15_000;
const DEFAULT_SESSION_TIMEOUT_MINUTES = 30;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const;
const EXPIRED_TOKEN_MESSAGE = /invalid or expired access token/i;

function isExpiredTokenError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return EXPIRED_TOKEN_MESSAGE.test(error.message);
}

// Auth state (token + profile) is intentionally NOT persisted to localStorage —
// see services/api.ts. The profile in particular carries a national ID number
// and email, so it doesn't qualify as "non-sensitive display data" either.
// Consequence: a page refresh always requires signing in again (initAuth()
// below never has a token to restore), and this tab's session is not shared
// with other tabs — each tab now holds its own independent in-memory auth
// state, so opening a new tab also requires a fresh login.

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
  const validatingExpiredRef = useRef(false);

  const clearAuthState = () => {
    clearAccessToken();
    setActorRoleId(null);
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
      // getAccessToken() reads memory-only state, so on every fresh page
      // load/refresh this is null and the app always starts unauthenticated.
      // This branch only ever fires for an already-authenticated in-page
      // remount (e.g. AuthProvider re-mounting without a full page reload).
      const token = getAccessToken();
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const profileData = await getProfile();
        setUser(profileData);
        setProfile(profileData);
        setActorRoleId(profileData.roleId);
      } catch (error) {
        console.error('Authentication refresh failed:', error);
        clearAuthState();
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  useEffect(() => {
    const handleAuthExpired = async (event: Event) => {
      // Ignore events from requests that were sent with a different token
      // (e.g. a stale background request resolving after a fresh sign-in).
      const detail = (event as CustomEvent).detail as
        | { message?: string; token?: string | null }
        | undefined;
      const activeToken = getAccessToken();
      if (!activeToken) {
        clearAuthState();
        return;
      }
      if (detail?.token != null && detail.token !== activeToken) return;

      if (validatingExpiredRef.current) return;
      validatingExpiredRef.current = true;
      try {
        await getProfile();
      } catch (error) {
        if (isExpiredTokenError(error)) {
          clearAuthState();
        }
      } finally {
        validatingExpiredRef.current = false;
      }
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    };
  }, []);

  // Note: cross-tab "sign out other tabs when this tab logs out" previously
  // worked by watching the access token's localStorage key disappear. Since
  // the token is now memory-only per tab (by design — see services/api.ts),
  // that signal no longer exists: each tab holds an independent session, so
  // there is nothing to cross-tab-synchronize here anymore. Logging out in
  // one tab no longer logs out another already-open tab; each tab's own idle
  // timeout / expired-token handling (below) still applies independently.

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
    setActorRoleId(profileData.roleId);
    setUser(profileData);
    setProfile(profileData);
  };

  const signInLocal = (profileData: UserProfile) => {
    clearAccessToken();
    setActorRoleId(profileData.roleId);
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

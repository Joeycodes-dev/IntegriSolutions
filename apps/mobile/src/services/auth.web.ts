import { API_BASE_URL } from './constants';

export type UserRole = 'officer' | 'supervisor';

export interface AuthSession {
  token: string;
  profile: {
    uid: string;
    officerId?: number;
    email: string;
    name: string;
    surname: string;
    badgeNumber: string;
    idNumber: string;
    employmentStatus: string;
    province: string;
    region: string;
    officerTypeId: number;
    roleId: number;
    createdAt: string;
  };
}

/**
 * expo-secure-store has no web implementation (its native module resolves to an
 * empty object on web), so this file is the web counterpart of services/auth.ts,
 * picked up automatically by Metro's platform-extension resolution.
 *
 * The access token and profile are kept in memory only — never written to
 * localStorage/sessionStorage. The profile in particular includes a national ID
 * number, so it does not qualify as "non-sensitive display data" and must not be
 * persisted in browser storage either. This means a page refresh loses the
 * session and the user must sign in again. That's an accepted trade-off: the
 * Expo web target is a development/test target, not the authoritative offline
 * field deployment (native iOS/Android, which still uses expo-secure-store
 * unchanged), so this must not be mistaken for — or weakened into — a
 * browser-storage-backed "remember me" mechanism.
 */
let memoryToken: string | null = null;
let memoryProfile: AuthSession['profile'] | null = null;

export async function setAccessToken(token: string): Promise<void> {
  memoryToken = token;
}

export async function getAccessToken(): Promise<string | null> {
  return memoryToken;
}

export async function clearAccessToken(): Promise<void> {
  memoryToken = null;
}

export async function saveProfile(profile: AuthSession['profile']): Promise<void> {
  memoryProfile = profile;
}

export async function getStoredProfile(): Promise<AuthSession['profile'] | null> {
  return memoryProfile;
}

export async function clearStoredProfile(): Promise<void> {
  memoryProfile = null;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options.headers ?? {})
      },
      ...options
    });
  } catch (error) {
    throw new Error(`Network error requesting ${API_BASE_URL}${path}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error((body as any)?.error ?? 'API request failed');
  }

  return body as T;
}

export async function login(email: string, password: string) {
  return request<{ session?: { access_token: string }; profile: any }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}

export async function completeOfficerInvite(params: {
  invite: string;
  password: string;
}) {
  return request<{ session?: { access_token: string }; profile: any }>('/auth/officer-invite', {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

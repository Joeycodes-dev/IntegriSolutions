import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from './constants';

const TOKEN_KEY = 'integiscan_auth_token';
const PROFILE_KEY = 'integiscan_user_profile';

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

export async function setAccessToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearAccessToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function saveProfile(profile: AuthSession['profile']): Promise<void> {
  await SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify(profile));
}

export async function getStoredProfile(): Promise<AuthSession['profile'] | null> {
  const raw = await SecureStore.getItemAsync(PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function clearStoredProfile(): Promise<void> {
  await SecureStore.deleteItemAsync(PROFILE_KEY);
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

export async function register(params: {
  email: string;
  password: string;
  name: string;
  surname: string;
  badgeNumber: string;
  idNumber: string;
  employmentStatus: string;
  province: string;
  region: string;
  officerTypeId: number;
  roleId: number;
}) {
  return request<{ session?: { access_token: string }; profile: any }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

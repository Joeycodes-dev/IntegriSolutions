import { NativeModules, Platform } from 'react-native';
import Constants from 'expo-constants';

function parseHost(candidate: string) {
  if (!candidate) {
    return '';
  }

  const urlMatch = candidate.match(/https?:\/\/([^:/]+)(?::\d+)?/);
  if (urlMatch?.[1]) {
    return urlMatch[1];
  }

  const hostMatch = candidate.match(/^([^:]+)(?::\d+)?$/);
  return hostMatch?.[1] ?? '';
}

function getApiHost() {
  const scriptURL = (NativeModules?.SourceCode?.scriptURL ?? '') as string;
  const debuggerHost = (Constants?.manifest?.debuggerHost ?? (Constants?.expoConfig as any)?.hostUri ?? '') as string;
  const hostFromConstants = parseHost(debuggerHost);
  const hostFromSourceCode = parseHost(scriptURL);

  if (hostFromConstants) {
    return hostFromConstants;
  }
  if (hostFromSourceCode) {
    return hostFromSourceCode;
  }

  return Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
}

const API_BASE_URL = `http://${getApiHost()}:4000/api`;

let accessToken: string | null = null;

export function setAccessToken(token: string) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function clearAccessToken() {
  accessToken = null;
}

async function request<T>(path: string, options: RequestInit = {}) {
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

export type UserRole = 'officer' | 'supervisor';

export async function login(email: string, password: string) {
  return request<{ session?: { access_token: string }; profile: any }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}

export async function register(
  email: string,
  password: string,
  name: string,
  badgeNumber: string,
  role: UserRole
) {
  return request<{ session?: { access_token: string }; profile: any }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name, badgeNumber, role })
  });
}

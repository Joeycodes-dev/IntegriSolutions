import { NativeModules, Platform } from 'react-native';
import { getAccessToken } from './auth';
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

async function request<T>(path: string, options: RequestInit = {}) {
  const token = getAccessToken();
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {})
      },
      ...options
    });
  } catch (error) {
    throw new Error(`Network error requesting ${API_BASE_URL}${path}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error((payload as any)?.error ?? 'API request failed');
  }

  return payload as T;
}

export async function createTest(payload: Record<string, unknown>) {
  return request<any>('/tests', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

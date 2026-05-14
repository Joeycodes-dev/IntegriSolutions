import { getAccessToken } from './auth';
import { API_BASE_URL } from './constants';

async function request<T>(path: string, options: RequestInit = {}) {
  const token = await getAccessToken();
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

export async function syncRecords(records: Record<string, unknown>[]) {
  return request<{ synced: string[]; failed: { id: string; error: string }[]; duplicates: string[] }>('/sync', {
    method: 'POST',
    body: JSON.stringify({ records })
  });
}
import { getAccessToken } from './auth';
import { API_BASE_URL } from './constants';

async function request<T>(path: string, options: RequestInit = {}) {
  const token = await getAccessToken();
  const url = `${API_BASE_URL}${path}`;
  console.log(`[api] fetch ${url}`);
  let response: Response;
  try {
    response = await fetch(url, {
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

export async function uploadEvidencePhoto(testId: string, photoUri: string) {
  const token = await getAccessToken();
  const url = `${API_BASE_URL}/evidence/${testId}`;

  const formData = new FormData();
  formData.append('photo', {
    uri: photoUri,
    type: 'image/jpeg',
    name: `${testId}-${Date.now()}.jpg`
  } as any);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: formData
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error((payload as any)?.error ?? 'Photo upload failed');
  }

  return payload;
}

export async function invalidateTest(testId: string, reason: string) {
  const token = await getAccessToken();
  const url = `${API_BASE_URL}/invalidations/${testId}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ reason })
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error((payload as any)?.error ?? 'Invalidation failed');
  }

  return payload;
}
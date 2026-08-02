import { clearAccessToken, getAccessToken } from './auth';
import { API_BASE_URL } from './constants';
import { logAuditEvent } from './audit';
import { Platform } from 'react-native';

export interface AuditActor {
  officerId: number | null;
  officerName: string;
  badgeNumber: string;
}

interface RequestBehavior {
  retryWithoutAuthOnInvalidToken?: boolean;
}

const EXPIRED_TOKEN_MESSAGE = /invalid or expired access token/i;

function extractErrorMessage(payload: unknown): string {
  const candidate = (payload as { error?: unknown })?.error;
  return typeof candidate === 'string' && candidate.trim() ? candidate : 'API request failed';
}

async function request<T>(path: string, options: RequestInit = {}, behavior: RequestBehavior = {}) {
  const token = await getAccessToken();
  const url = `${API_BASE_URL}${path}`;
  console.log(`[api] fetch ${url}`);
  const baseHeaders = {
    'Content-Type': 'application/json',
    ...(options.headers ?? {})
  };

  const doFetch = async (bearerToken: string | null): Promise<Response> => {
    return fetch(url, {
      headers: {
        ...baseHeaders,
        ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {})
      },
      ...options
    });
  };

  let response: Response;
  try {
    response = await doFetch(token);
  } catch (error) {
    throw new Error(`Network error requesting ${API_BASE_URL}${path}: ${error instanceof Error ? error.message : String(error)}`);
  }

  let payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMessage = extractErrorMessage(payload);
    const shouldRetryWithoutAuth =
      response.status === 401
      && !!token
      && behavior.retryWithoutAuthOnInvalidToken
      && EXPIRED_TOKEN_MESSAGE.test(errorMessage);

    if (shouldRetryWithoutAuth) {
      await clearAccessToken();
      try {
        response = await doFetch(null);
      } catch (error) {
        throw new Error(`Network error requesting ${API_BASE_URL}${path}: ${error instanceof Error ? error.message : String(error)}`);
      }

      payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(extractErrorMessage(payload));
      }

      return payload as T;
    }

    throw new Error(errorMessage);
  }

  return payload as T;
}

export async function createTest(payload: Record<string, unknown>) {
  return request<any>('/tests', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateDutyStatus(status: string) {
  return request<{ dutyStatus: string }>('/profile/duty-status', {
    method: 'PATCH',
    body: JSON.stringify({ status })
  });
}

export async function syncRecords(records: Record<string, unknown>[]) {
  return request<{ synced: string[]; failed: { id: string; error: string }[]; duplicates: string[] }>('/sync', {
    method: 'POST',
    body: JSON.stringify({ records })
  });
}

export async function uploadEvidencePhoto(
  testId: string,
  photoUri: string,
  category?: string
) {
  const token = await getAccessToken();
  const url = `${API_BASE_URL}/evidence/${testId}`;

  const formData = new FormData();

  if (category) {
    formData.append('category', category);
  }

  if (Platform.OS === 'web') {
    const imageResponse = await fetch(photoUri);
    const blob = await imageResponse.blob();
    formData.append('photo', blob, `${testId}-${Date.now()}.jpg`);
  } else {
    formData.append('photo', {
      uri: photoUri,
      type: 'image/jpeg',
      name: `${testId}-${Date.now()}.jpg`
    } as any);
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: formData
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMessage = extractErrorMessage(payload);
    if (response.status === 401 && EXPIRED_TOKEN_MESSAGE.test(errorMessage)) {
      await clearAccessToken();
      throw new Error('Evidence upload deferred: session expired. Sign in again to upload photos.');
    }
    throw new Error(errorMessage || 'Photo upload failed');
  }

  return payload;
}

export async function invalidateTest(testId: string, reason: string, actor?: AuditActor) {
  const token = await getAccessToken();
  const url = `${API_BASE_URL}/invalidations/${testId}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ reason })
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network error';
    await logAuditEvent({
      action: 'test.invalidation.failed',
      outcome: 'failure',
      severity: 'warning',
      message: `Failed to invalidate test ${testId}: ${message}`,
      entityType: 'test',
      entityId: testId,
      officerId: actor?.officerId ?? null,
      officerName: actor?.officerName,
      badgeNumber: actor?.badgeNumber,
      metadata: { reason, error: message }
    });
    throw new Error(`Network error requesting ${API_BASE_URL}/invalidations/${testId}: ${message}`);
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMessage = (payload as any)?.error ?? 'Invalidation failed';
    await logAuditEvent({
      action: 'test.invalidation.failed',
      outcome: 'failure',
      severity: 'warning',
      message: `Invalidation rejected for test ${testId}: ${errorMessage}`,
      entityType: 'test',
      entityId: testId,
      officerId: actor?.officerId ?? null,
      officerName: actor?.officerName,
      badgeNumber: actor?.badgeNumber,
      metadata: { reason, error: errorMessage }
    });
    throw new Error(errorMessage);
  }

  await logAuditEvent({
    action: 'test.invalidated',
    outcome: 'success',
    severity: 'warning',
    message: `Test ${testId} marked invalid`,
    entityType: 'test',
    entityId: testId,
    officerId: actor?.officerId ?? null,
    officerName: actor?.officerName,
    badgeNumber: actor?.badgeNumber,
    metadata: { reason }
  });

  return payload;
}
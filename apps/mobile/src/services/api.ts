import { getAccessToken } from './auth';
import { API_BASE_URL } from './constants';
import { logAuditEvent } from './audit';

export interface AuditActor {
  officerId: number | null;
  officerName: string;
  badgeNumber: string;
}

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
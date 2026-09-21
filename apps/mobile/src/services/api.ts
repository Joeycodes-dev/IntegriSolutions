import { clearAccessToken, getAccessToken, getStoredProfile } from './auth';
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

type AuthExpiredListener = (message: string) => void;

let authExpiredListener: AuthExpiredListener | null = null;

function notifyAuthExpired(message: string) {
  authExpiredListener?.(message);
}

export function onAuthExpired(listener: AuthExpiredListener) {
  authExpiredListener = listener;
  return () => {
    if (authExpiredListener === listener) {
      authExpiredListener = null;
    }
  };
}

/** True when `request()` failed before reaching the server (see the `doFetch`
 * catch below) rather than the server responding with a 4xx/5xx — callers use
 * this to decide whether a failure is worth queuing for retry. */
export function isNetworkRequestError(err: unknown): boolean {
  return err instanceof Error && /^Network error requesting/.test(err.message);
}

function extractErrorMessage(payload: unknown): string {
  const candidate = (payload as { error?: unknown })?.error;
  return typeof candidate === 'string' && candidate.trim() ? candidate : 'API request failed';
}

async function request<T>(path: string, options: RequestInit = {}, behavior: RequestBehavior = {}) {
  const token = await getAccessToken();
  const storedProfile = await getStoredProfile();
  const roleId = Number(storedProfile?.roleId);
  const roleHeader: Record<string, string> = Number.isInteger(roleId) && (roleId === 1 || roleId === 2 || roleId === 3)
    ? { 'X-Actor-Role-Id': String(roleId) }
    : {};
  const url = `${API_BASE_URL}${path}`;
  console.log(`[api] fetch ${url}`);
  
  // Don't set Content-Type for FormData - let fetch handle it automatically with boundary
  const baseHeaders: Record<string, string> = {};
  if (!(options.body instanceof FormData)) {
    baseHeaders['Content-Type'] = 'application/json';
  }
  const finalHeaders = {
    ...baseHeaders,
    ...(options.headers ?? {})
  };

  const doFetch = async (bearerToken: string | null): Promise<Response> => {
    return fetch(url, {
      headers: {
        ...finalHeaders,
        ...roleHeader,
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
      notifyAuthExpired(errorMessage);
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

    if (response.status === 401 && EXPIRED_TOKEN_MESSAGE.test(errorMessage)) {
      await clearAccessToken();
      notifyAuthExpired(errorMessage);
      throw new Error('Session expired. Please sign in again.');
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

export async function getRuntimeConfig() {
  return request<import('../types').RuntimeConfig>('/config/runtime');
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
      notifyAuthExpired(errorMessage);
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

export async function getChatOfficerContacts(query?: string) {
  const params = new URLSearchParams();
  if (query?.trim()) {
    params.set('q', query.trim());
  }
  const path = params.toString()
    ? `/chat/contacts/officers?${params.toString()}`
    : '/chat/contacts/officers';
  return request<import('../types').ChatOfficerContact[]>(path);
}

export async function getChatThreads() {
  return request<import('../types').ChatThreadSummary[]>('/chat/threads');
}

export async function createEmergencyChatThread(payload: {
  officerIds?: number[];
  title?: string;
  includeSuperUsers?: boolean;
  sendToAllOfficers?: boolean;
  sendToEveryone?: boolean;
}) {
  return request<{ id: string }>('/chat/threads/emergency', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function getChatThreadMessages(threadId: string, limit = 120, markRead = true) {
  const safeLimit = Math.max(1, Math.min(200, limit));
  return request<import('../types').ChatMessage[]>(`/chat/threads/${encodeURIComponent(threadId)}/messages?limit=${safeLimit}&markRead=${markRead ? 'true' : 'false'}`);
}

export async function uploadChatFiles(files: Array<File | { uri: string; name: string; type?: string }>) {
  const formData = new FormData();

  for (const file of files) {
    if (Platform.OS === 'web' && typeof (file as File).arrayBuffer === 'function') {
      formData.append('files', file as File);
      continue;
    }

    const nativeFile = file as { uri: string; name: string; type?: string };
    formData.append('files', {
      uri: nativeFile.uri,
      name: nativeFile.name || 'file.bin',
      type: nativeFile.type || 'application/octet-stream'
    } as any);
  }

  return request<{ files: Array<{ fileName: string; fileType: string; fileSize: number; storagePath: string; storageUrl: string }> }>('/chat/attachments/upload', {
    method: 'POST',
    body: formData
  });
}

export async function sendChatMessage(
  threadId: string,
  body: string,
  isEmergency = true,
  priority: 'high' | 'medium' | 'low' = 'medium',
  replyToMessageId?: number | null,
  attachments?: Array<{ fileName: string; fileType: string; fileSize: number; storagePath: string; storageUrl: string }>
) {
  return request<import('../types').ChatMessage>(`/chat/threads/${encodeURIComponent(threadId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body, isEmergency, priority, replyToMessageId: replyToMessageId ?? null, attachments: attachments ?? [] })
  });
}

export async function markAttachmentOpened(attachmentId: number) {
  return request<{ ok: boolean }>(`/chat/attachments/${attachmentId}/opened`, {
    method: 'POST'
  });
}

export async function markChatThreadRead(threadId: string) {
  return request<{ ok: boolean }>(`/chat/threads/${encodeURIComponent(threadId)}/read`, {
    method: 'POST'
  });
}

export type RoadOffenceType = 'driving_without_valid_licence' | 'expired_driving_licence' | 'expired_vehicle_licence_disc' | 'vehicle_not_roadworthy' | 'defective_lights' | 'unsafe_tyres' | 'no_seat_belt' | 'mobile_phone_use' | 'speeding' | 'traffic_control_non_compliance' | 'reckless_or_negligent_driving' | 'unsafe_overtaking' | 'overloading' | 'registration_or_number_plate_non_compliance' | 'other';
export type RoadOffenceAction = 'warning' | 'fine_or_notice' | 'vehicle_discontinued' | 'referred' | 'arrested' | 'other';

export async function createRoadOffence(payload: {
  id: string; offenceType: RoadOffenceType; actionTaken: RoadOffenceAction; driverName: string;
  driverIdentifier: string; vehicleRegistration: string; vehicleDescription: string; notes: string;
  referenceNumber: string; location: { lat: number; lng: number };
}) {
  return request('/road-offences', { method: 'POST', body: JSON.stringify(payload) });
}

export async function uploadRoadOffencePhotos(roadOffenceId: string, photos: Array<{ uri: string; name: string; type: string }>) {
  const formData = new FormData();
  for (const photo of photos) {
    formData.append('photos', { uri: photo.uri, name: photo.name, type: photo.type } as any);
  }
  return request(`/road-offences/${encodeURIComponent(roadOffenceId)}/evidence`, { method: 'POST', body: formData });
}

export interface GeocodeSearchResult {
  lat: number;
  lng: number;
  label: string;
}

/** Backed by our own /api/geocode proxy (see backend/src/routes/geocode.ts),
 * not called directly against the provider — same client used by the web
 * app's searchLocation (apps/web/src/services/api.ts). */
export async function searchLocation(query: string) {
  return request<GeocodeSearchResult[]>(`/geocode/search?q=${encodeURIComponent(query)}`);
}

export async function getActiveAlerts() {
  return request<import('../types').OperationalAlert[]>('/alerts/active');
}

export async function acknowledgeAlert(alertId: string) {
  return request<{ alertId: string; acknowledgedAt: string }>(`/alerts/${encodeURIComponent(alertId)}/acknowledge`, {
    method: 'POST'
  });
}

export async function reportAlertMatch(alertId: string, notes: string, location?: { lat: number; lng: number }) {
  return request<{ id: number; alertId: string; notes: string; createdAt: string; disclaimer: string }>(
    `/alerts/${encodeURIComponent(alertId)}/matches`,
    {
      method: 'POST',
      body: JSON.stringify({ notes, ...(location ? { location } : {}) })
    }
  );
}

export interface AlertMatchEscalationSummary {
  id: string;
  description: string;
  alertType: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface AlertMatchEscalationOfficer {
  name?: string | null;
  surname?: string | null;
}

export interface AlertMatchEscalationResult {
  escalated: boolean;
  escalationError: string | null;
}

const ALERT_TYPE_LABELS: Record<string, string> = {
  bolo_person: 'BOLO — Person',
  bolo_vehicle: 'BOLO — Vehicle',
  hazard: 'Hazard',
  general: 'General'
};

/** Matches the canonical disclaimer shown in AlertsScreen.tsx / SupervisorAlerts.tsx
 * and returned by the backend — kept in sync deliberately, not paraphrased. */
const MATCH_ESCALATION_DISCLAIMER =
  "This is an escalation signal only — it does not confirm that the person or vehicle is wanted, stolen, arrested, or otherwise legally determined. Follow your unit's operational procedure and escalate to the appropriate authority. This system does not determine what action, if any, is lawful.";

function capitalize(value: string): string {
  return value.length ? value[0].toUpperCase() + value.slice(1) : value;
}

/**
 * Chat messages have their own, separate priority concept/DB constraint
 * ('high' | 'medium' | 'low' — unrelated to Operational Alerts) that this
 * task does not extend. An Operational Alert's Critical tier has no chat
 * equivalent, so it's clamped down to 'high' — the strongest priority chat
 * actually supports — only for the chat channel field. The human-readable
 * "Priority: Critical" text in the message body is unaffected.
 */
function toChatPriority(priority: AlertMatchEscalationSummary['priority']): 'high' | 'medium' | 'low' {
  return priority === 'critical' ? 'high' : priority;
}

/**
 * Builds the officer-facing chat message. The alert's UUID is deliberately
 * excluded here — it stays in the backend audit log (writeAuditLog records it
 * as the action target) and in the /matches API response, but is meaningless
 * and confusing to a human reading the chat thread. The description serves as
 * the human-readable identifier instead.
 */
function buildEscalationMessage(alert: AlertMatchEscalationSummary, officerLabel: string): string {
  const typeLabel = ALERT_TYPE_LABELS[alert.alertType] ?? alert.alertType;
  return [
    `Possible match reported for Operational Alert: ${alert.description}`,
    '',
    `Type: ${typeLabel}`,
    '',
    `Priority: ${capitalize(alert.priority)}`,
    '',
    `Reported by: ${officerLabel}`,
    '',
    MATCH_ESCALATION_DISCLAIMER
  ].join('\n');
}

/**
 * Saves a possible-match report, then attempts to reuse the existing emergency chat
 * flow to notify supervisors. The match report is never rolled back if escalation
 * fails — it has already been saved — so failures here are captured and returned
 * rather than thrown, letting the caller show a "saved but not sent" warning.
 */
export async function reportAlertMatchWithEscalation(
  alert: AlertMatchEscalationSummary,
  notes: string,
  officer?: AlertMatchEscalationOfficer,
  location?: { lat: number; lng: number }
): Promise<AlertMatchEscalationResult> {
  await reportAlertMatch(alert.id, notes, location);

  const officerLabel = officer?.name
    ? `${officer.name} ${officer.surname ?? ''}`.trim()
    : 'An officer';
  const body = buildEscalationMessage(alert, officerLabel);

  try {
    const thread = await createEmergencyChatThread({ includeSuperUsers: true, title: 'Alert Match Reports' });
    await sendChatMessage(thread.id, body, true, toChatPriority(alert.priority));
    return { escalated: true, escalationError: null };
  } catch (err) {
    return {
      escalated: false,
      escalationError: err instanceof Error ? err.message : 'Failed to send the emergency chat escalation'
    };
  }
}
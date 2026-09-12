const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
export const AUTH_EXPIRED_EVENT = 'integriscan:auth-expired';
const inFlightGetRequests = new Map<string, Promise<unknown>>();

/**
 * The bearer token and the caller's role id are kept in memory only — never in
 * localStorage/sessionStorage. This is a deliberate security control, not an
 * oversight: this portal grants Supervisor/Admin authority, so anything that can
 * run JS in this origin (XSS, a compromised dependency, a malicious extension)
 * must not be able to read a persisted credential straight out of browser
 * storage. A page refresh therefore always requires signing in again — see
 * AuthContext's initAuth(), which now always starts from "no token".
 */
let currentAccessToken: string | null = null;
let currentActorRoleId: number | null = null;

if (!import.meta.env.VITE_API_BASE_URL) {
  console.warn('VITE_API_BASE_URL is not defined; falling back to http://localhost:4000');
}

function emitAuthExpired(message: string, token: string | null) {
  window.dispatchEvent(
    new CustomEvent(AUTH_EXPIRED_EVENT, { detail: { message, token } })
  );
}

function isExpiredTokenResponse(status: number, message: string): boolean {
  return status === 401 && /invalid or expired access token/i.test(message);
}

function request<T>(path: string, options: RequestInit = {}) {
  const method = (options.method ?? 'GET').toUpperCase();
  const sentToken = getAccessToken();
  const dedupeKey = method === 'GET' ? `${sentToken ?? ''}:${path}` : null;

  if (dedupeKey) {
    const inFlight = inFlightGetRequests.get(dedupeKey);
    if (inFlight) return inFlight as Promise<T>;
  }

  const promise = performRequest<T>(path, options, sentToken);
  if (dedupeKey) {
    inFlightGetRequests.set(dedupeKey, promise);
    promise.then(
      () => inFlightGetRequests.delete(dedupeKey),
      () => inFlightGetRequests.delete(dedupeKey)
    );
  }

  return promise;
}

async function performRequest<T>(path: string, options: RequestInit, sentToken: string | null) {
  const { headers: optionHeaders, body, ...rest } = options;
  
  // Don't set Content-Type for FormData - let the browser set it automatically with boundary
  const defaultHeaders: Record<string, string> = {};
  if (!(body instanceof FormData)) {
    defaultHeaders['Content-Type'] = 'application/json';
  }
  
  const response = await fetch(`${API_BASE}${path}`, {
    ...rest,
    body,
    headers: {
      ...defaultHeaders,
      ...(optionHeaders ?? {})
    }
  });

  const rawText = await response.text();
  let payload: Record<string, unknown> = {};
  if (rawText) {
    try {
      payload = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      payload = { error: rawText.slice(0, 500) };
    }
  }

  if (!response.ok) {
    const message =
      (typeof payload.error === 'string' ? payload.error : null) ||
      (typeof payload.message === 'string' ? payload.message : null) ||
      (rawText ? rawText.slice(0, 300) : null) ||
      `Request failed (${response.status} ${response.statusText})`;
    if (isExpiredTokenResponse(response.status, message)) {
      emitAuthExpired(message, sentToken);
    }
    throw new Error(message);
  }

  return payload as T;
}

export function getAccessToken() {
  return currentAccessToken;
}

export function setAccessToken(token: string) {
  currentAccessToken = token;
}

export function clearAccessToken() {
  currentAccessToken = null;
}

/** Set alongside the token by AuthContext so authHeaders() can attach
 * X-Actor-Role-Id without reading a persisted profile. Not itself sensitive
 * (an integer role id, not PII), but still memory-only for consistency. */
export function setActorRoleId(roleId: number | null) {
  currentActorRoleId = roleId;
}

export interface RoadOffenceReviewRecord {
  id: number;
  action: 'verified' | 'correction_requested' | 'referred' | 'closed';
  reason: string;
  reviewer_name: string;
  created_at: string;
}

export interface RoadOffenceEvidence {
  id: number;
  storage_url: string;
  file_name: string;
  file_type: string;
  file_size: number;
  created_at: string;
}

export interface RoadOffenceRecord {
  id: string;
  officer_name: string;
  badge_number: string;
  offence_type: string;
  driver_name: string;
  driver_identifier: string;
  vehicle_registration: string;
  vehicle_description: string;
  notes: string;
  action_taken: string;
  reference_number: string | null;
  location: { lat?: number; lng?: number };
  created_at: string;
  road_offence_reviews: RoadOffenceReviewRecord[];
  road_offence_evidence: RoadOffenceEvidence[];
}

export async function getRoadOffences() {
  const token = getAccessToken();
  return request<RoadOffenceRecord[]>('/api/road-offences', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

export async function addRoadOffenceReview(id: string, action: RoadOffenceReviewRecord['action'], reason: string) {
  const token = getAccessToken();
  return request<RoadOffenceReviewRecord>(`/api/road-offences/${encodeURIComponent(id)}/reviews`, {
    method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify({ action, reason })
  });
}

export async function login(email: string, password: string) {
  return request<{ session: { access_token: string }; profile: any }>('/api/auth/login', {
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
  return request<{ session?: { access_token: string }; profile: any }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

export async function completeSupervisorInvite(params: {
  invite: string;
  password: string;
}) {
  return request<{ session?: { access_token: string }; profile: any }>('/api/auth/supervisor-invite', {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

export async function getProfile() {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');

  return request<any>('/api/profile', {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

export interface TestFilters {
  search?: string;
  result?: 'pass' | 'fail' | '';
  officer?: string;
  driverLicense?: string;
  dateFrom?: string;
  dateTo?: string;
  bacMin?: string;
  bacMax?: string;
}

export async function getTests(filters?: TestFilters) {
  const token = getAccessToken();
  const params = new URLSearchParams();

  if (filters) {
    for (const [key, value] of Object.entries(filters)) {
      if (value && value !== '') {
        params.set(key, value);
      }
    }
  }

  const queryString = params.toString();
  const path = queryString ? `/api/tests?${queryString}` : '/api/tests';

  return request<any[]>(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
}

export async function createTest(payload: Record<string, unknown>) {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');

  return request<any>('/api/tests', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
}

function authHeaders() {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');
  const roleHeader: Record<string, string> =
    currentActorRoleId === 1 || currentActorRoleId === 2 || currentActorRoleId === 3
      ? { 'X-Actor-Role-Id': String(currentActorRoleId) }
      : {};
  return { Authorization: `Bearer ${token}`, ...roleHeader };
}

export async function getPortalUsers() {
  return request<import('../types').PortalUser[]>('/api/admin/users', {
    headers: authHeaders()
  });
}

export async function createPortalUser(payload: {
  email: string;
  password?: string;
  name: string;
  surname: string;
  roleId: number;
  station: string;
  status: string;
  serviceNumber?: string;
  rank?: string;
  phone?: string;
  idNumber?: string;
}) {
  return request<import('../types').PortalUser>('/api/admin/users', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload)
  });
}

export async function updatePortalUser(
  officerId: number,
  payload: { status?: string; station?: string },
  options?: { source?: 'officer_users' | 'supervisor_users' | 'admin_users'; roleId?: number }
) {
  const params = new URLSearchParams();
  if (options?.source) params.set('source', options.source);
  if (options?.roleId != null) params.set('roleId', String(options.roleId));
  const query = params.toString();
  const path = query
    ? `/api/admin/users/${officerId}?${query}`
    : `/api/admin/users/${officerId}`;

  return request<import('../types').PortalUser>(path, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload)
  });
}

export async function removePortalUser(
  officerId: number,
  options?: { source?: 'officer_users' | 'supervisor_users' | 'admin_users'; roleId?: number }
) {
  const params = new URLSearchParams();
  if (options?.source) params.set('source', options.source);
  if (options?.roleId != null) params.set('roleId', String(options.roleId));
  const query = params.toString();
  const path = query
    ? `/api/admin/users/${officerId}?${query}`
    : `/api/admin/users/${officerId}`;

  return request<{ removed: number }>(path, {
    method: 'DELETE',
    headers: authHeaders()
  });
}

export async function getFieldOfficers() {
  return request<import('../types').FieldOfficer[]>('/api/supervisor/officers', {
    headers: authHeaders()
  });
}

export async function createFieldOfficer(payload: {
  email: string;
  name: string;
  surname: string;
  serviceNumber: string;
  rank: string;
  station: string;
  phone?: string;
  idNumber?: string;
}) {
  return request<import('../types').FieldOfficer>('/api/supervisor/officers', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload)
  });
}

export async function updateFieldOfficer(
  officerId: number,
  payload: { status?: string; rank?: string; station?: string }
) {
  return request<import('../types').FieldOfficer>(`/api/supervisor/officers/${officerId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload)
  });
}

export async function getRoadblockShifts() {
  return request<import('../types').RoadblockShift[]>('/api/supervisor/shifts', {
    headers: authHeaders()
  });
}

export async function createRoadblockShift(payload: import('../types').CreateRoadblockShiftPayload) {
  return request<import('../types').RoadblockShift>('/api/supervisor/shifts', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload)
  });
}

export async function updateRoadblockShift(
  shiftId: string,
  payload: { status?: import('../types').RoadblockShiftStatus; assignedOfficerIds?: number[] }
) {
  return request<import('../types').RoadblockShift>(`/api/supervisor/shifts/${shiftId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload)
  });
}

export async function getAuditLogs() {
  return request<import('../types').AuditLogEntry[]>('/api/admin/audit-logs', {
    headers: authHeaders()
  });
}

export async function getAdminConfig() {
  return request<import('../types').AdminConfig>('/api/admin/settings', {
    headers: authHeaders()
  });
}

export async function updateAdminConfig(
  expectedRevision: number,
  values: Record<string, unknown>
) {
  return request<import('../types').AdminConfig>('/api/admin/settings', {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ expectedRevision, values })
  });
}

export async function getRuntimeConfig() {
  return request<import('../types').RuntimeConfig>('/api/config/runtime', {
    headers: authHeaders()
  });
}

export interface Annotation {
  id: number;
  test_id: string;
  supervisor_email: string;
  comment: string | null;
  status: 'pending' | 'approved' | 'referred';
  created_at: string;
}

export type CaseStatus = import('../types').CaseStatus;

/** Annotation plus the updated lifecycle case status. */
export type AnnotationResult = Annotation & { case_status: CaseStatus };

export async function getAnnotations(testId: string) {
  return request<Annotation[]>(`/api/supervisor/tests/${testId}`, {
    headers: authHeaders()
  });
}

export async function getCases(status?: CaseStatus | '') {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  const query = params.toString();
  const path = query ? `/api/supervisor/cases?${query}` : '/api/supervisor/cases';
  return request<import('../types').CaseRecord[]>(path, {
    headers: authHeaders()
  });
}

export async function annotateTest(
  testId: string,
  payload: { comment?: string; status: CaseStatus | 'pending' | 'approved' }
) {
  return request<AnnotationResult>(`/api/supervisor/tests/${testId}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload)
  });
}

export interface EvidencePhoto {
  id: number;
  test_id: string;
  photo_url: string;
  notes: string | null;
  uploaded_by: string;
  category: string | null;
  created_at: string;
}

export async function getEvidence(testId: string) {
  return request<EvidencePhoto[]>(`/api/evidence/${testId}`, {
    headers: authHeaders()
  });
}

export async function getVerificationTokens(testIds: string[]) {
  return request<import('../types').VerificationTokenRecord[]>('/api/supervisor/verification-tokens', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ testIds })
  });
}

export async function getPublicVerification(token: string) {
  const response = await fetch(`${API_BASE}/api/public/verify`, {
    headers: {
      'X-Verification-Token': token
    }
  });

  const rawText = await response.text();
  let payload: Record<string, unknown> = {};
  if (rawText) {
    try {
      payload = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      payload = { error: rawText.slice(0, 500) };
    }
  }

  if (!response.ok) {
    const message =
      (typeof payload.error === 'string' ? payload.error : null) ||
      `Verification failed (${response.status} ${response.statusText})`;
    throw new Error(message);
  }

  return payload as unknown as import('../types').PublicVerification;
}

export async function uploadEvidence(testId: string, file: File, notes?: string) {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const formData = new FormData();
  formData.append('photo', file);
  if (notes) formData.append('notes', notes);

  const response = await fetch(`${API_BASE}/api/evidence/${testId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData
  });

  const rawText = await response.text();
  let payload: Record<string, unknown> = {};
  if (rawText) {
    try {
      payload = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      payload = { error: rawText.slice(0, 500) };
    }
  }

  if (!response.ok) {
    const message =
      (typeof payload.error === 'string' ? payload.error : null) ||
      `Upload failed (${response.status} ${response.statusText})`;
    if (isExpiredTokenResponse(response.status, message)) {
      emitAuthExpired(message, token);
    }
    throw new Error(message);
  }

  return payload as unknown as EvidencePhoto;
}

export async function getChatOfficerContacts(query?: string) {
  const params = new URLSearchParams();
  if (query?.trim()) {
    params.set('q', query.trim());
  }
  const path = params.toString()
    ? `/api/chat/contacts/officers?${params.toString()}`
    : '/api/chat/contacts/officers';
  return request<import('../types').ChatOfficerContact[]>(path, {
    headers: authHeaders()
  });
}

export async function getChatThreads() {
  return request<import('../types').ChatThreadSummary[]>('/api/chat/threads', {
    headers: authHeaders()
  });
}

export async function createEmergencyChatThread(payload: {
  officerIds?: number[];
  title?: string;
  includeSuperUsers?: boolean;
  sendToAllOfficers?: boolean;
  sendToEveryone?: boolean;
}) {
  return request<{ id: string }>('/api/chat/threads/emergency', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload)
  });
}

export async function getChatThreadMessages(threadId: string, limit = 120, markRead = true) {
  const safeLimit = Math.max(1, Math.min(200, limit));
  const freshNonce = Date.now();
  return request<import('../types').ChatMessage[]>(`/api/chat/threads/${encodeURIComponent(threadId)}/messages?limit=${safeLimit}&fresh=${freshNonce}&markRead=${markRead ? 'true' : 'false'}`, {
    headers: authHeaders()
  });
}

export async function uploadChatFiles(files: File[]) {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));
  
  return request<{ files: Array<{ fileName: string; fileType: string; fileSize: number; storagePath: string; storageUrl: string }> }>('/api/chat/attachments/upload', {
    method: 'POST',
    headers: authHeaders(),
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
  return request<import('../types').ChatMessage>(`/api/chat/threads/${encodeURIComponent(threadId)}/messages`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ body, isEmergency, priority, replyToMessageId: replyToMessageId ?? null, attachments: attachments ?? [] })
  });
}

export async function markAttachmentOpened(attachmentId: number) {
  return request<{ ok: boolean }>(`/api/chat/attachments/${attachmentId}/opened`, {
    method: 'POST',
    headers: authHeaders()
  });
}

export async function markChatThreadRead(threadId: string) {
  return request<{ ok: boolean }>(`/api/chat/threads/${encodeURIComponent(threadId)}/read`, {
    method: 'POST',
    headers: authHeaders()
  });
}

export async function getOperationalAlerts() {
  return request<import('../types').OperationalAlert[]>('/api/supervisor/alerts', {
    headers: authHeaders()
  });
}

export async function createOperationalAlert(payload: import('../types').CreateOperationalAlertPayload) {
  return request<import('../types').OperationalAlert>('/api/supervisor/alerts', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload)
  });
}

export async function updateOperationalAlert(
  alertId: string,
  payload: {
    status?: import('../types').OperationalAlertStatus;
    expiresAt?: string | null;
  }
) {
  return request<import('../types').OperationalAlert>(`/api/supervisor/alerts/${encodeURIComponent(alertId)}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload)
  });
}

export async function uploadOperationalAlertPhoto(alertId: string, file: File) {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const formData = new FormData();
  formData.append('photo', file);

  const response = await fetch(`${API_BASE}/api/supervisor/alerts/${encodeURIComponent(alertId)}/photo`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  });

  const rawText = await response.text();
  let payload: Record<string, unknown> = {};
  if (rawText) {
    try {
      payload = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      payload = { error: rawText.slice(0, 500) };
    }
  }

  if (!response.ok) {
    const message =
      (typeof payload.error === 'string' ? payload.error : null) ||
      `Upload failed (${response.status} ${response.statusText})`;
    if (isExpiredTokenResponse(response.status, message)) {
      emitAuthExpired(message, token);
    }
    throw new Error(message);
  }

  return payload as unknown as import('../types').OperationalAlert;
}

export async function getOperationalAlertAcknowledgements(alertId: string) {
  return request<import('../types').OperationalAlertAcknowledgement[]>(
    `/api/supervisor/alerts/${encodeURIComponent(alertId)}/acknowledgements`,
    { headers: authHeaders() }
  );
}

export async function getOperationalAlertMatches(alertId: string) {
  return request<import('../types').OperationalAlertMatch[]>(
    `/api/supervisor/alerts/${encodeURIComponent(alertId)}/matches`,
    { headers: authHeaders() }
  );
}

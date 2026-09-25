import { createEvidenceIdempotencyKey, hashEvidenceFile, isSha256 } from '../lib/evidenceIntegrity';

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

/** Thrown when the backend answers 429. This is a "not right now", not a
 * rejection of the request, so callers should treat it as deferrable rather
 * than terminal. */
export class RateLimitError extends Error {
  readonly retryAfterMs: number;

  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

export function isRateLimitError(err: unknown): boolean {
  return err instanceof RateLimitError;
}

/**
 * Shared back-off window for the whole tab. It has to be shared rather than
 * per-caller: if only the request that hit the 429 slowed down, chat polling,
 * the unread badge and the audit refresh would all keep their old cadence and
 * the budget would never recover.
 */
let throttleUntilMs = 0;
let consecutiveRateLimits = 0;

const DEFAULT_RETRY_AFTER_MS = 5_000;
const MAX_RETRY_AFTER_MS = 60_000;
const MAX_INLINE_WAIT_MS = 8_000;

/** Milliseconds left before the server's limit window is expected to have
 * reset. Polling loops use this to skip a tick instead of stacking up requests
 * that are only going to be rejected. */
export function getRateLimitCooldownMs(now = Date.now()): number {
  return Math.max(0, throttleUntilMs - now);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function registerRateLimit(response: Response): number {
  const header = response.headers.get('Retry-After');
  const fromHeader = header ? Number(header) * 1000 : NaN;
  consecutiveRateLimits += 1;
  // Without a server-provided Retry-After we escalate: 5s, 10s, 20s, 40s…
  const fallback = Math.min(DEFAULT_RETRY_AFTER_MS * 2 ** (consecutiveRateLimits - 1), MAX_RETRY_AFTER_MS);
  const waitMs = Math.min(
    Number.isFinite(fromHeader) && fromHeader > 0 ? fromHeader : fallback,
    MAX_RETRY_AFTER_MS
  );
  throttleUntilMs = Math.max(throttleUntilMs, Date.now() + waitMs);
  return waitMs;
}

async function waitForRateLimitWindow(): Promise<void> {
  const cooldownMs = getRateLimitCooldownMs();
  if (cooldownMs <= 0) return;
  if (cooldownMs > MAX_INLINE_WAIT_MS) {
    throw new RateLimitError('Too many requests — waiting for the limit to reset before retrying.', cooldownMs);
  }
  // Jitter so requests released together don't stampede straight back into a 429.
  await sleep(cooldownMs + Math.random() * 500);
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
  await waitForRateLimitWindow();
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

    if (response.status === 429) {
      throw new RateLimitError(message, registerRateLimit(response));
    }

    if (isExpiredTokenResponse(response.status, message)) {
      emitAuthExpired(message, sentToken);
    }
    throw new Error(message);
  }

  consecutiveRateLimits = 0;
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

export interface GeocodeSearchResult {
  lat: number;
  lng: number;
  label: string;
}

/** Backed by our own /api/geocode proxy (see backend/src/routes/geocode.ts),
 * not called directly against the provider — keeps the provider swappable
 * and never ships a provider key to the browser. */
export async function searchLocation(query: string) {
  return request<GeocodeSearchResult[]>(`/api/geocode/search?q=${encodeURIComponent(query)}`, {
    headers: authHeaders()
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
  /** Present on evidence rows created with the integrity contract. */
  idempotency_key?: string | null;
  content_hash?: string | null;
  /** The backend marks a successful replay of an idempotent upload. */
  duplicate?: boolean;
  integrity_status?: 'verified' | 'legacy' | 'unavailable';
}

export interface EvidenceUploadOptions {
  /** The server normalizes unknown categories to its safe default. */
  category?: string;
  notes?: string;
  /** Reuse this exact key for every retry of this attachment. */
  idempotencyKey?: string;
  /** Optional previously computed hash; it is checked against the File bytes. */
  contentHash?: string;
  /** Alias accepted for callers that use the wire-header spelling. */
  contentSha256?: string;
}

/**
 * A 409 means the server rejected this attempt as conflicting with an already
 * used key (or with the claimed content hash). The key is deliberately kept
 * on the error so callers can retry/repair the same attempt; generating a new
 * key here would turn a conflict into a possible duplicate evidence row.
 */
export class EvidenceUploadConflictError extends Error {
  readonly status = 409;
  readonly code = 'EVIDENCE_CONFLICT';
  readonly idempotencyKey: string;
  readonly contentHash: string;

  constructor(message: string, idempotencyKey: string, contentHash: string) {
    super(message);
    this.name = 'EvidenceUploadConflictError';
    this.idempotencyKey = idempotencyKey;
    this.contentHash = contentHash;
  }
}

export function isEvidenceUploadConflictError(error: unknown): error is EvidenceUploadConflictError {
  return error instanceof EvidenceUploadConflictError ||
    (error instanceof Error && error.name === 'EvidenceUploadConflictError' && 'status' in error && error.status === 409);
}

type EvidenceUploadAttempt = {
  idempotencyKey: string;
  contentHash: string;
};

/**
 * A File is immutable, so a WeakMap is a safe in-memory place to retain the
 * key for retries. The UI also retains the key explicitly; this map protects
 * direct API callers that retry by passing the same File object. Entries are
 * removed after success, while errors (especially 409) retain the attempt.
 */
const evidenceUploadAttempts = new WeakMap<object, Map<string, EvidenceUploadAttempt>>();

function getUploadAttempt(
  file: File,
  testId: string,
  explicitKey: string | undefined,
  contentHash: string
): EvidenceUploadAttempt {
  let attemptsForTest = evidenceUploadAttempts.get(file);
  if (!attemptsForTest) {
    attemptsForTest = new Map<string, EvidenceUploadAttempt>();
    evidenceUploadAttempts.set(file, attemptsForTest);
  }

  const existing = attemptsForTest.get(testId);
  const idempotencyKey = explicitKey || existing?.idempotencyKey || createEvidenceIdempotencyKey();
  const attempt = { idempotencyKey, contentHash };
  attemptsForTest.set(testId, attempt);
  return attempt;
}

function clearUploadAttempt(file: File, testId: string, attempt: EvidenceUploadAttempt) {
  const attemptsForTest = evidenceUploadAttempts.get(file);
  const current = attemptsForTest?.get(testId);
  if (current?.idempotencyKey !== attempt.idempotencyKey || current.contentHash !== attempt.contentHash) {
    return;
  }
  attemptsForTest?.delete(testId);
  if (attemptsForTest?.size === 0) {
    evidenceUploadAttempts.delete(file);
  }
}

function normalizeUploadOptions(
  notesOrOptions?: string | EvidenceUploadOptions,
  categoryOrOptions?: string | EvidenceUploadOptions,
  explicitKey?: string,
  explicitContentHash?: string
): EvidenceUploadOptions {
  const options: EvidenceUploadOptions = typeof notesOrOptions === 'object' && notesOrOptions !== null
    ? { ...notesOrOptions }
    : { notes: typeof notesOrOptions === 'string' ? notesOrOptions : undefined };

  if (typeof categoryOrOptions === 'string') {
    options.category = categoryOrOptions;
  } else if (categoryOrOptions && typeof categoryOrOptions === 'object') {
    Object.assign(options, categoryOrOptions);
  }

  if (explicitKey) options.idempotencyKey = explicitKey;
  if (explicitContentHash) options.contentHash = explicitContentHash;
  return options;
}

async function readUploadResponse(response: Response): Promise<{
  payload: Record<string, unknown>;
  rawText: string;
}> {
  let rawText = '';
  if (typeof response.text === 'function') {
    rawText = await response.text();
  } else if (typeof response.json === 'function') {
    try {
      const value = await response.json();
      return { payload: (value && typeof value === 'object' ? value : {}) as Record<string, unknown>, rawText: '' };
    } catch {
      return { payload: {}, rawText: '' };
    }
  }

  if (!rawText) return { payload: {}, rawText: '' };

  try {
    const value = JSON.parse(rawText) as unknown;
    return {
      payload: value && typeof value === 'object' ? (value as Record<string, unknown>) : {},
      rawText
    };
  } catch {
    return { payload: { error: rawText.slice(0, 500) }, rawText };
  }
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

/**
 * Period-based variant for weekly/date-range reports — the backend queries
 * `tests` by date range itself rather than relying on an arbitrarily large
 * testIds[] array (which the explicit-selection endpoint above caps at a
 * small manual-selection batch size). testIds here only narrows the query
 * (result/capture-context filters already applied client-side); it's never
 * the sole source of truth for which records are included.
 */
export async function getVerificationTokensForReport(params: { fromIso: string; toIso: string; testIds: string[] }) {
  return request<import('../types').VerificationTokenRecord[]>('/api/supervisor/verification-tokens/report', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ from: params.fromIso, to: params.toIso, testIds: params.testIds })
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

/**
 * Upload one evidence image with a content hash and retry-safe idempotency
 * key. The primary call form is an options object:
 *
 *   uploadEvidence(testId, file, { category, notes, idempotencyKey })
 *
 * The legacy `(testId, file, notes, category, idempotencyKey)` form remains
 * supported for existing callers.
 */
export async function uploadEvidence(
  testId: string,
  file: File,
  notesOrOptions?: string | EvidenceUploadOptions,
  categoryOrOptions?: string | EvidenceUploadOptions,
  explicitKey?: string,
  explicitContentHash?: string
): Promise<EvidencePhoto> {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const options = normalizeUploadOptions(
    notesOrOptions,
    categoryOrOptions,
    explicitKey,
    explicitContentHash
  );

  // Always derive the header from the File's bytes. A supplied hash is only
  // an assertion/check for a retained retry attempt, never a replacement.
  const contentHash = await hashEvidenceFile(file);
  const claimedContentHash = options.contentHash || options.contentSha256;
  if (claimedContentHash) {
    const normalizedClaim = claimedContentHash.trim().toLowerCase();
    if (!isSha256(normalizedClaim) || normalizedClaim !== contentHash) {
      throw new Error('Evidence content hash does not match the selected file.');
    }
  }

  const attempt = getUploadAttempt(file, testId, options.idempotencyKey, contentHash);
  const category = options.category ?? 'vehicle';
  const formData = new FormData();
  formData.append('photo', file);
  formData.append('category', category);
  if (options.notes?.trim()) formData.append('notes', options.notes);
  // Keep the form fallback for proxies that strip custom request headers.
  formData.append('idempotencyKey', attempt.idempotencyKey);
  formData.append('contentHash', contentHash);

  const response = await fetch(`${API_BASE}/api/evidence/${testId}`, {
    method: 'POST',
    headers: {
      ...authHeaders(),
      'Idempotency-Key': attempt.idempotencyKey,
      'X-Content-SHA256': contentHash
    },
    body: formData
  });

  const { payload, rawText } = await readUploadResponse(response);
  if (!response.ok) {
    const message =
      (typeof payload.error === 'string' ? payload.error : null) ||
      (typeof payload.message === 'string' ? payload.message : null) ||
      (rawText ? rawText.slice(0, 300) : null) ||
      `Upload failed (${response.status} ${response.statusText})`;

    if (response.status === 409) {
      // Keep the attempt in the WeakMap. In particular, never mint a fresh
      // key in response to a conflict.
      throw new EvidenceUploadConflictError(message, attempt.idempotencyKey, contentHash);
    }
    if (isExpiredTokenResponse(response.status, message)) {
      emitAuthExpired(message, token);
    }
    throw new Error(message);
  }

  clearUploadAttempt(file, testId, attempt);
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
  payload: import('../types').UpdateOperationalAlertPayload
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

export async function getOperationalAlertCoverage(alertId: string) {
  return request<import('../types').OperationalAlertCoverage>(
    `/api/supervisor/alerts/${encodeURIComponent(alertId)}/coverage`,
    { headers: authHeaders() }
  );
}

/**
 * Reported sightings for the supervisor Map / Heatmap views. Server-side
 * filters are supported (and used here) for network efficiency, but the
 * caller is expected to fetch once and re-filter/aggregate client-side for
 * interactive UI tweaks — see lib/alertSightings.ts.
 */
export async function getAlertSightings(filters?: import('../types').AlertSightingFilters) {
  const params = new URLSearchParams();
  if (filters?.alertType) params.set('alertType', filters.alertType);
  if (filters?.priority) params.set('priority', filters.priority);
  if (filters?.alertId) params.set('alertId', filters.alertId);
  if (filters?.from) params.set('from', filters.from);
  if (filters?.to) params.set('to', filters.to);
  const query = params.toString();
  const path = query ? `/api/supervisor/alerts/sightings?${query}` : '/api/supervisor/alerts/sightings';
  return request<import('../types').AlertSighting[]>(path, { headers: authHeaders() });
}

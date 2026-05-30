const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
const ACCESS_TOKEN_KEY = 'backend_access_token';

if (!import.meta.env.VITE_API_BASE_URL) {
  console.warn('VITE_API_BASE_URL is not defined; falling back to http://localhost:4000');
}

async function request<T>(path: string, options: RequestInit = {}) {
  const { headers: optionHeaders, ...rest } = options;
  const response = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
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
    throw new Error(message);
  }

  return payload as T;
}

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setAccessToken(token: string) {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearAccessToken() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
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
  return { Authorization: `Bearer ${token}` };
}

export async function getPortalUsers() {
  return request<import('../types').PortalUser[]>('/api/admin/users', {
    headers: authHeaders()
  });
}

export async function createPortalUser(payload: {
  email: string;
  password: string;
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

export async function removePortalUser(officerId: number) {
  return request<{ removed: number }>(`/api/admin/users/${officerId}`, {
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
  password: string;
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

export async function getAuditLogs() {
  return request<import('../types').AuditLogEntry[]>('/api/admin/audit-logs', {
    headers: authHeaders()
  });
}

export async function getSystemSettings() {
  return request<{ cards: import('../types').SystemConfigCard[] }>('/api/admin/settings', {
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

export async function getAnnotations(testId: string) {
  return request<Annotation[]>(`/api/supervisor/tests/${testId}`, {
    headers: authHeaders()
  });
}

export async function annotateTest(testId: string, payload: { comment?: string; status: 'pending' | 'approved' | 'referred' }) {
  return request<Annotation>(`/api/supervisor/tests/${testId}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload)
  });
}

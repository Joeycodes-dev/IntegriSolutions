const API_BASE = process.env.VITE_API_BASE_URL || 'http://localhost:4000';
const ACCESS_TOKEN_KEY = 'backend_access_token';

if (!process.env.VITE_API_BASE_URL) {
  console.warn('VITE_API_BASE_URL is not defined; falling back to http://localhost:4000');
}

async function request<T>(path: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {})
    },
    ...options
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error((payload as any)?.error ?? 'API request failed');
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

export async function register(email: string, password: string, name: string, badgeNumber: string, role: string) {
  return request<{ session?: { access_token: string }; profile: any }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name, badgeNumber, role })
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

export async function getTests() {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');

  return request<any[]>('/api/tests', {
    headers: {
      Authorization: `Bearer ${token}`
    }
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

import { API_BASE_URL } from './constants';

export interface DriverLicenseData {
  name: string;
  surname: string;
  initials: string;
  idNumber: string;
  licenseNumber: string;
  dob: string;
  expiryDate: string;
  licenseCodes: string;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        'Content-Type': 'application/json',
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

export async function scanDriverLicense(base64Image: string) {
  return request<DriverLicenseData>('/scan', {
    method: 'POST',
    body: JSON.stringify({ base64Image })
  });
}
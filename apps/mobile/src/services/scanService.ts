import { API_BASE_URL } from './constants';
import type { DriverLicenseData } from '../types';

export type { DriverLicenseData } from '../types';

export async function scanDriverLicense(base64Image: string, options?: { retry?: boolean }): Promise<DriverLicenseData> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Image, retry: options?.retry === true })
    });
  } catch (error) {
    throw new Error(`OCR connection failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((payload as any)?.error ?? 'Licence OCR failed.');
  }
  return payload as DriverLicenseData;
}

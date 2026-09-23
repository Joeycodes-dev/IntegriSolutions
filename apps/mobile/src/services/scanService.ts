import { prepareVision, recognizeText } from 'expo-ai-kit';
import { API_BASE_URL } from './constants';
import { getAccessToken } from './auth';
import type { DriverLicenseData } from '../types';

export type { DriverLicenseData } from '../types';

export async function scanDriverLicense(imageUri: string, options?: { retry?: boolean }): Promise<DriverLicenseData> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('You must be signed in to scan a licence.');
  }

  let text: string;
  try {
    await prepareVision({ features: ['text-recognition'], languages: ['en'] });
    const result = await recognizeText({ uri: imageUri });
    text = result.text;
  } catch (error) {
    throw new Error(`On-device OCR failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!text.trim()) {
    throw new Error('No text could be read from the licence photo. Hold steady, fill the frame with the card, and retake.');
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ text, retry: options?.retry === true })
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

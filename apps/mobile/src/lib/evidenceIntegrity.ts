import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { sha256 } from 'js-sha256';

export type EvidenceIntegrity = {
  idempotencyKey: string;
  contentHash: string;
};

function decodeBase64(value: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = value.replace(/[^A-Za-z0-9+/=]/g, '');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const character of clean) {
    if (character === '=') break;
    const digit = alphabet.indexOf(character);
    if (digit < 0) continue;
    buffer = (buffer << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }

  return new Uint8Array(bytes);
}

async function hashBytes(bytes: Uint8Array): Promise<string> {
  return sha256(bytes);
}

/** Hash the exact bytes that will be uploaded, not a URI or metadata string. */
export async function hashEvidenceFile(uri: string): Promise<string> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    if (!response.ok) throw new Error('The evidence file could not be read.');
    return hashBytes(new Uint8Array(await response.arrayBuffer()));
  }

  const rawBase64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const base64 = rawBase64.includes(',') ? rawBase64.slice(rawBase64.indexOf(',') + 1) : rawBase64;
  return hashBytes(decodeBase64(base64));
}

export function evidenceIdempotencyKey(attachmentId: string): string {
  return `evidence-${attachmentId}`;
}

export function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

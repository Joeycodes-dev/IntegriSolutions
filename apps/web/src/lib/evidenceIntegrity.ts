/**
 * Integrity helpers for evidence uploads.
 *
 * The browser must hash the bytes that are put in the multipart request. Do
 * not replace this with a hash of a file name, object URL, or a re-encoded
 * image: those values do not prove what the server receives.
 */

const SHA256_HEX = /^[a-f0-9]{64}$/i;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Hash the exact bytes exposed by the browser File/Blob. */
export async function hashEvidenceFile(file: File | Blob): Promise<string> {
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw new Error('The selected evidence file could not be read.');
  }

  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('SHA-256 hashing is not available in this browser.');
  }

  // File.arrayBuffer() returns the underlying bytes. In particular, do not
  // read the file as text or hash a serialized FormData representation.
  const bytes = await file.arrayBuffer();
  const digest = await subtle.digest('SHA-256', bytes);
  return bytesToHex(new Uint8Array(digest)).toLowerCase();
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  const cryptoObject = globalThis.crypto;

  if (cryptoObject?.getRandomValues) {
    cryptoObject.getRandomValues(bytes);
    return bytes;
  }

  // The key is an idempotency token, not a credential. This fallback keeps
  // older/non-secure webviews usable; supported browsers use getRandomValues.
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

/**
 * Generate a backend-compatible key for one evidence attachment. Callers
 * should retain the returned value and pass it on every retry.
 */
export function createEvidenceIdempotencyKey(): string {
  return `evidence-${bytesToHex(randomBytes(16))}`;
}

export function isSha256(value: unknown): value is string {
  return typeof value === 'string' && SHA256_HEX.test(value);
}

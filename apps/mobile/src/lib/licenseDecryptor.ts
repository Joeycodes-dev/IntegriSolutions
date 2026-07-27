export interface DecryptedLicenseData {
  vehicleCodes: string[];
  surname: string;
  initials: string;
  prdpCode?: string;
  idCountryOfIssue?: string;
  licenseCountryOfIssue?: string;
  vehicleRestrictions: string[];
  printableStrings: string[];
  rawHex: string;
}

const KEY_1_128 = `-----BEGIN RSA PUBLIC KEY-----
MIGXAoGBAP7S4cJ+M2MxbncxenpSxUmBOVGGvkl0dgxyUY1j4FRKSNCIszLFsMNw
x2XWXZg8H53gpCsxDMwHrncL0rYdak3M6sdXaJvcv2CEePrzEvYIfMSWw3Ys9cRl
HK7No0mfrn7bfrQOPhjrMEFw6R7VsVaqzm9DLW7KbMNYUd6MZ49nAhEAu3l//ex/
nkLJ1vebE3BZ2w==
-----END RSA PUBLIC KEY-----`;
const KEY_1_74 = `-----BEGIN RSA PUBLIC KEY-----
MGACSwD/POxrX0Djw2YUUbn8+u866wbcIynA5vTczJJ5cmcWzhW74F7tLFcRvPj1
tsj3J221xDv6owQNwBqxS5xNFvccDOXqlT8MdUxrFwIRANsFuoItmswz+rfY9Cf5
zmU=
-----END RSA PUBLIC KEY-----`;
const KEY_2_128 = `-----BEGIN RSA PUBLIC KEY-----
MIGWAoGBAMqfGO9sPz+kxaRh/qVKsZQGul7NdG1gonSS3KPXTjtcHTFfexA4MkGA
mwKeu9XeTRFgMMxX99WmyaFvNzuxSlCFI/foCkx0TZCFZjpKFHLXryxWrkG1Bl9+
+gKTvTJ4rWk1RvnxYhm3n/Rxo2NoJM/822Oo7YBZ5rmk8NuJU4HLAhAYcJLaZFTO
sYU+aRX4RmoF
-----END RSA PUBLIC KEY-----`;
const KEY_2_74 = `-----BEGIN RSA PUBLIC KEY-----
MF8CSwC0BKDfEdHKz/GhoEjU1XP5U6YsWD10klknVhpteh4rFAQlJq9wtVBUc5Dq
bsdI0w/bga20kODDahmGtASy9dobZj5ZUJEw5wIQMJz+2XGf4qXiDJu0R2U4Kw==
-----END RSA PUBLIC KEY-----`;

const base64Table = new Uint8Array(256);
const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
for (let i = 0; i < base64Chars.length; i += 1) {
  base64Table[base64Chars.charCodeAt(i)] = i;
}

function base64ToBytes(input: string): Uint8Array {
  const cleaned = input.replace(/[^A-Za-z0-9+/=]/g, '');
  const outputLength = Math.floor((cleaned.length * 3) / 4);
  const result = new Uint8Array(outputLength);
  let buffer = 0;
  let bits = 0;
  let offset = 0;

  for (const char of cleaned) {
    if (char === '=') {
      break;
    }
    const value = base64Table[char.charCodeAt(0)];
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      result[offset] = (buffer >> bits) & 0xff;
      offset += 1;
    }
  }

  return result.subarray(0, offset);
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.trim();
  const result = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < normalized.length; index += 2) {
    result[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
  }
  return result;
}

function isBase64String(value: string): boolean {
  const compact = value.replace(/\s+/g, '');
  return /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(compact);
}

function latin1ToBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) {
    bytes[i] = value.charCodeAt(i) & 0xff;
  }
  return bytes;
}

function stringToBytes(value: string): Uint8Array {
  const normalized = value.replace(/\r/g, '').trim();
  const compact = normalized.replace(/\s+/g, '');

  if (/^[0-9a-fA-F]+$/.test(compact) && compact.length % 2 === 0) {
    return hexToBytes(compact);
  }

  if (isBase64String(compact)) {
    try {
      return base64ToBytes(compact);
    } catch {
      // fallback to raw bytes
    }
  }

  // Many PDF417 scanners deliver the payload as a binary string.
  // Preserve raw 8-bit values rather than trying to interpret the content as text.
  return latin1ToBytes(normalized);
}

function findPayloadSegment(payload: Uint8Array): { offset: number; version: 1 | 2 } | null {
  const version1 = [0x01, 0xe1, 0x02, 0x45];
  const version2 = [0x01, 0x9b, 0x09, 0x45];

  for (let offset = 0; offset <= payload.length - 720; offset += 1) {
    const first4 = payload.subarray(offset, offset + 4);
    const isVersion1 = first4[0] === version1[0] && first4[1] === version1[1] && first4[2] === version1[2] && first4[3] === version1[3];
    const isVersion2 = first4[0] === version2[0] && first4[1] === version2[1] && first4[2] === version2[2] && first4[3] === version2[3];
    if (!isVersion1 && !isVersion2) {
      continue;
    }
    if (payload[offset + 4] !== 0x00 || payload[offset + 5] !== 0x00) {
      continue;
    }
    return { offset, version: isVersion1 ? 1 : 2 };
  }

  return null;
}

function bytesToHex(data: Uint8Array): string {
  return Array.from(data)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function parseAsn1Length(data: Uint8Array, offset: number): [number, number] {
  if (offset >= data.length) {
    throw new Error('Invalid ASN.1 length offset');
  }
  const first = data[offset];
  offset += 1;
  if (first < 0x80) {
    return [first, offset];
  }
  const lengthBytes = first & 0x7f;
  if (lengthBytes === 0 || lengthBytes > 4) {
    throw new Error('Unsupported ASN.1 length');
  }
  let length = 0;
  for (let i = 0; i < lengthBytes; i += 1) {
    length = (length << 8) | data[offset + i];
  }
  return [length, offset + lengthBytes];
}

function parseRsaPublicKey(pem: string): { n: bigint; e: bigint } {
  const body = pem
    .split('\n')
    .filter((line) => line && !line.includes('BEGIN') && !line.includes('END'))
    .join('');
  const der = base64ToBytes(body);
  let offset = 0;

  if (der[offset++] !== 0x30) {
    throw new Error('Invalid RSA public key format');
  }
  const [seqLen, nextOffset] = parseAsn1Length(der, offset);
  offset = nextOffset;

  if (der[offset++] !== 0x02) {
    throw new Error('Expected INTEGER for modulus');
  }
  const [modLen, modOffset] = parseAsn1Length(der, offset);
  offset = modOffset;
  const modulus = der.subarray(offset, offset + modLen);
  offset += modLen;

  if (der[offset++] !== 0x02) {
    throw new Error('Expected INTEGER for exponent');
  }
  const [expLen, expOffset] = parseAsn1Length(der, offset);
  offset = expOffset;
  const exponent = der.subarray(offset, offset + expLen);

  return {
    n: bytesToBigInt(modulus),
    e: bytesToBigInt(exponent)
  };
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }
  return value;
}

function bigIntToBytes(value: bigint, length: number): Uint8Array {
  const result = new Uint8Array(length);
  for (let index = length - 1; index >= 0; index -= 1) {
    result[index] = Number(value & 0xffn);
    value >>= 8n;
  }
  return result;
}

function decryptRsaBlock(block: Uint8Array, key: { n: bigint; e: bigint }): Uint8Array {
  const input = bytesToBigInt(block);
  const output = input ** key.e % key.n;
  return bigIntToBytes(output, block.length);
}

function decodePrintableStrings(data: Uint8Array, minLength = 3): string[] {
  const matches: string[] = [];
  let current = '';

  for (const byte of data) {
    if (byte >= 0x20 && byte <= 0x7e) {
      current += String.fromCharCode(byte);
      continue;
    }
    if (current.length >= minLength) {
      matches.push(current);
    }
    current = '';
  }
  if (current.length >= minLength) {
    matches.push(current);
  }

  return matches;
}

function readString(data: Uint8Array, index: number): [string, number, number | null] {
  const start = index;
  while (index < data.length && data[index] !== 0x00 && data[index] !== 0xe0 && data[index] !== 0xff) {
    index += 1;
  }
  const value = String.fromCharCode(...data.subarray(start, index)).trim();
  const delimiter = index < data.length ? data[index] : null;
  return [value, delimiter === null ? index : index + 1, delimiter];
}

function readStrings(data: Uint8Array, index: number, count: number): [string[], number] {
  const values: string[] = [];
  let currentIndex = index;
  for (let i = 0; i < count; i += 1) {
    const [value, nextIndex] = readString(data, currentIndex);
    values.push(value);
    currentIndex = nextIndex;
  }
  return [values, currentIndex];
}

function getPayloadBytes(rawPayload: string): Uint8Array {
  return stringToBytes(rawPayload);
}

export function decryptLicensePayload(rawPayload: string): Uint8Array {
  const input = getPayloadBytes(rawPayload);
  if (input.length < 720) {
    throw new Error(`Expected at least 720 bytes of payload, got ${input.length}`);
  }

  const located = findPayloadSegment(input);
  if (!located) {
    throw new Error(`Unable to locate a valid license payload segment with version marker and padding (payload size: ${input.length} bytes)`);
  }

  const payload = input.subarray(located.offset);
  const version = located.version;

  const blocks: Uint8Array[] = [];
  let offset = 6;
  for (let i = 0; i < 5; i += 1) {
    blocks.push(payload.subarray(offset, offset + 128));
    offset += 128;
  }
  blocks.push(payload.subarray(offset, offset + 74));

  if (blocks.some((block, index) => (index < 5 ? block.length !== 128 : block.length !== 74))) {
    throw new Error('Payload block sizes do not match expected layout for this license type');
  }

  const decrypted = new Uint8Array(128 * 5 + 74);
  const key128 = parseRsaPublicKey(version === 1 ? KEY_1_128 : KEY_2_128);
  for (let i = 0; i < 5; i += 1) {
    decrypted.set(decryptRsaBlock(blocks[i], key128), i * 128);
  }
  const key74 = parseRsaPublicKey(version === 1 ? KEY_1_74 : KEY_2_74);
  decrypted.set(decryptRsaBlock(blocks[5], key74), 128 * 5);

  return decrypted;
}

export function parseDecryptedLicensePayload(data: Uint8Array): DecryptedLicenseData {
  const rawHex = bytesToHex(data);
  const printableStrings = decodePrintableStrings(data, 4);
  const markerIndex = data.indexOf(0x82);

  const result: DecryptedLicenseData = {
    vehicleCodes: [],
    surname: '',
    initials: '',
    vehicleRestrictions: [],
    printableStrings,
    rawHex
  };

  if (markerIndex === -1) {
    return result;
  }

  let index = markerIndex + 2;
  const [vehicleCodes, afterCodes] = readStrings(data, index, 4);
  index = afterCodes;
  const [surname, afterSurname, surnameDelimiter] = readString(data, index);
  index = afterSurname;
  const [initials, afterInitials, initialsDelimiter] = readString(data, index);
  index = afterInitials;
  let prdpCode: string | undefined;
  let delimiter = initialsDelimiter;

  if (delimiter === 0xe0) {
    const [prdp, next, nextDelimiter] = readString(data, index);
    prdpCode = prdp;
    index = next;
    delimiter = nextDelimiter;
  }

  const [idCountryOfIssue, afterCountryId] = readString(data, index);
  index = afterCountryId;
  const [licenseCountryOfIssue, afterLicenseCountry] = readString(data, index);
  index = afterLicenseCountry;
  const [vehicleRestrictions, finalIndex] = readStrings(data, index, 4);
  index = finalIndex;

  return {
    ...result,
    vehicleCodes,
    surname,
    initials,
    prdpCode,
    idCountryOfIssue,
    licenseCountryOfIssue,
    vehicleRestrictions
  };
}

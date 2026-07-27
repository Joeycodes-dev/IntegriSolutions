import { decryptLicensePayload, parseDecryptedLicensePayload } from '../../src/lib/licenseDecryptor';

describe('decryptLicensePayload', () => {
  it('throws when payload is shorter than 720 bytes', () => {
    const shortPayload = 'A'.repeat(100);
    expect(() => decryptLicensePayload(shortPayload)).toThrow(
      'Expected at least 720 bytes of payload'
    );
  });

  it('throws when no valid version marker is found in the payload', () => {
    const longPayload = 'Z'.repeat(1440);
    expect(() => decryptLicensePayload(longPayload)).toThrow(
      'Unable to locate a valid license payload segment'
    );
  });
});

describe('parseDecryptedLicensePayload', () => {
  it('returns default empty fields when no 0x82 marker is present', () => {
    const emptyPayload = new Uint8Array(100);
    const result = parseDecryptedLicensePayload(emptyPayload);

    expect(result.vehicleCodes).toEqual([]);
    expect(result.surname).toBe('');
    expect(result.initials).toBe('');
    expect(result.vehicleRestrictions).toEqual([]);
    expect(result.printableStrings).toEqual([]);
    expect(result.rawHex).toMatch(/^[0-9a-f]+$/);
  });

  it('extracts printable strings from decrypted payload', () => {
    const payload = new Uint8Array(200);
    const text = new TextEncoder().encode('DRIVER');
    payload.set(text, 10);

    const result = parseDecryptedLicensePayload(payload);
    expect(result.printableStrings).toContain('DRIVER');
    expect(result.rawHex).toHaveLength(400);
  });
});

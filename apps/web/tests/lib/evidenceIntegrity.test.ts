import { describe, expect, it } from 'vitest';
import {
  createEvidenceIdempotencyKey,
  hashEvidenceFile,
  isSha256
} from '../../src/lib/evidenceIntegrity';

const expectedBytesHash = 'ff5d8507b6a72bee2debce2c0054798deaccdc5d8a1b945b6280ce8aa9cba52e';

describe('web evidence integrity helpers', () => {
  it('hashes the exact File bytes rather than metadata', async () => {
    const file = new File([new Uint8Array([0, 1, 2, 3, 255])], 'misleading-name.txt', {
      type: 'image/jpeg'
    });

    await expect(hashEvidenceFile(file)).resolves.toBe(expectedBytesHash);
  });

  it('creates distinct backend-compatible idempotency keys', () => {
    const first = createEvidenceIdempotencyKey();
    const second = createEvidenceIdempotencyKey();

    expect(first).toMatch(/^evidence-[a-f0-9]{32}$/);
    expect(second).toMatch(/^evidence-[a-f0-9]{32}$/);
    expect(first).not.toBe(second);
    expect(isSha256(expectedBytesHash)).toBe(true);
    expect(isSha256('not-a-sha256')).toBe(false);
  });
});

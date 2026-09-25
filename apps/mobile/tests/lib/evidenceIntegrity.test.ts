import { describe, expect, it } from '@jest/globals';

import {
  evidenceIdempotencyKey,
  isSha256,
} from '../../src/lib/evidenceIntegrity';

describe('evidence integrity helpers', () => {
  it('creates stable, validated idempotency keys and hash markers', () => {
    const key = evidenceIdempotencyKey('attachment-123');
    expect(key).toBe('evidence-attachment-123');
    expect(isSha256('a'.repeat(64))).toBe(true);
    expect(isSha256('not-a-hash')).toBe(false);
  });
});

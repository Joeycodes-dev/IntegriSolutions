import { hashData } from '../../src/utilities/hash';
import { checkData } from '../../src/utilities/verify';

describe('hashData', () => {
  it('produces consistent hash for the same string input', () => {
    const result1 = hashData('integrity-test');
    const result2 = hashData('integrity-test');
    expect(result1).toBe(result2);
    expect(result1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces different hashes for different strings', () => {
    const result1 = hashData('alpha');
    const result2 = hashData('beta');
    expect(result1).not.toBe(result2);
  });

  it('produces consistent hash for the same object input', () => {
    const obj = { reading: 0.08, timestamp: '2026-01-01T00:00:00Z' };
    const result1 = hashData(obj);
    const result2 = hashData(obj);
    expect(result1).toBe(result2);
    expect(result1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces consistent hash regardless of object key ordering (canonical stringify)', () => {
    const result1 = hashData({ a: 1, b: 2 });
    const result2 = hashData({ b: 2, a: 1 });
    expect(result1).toBe(result2);
  });

  it('returns a 64-character hex string (SHA-256)', () => {
    const result = hashData('test');
    expect(result).toHaveLength(64);
  });
});

describe('checkData', () => {
  it('returns true when data matches the stored hash', () => {
    const data = 'tamper-proof-record';
    const storedHash = hashData(data);
    expect(checkData(data, storedHash)).toBe(true);
  });

  it('returns false when data has been modified', () => {
    const data = 'tamper-proof-record';
    const storedHash = hashData(data);
    expect(checkData('modified-record', storedHash)).toBe(false);
  });

  it('returns false for any single-character change', () => {
    const data = { reading: 0.08 };
    const storedHash = hashData(data);
    expect(checkData({ reading: 0.09 }, storedHash)).toBe(false);
  });

  it('works with string and object inputs consistently', () => {
    const original = { field: 'value' };
    const hash = hashData(original);
    expect(checkData(original, hash)).toBe(true);
    expect(checkData(JSON.stringify(original), hash)).toBe(true);
  });
});

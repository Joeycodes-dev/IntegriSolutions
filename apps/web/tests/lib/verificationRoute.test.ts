import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  buildVerificationUrl,
  parseVerificationTokenFromHash
} from '../../src/lib/verificationRoute';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('parseVerificationTokenFromHash', () => {
  it('parses a token from the fragment route', () => {
    expect(parseVerificationTokenFromHash('#/verify/abc123')).toBe('abc123');
  });

  it('accepts alphanumeric, dash and underscore tokens', () => {
    expect(parseVerificationTokenFromHash('#/verify/tok-01_ab')).toBe('tok-01_ab');
  });

  it('returns null for non-verification hashes', () => {
    expect(parseVerificationTokenFromHash('')).toBeNull();
    expect(parseVerificationTokenFromHash('#/dashboard')).toBeNull();
    expect(parseVerificationTokenFromHash('#/verify/')).toBeNull();
    expect(parseVerificationTokenFromHash('#verify/token')).toBeNull();
    expect(parseVerificationTokenFromHash('#/verify/a/b')).toBeNull();
    expect(parseVerificationTokenFromHash('https://example.com/#/verify/tok')).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    expect(parseVerificationTokenFromHash('  #/verify/abc123  ')).toBe('abc123');
  });
});

describe('buildVerificationUrl', () => {
  it('builds a fragment URL from the public web origin', () => {
    vi.stubEnv('VITE_PUBLIC_WEB_URL', 'https://portal.example.com');
    expect(buildVerificationUrl('tok-1')).toBe('https://portal.example.com/#/verify/tok-1');
  });

  it('strips trailing slashes from the configured origin', () => {
    vi.stubEnv('VITE_PUBLIC_WEB_URL', 'https://portal.example.com/');
    expect(buildVerificationUrl('tok-1')).toBe('https://portal.example.com/#/verify/tok-1');
  });

  it('falls back to the current origin when unconfigured', () => {
    expect(buildVerificationUrl('tok-1')).toBe(`${window.location.origin}/#/verify/tok-1`);
  });
});

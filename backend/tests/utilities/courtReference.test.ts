import { formatCourtReferenceId } from '../../src/utilities/courtReference';

describe('formatCourtReferenceId', () => {
  it('formats using the UTC date and trailing numeric id digits', () => {
    expect(formatCourtReferenceId('test-1', '2026-05-30T10:00:00Z')).toBe('IS-2026-05-30-001');
    expect(formatCourtReferenceId('test-42', '2026-04-07T10:00:00Z')).toBe('IS-2026-04-07-042');
  });

  it('is timezone-independent (UTC), even near midnight', () => {
    expect(formatCourtReferenceId('test-7', '2026-05-30T22:30:00Z')).toBe('IS-2026-05-30-007');
  });

  it('pads single-digit tails', () => {
    expect(formatCourtReferenceId('abc-5', '2026-01-02T00:00:00Z')).toBe('IS-2026-01-02-005');
  });

  it('falls back to a derived id when the timestamp is invalid', () => {
    expect(formatCourtReferenceId('test-abc', 'not-a-date')).toBe('IS-TESTABC-TABC');
  });
});

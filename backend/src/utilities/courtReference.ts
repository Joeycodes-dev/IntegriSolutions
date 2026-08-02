/**
 * Canonical court reference ID, e.g. IS-2026-05-30-001.
 * Must stay in sync with apps/web/src/lib/testEvidence.ts (UTC-based).
 */
export function formatCourtReferenceId(testId: string, createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    const compact = testId.replace(/-/g, '').toUpperCase();
    const mid = compact.slice(0, 10) || 'UNKNOWN';
    const tail = compact.slice(-4) || '0000';
    return `IS-${mid}-${tail}`;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  const ymd = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  const tail = testId.replace(/\D/g, '').slice(-3).padStart(3, '0') || '001';
  return `IS-${ymd}-${tail}`;
}

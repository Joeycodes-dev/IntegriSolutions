import { sha256 } from 'js-sha256';

/**
 * Stable, non-identifying support reference for a locally captured record.
 * It is derived from the planned record ID and capture date, so retries after
 * process death keep the same reference without storing another mutable row.
 */
export function createLocalReceiptNumber(recordId: string, createdAt: string): string {
  const parsed = new Date(createdAt);
  const date = Number.isNaN(parsed.getTime())
    ? '00000000'
    : parsed.toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = sha256(recordId).slice(0, 16).toUpperCase();
  return `IS-${date}-${suffix}`;
}

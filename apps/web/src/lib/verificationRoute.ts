/**
 * Public court verification URL handling.
 * The token lives in the URL hash (#/verify/<token>) so it never appears in
 * the path (no server rewrite needed, not logged by backend request logs,
 * not sent via referrer).
 */

export function parseVerificationTokenFromHash(hash: string): string | null {
  const match = /^#\/verify\/([A-Za-z0-9_-]+)$/.exec(hash.trim());
  return match ? match[1] : null;
}

export function buildVerificationUrl(token: string): string {
  const base = (import.meta.env.VITE_PUBLIC_WEB_URL || window.location.origin).replace(/\/+$/, '');
  return `${base}/#/verify/${token}`;
}

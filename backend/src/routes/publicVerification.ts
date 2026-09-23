import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { serviceSupabase } from '../serviceSupabase';
import { hashData } from '../utilities/hash';
import { getTestHashValidity } from '../utilities/testIntegrity';
import { formatCourtReferenceId } from '../utilities/courtReference';
import { redactDriverName, redactDriverId } from '../utilities/driverRedaction';

const router = new Hono<AppEnv>();

/**
 * Anonymous court verification lookup. Accepts the opaque token in a header
 * (never in the URL path), returns a strict allowlist with no raw PII, and
 * recomputes hash status server-side from the immutable test row.
 */
router.get('/verify', async (c) => {
  c.header('Cache-Control', 'no-store');
  c.header('X-Robots-Tag', 'noindex, nofollow');

  const token = c.req.header('x-verification-token') ?? null;

  if (!token) {
    return c.json({ error: 'Missing verification token' }, 400);
  }

  const { data: tokenRows, error: tokenError } = await serviceSupabase
    .from('court_verification_tokens')
    .select('*')
    .eq('token_hash', hashData(token))
    .limit(1);

  if (tokenError) {
    return c.json({ error: tokenError.message }, 500);
  }

  const tokenRow = tokenRows?.[0] as Record<string, unknown> | undefined;
  if (!tokenRow || tokenRow.revoked_at) {
    return c.json({ error: 'Invalid verification link' }, 404);
  }

  const { data: testRows, error: testError } = await serviceSupabase
    .from('tests')
    .select('*')
    .eq('id', String(tokenRow.test_id))
    .limit(1);

  if (testError) {
    return c.json({ error: testError.message }, 500);
  }

  const row = testRows?.[0] as Record<string, unknown> | undefined;
  if (!row) {
    return c.json({ error: 'Invalid verification link' }, 404);
  }

  const hashValid = getTestHashValidity(row as never);
  const hashStatus = hashValid === true ? 'verified' : hashValid === false ? 'tampered' : 'unavailable';

  return c.json({
    referenceId: formatCourtReferenceId(String(row.id ?? ''), String(row.created_at ?? '')),
    hashStatus,
    timestamp: String(row.created_at ?? ''),
    issuedAt: String(tokenRow.issued_at ?? ''),
    officerBadge: String(row.badge_number ?? ''),
    driver: {
      name: redactDriverName(String(row.driver_name ?? '')),
      id: redactDriverId(String(row.driver_id ?? ''))
    }
  });
});

export default router;

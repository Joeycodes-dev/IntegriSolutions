import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { hashData } from '../utilities/hash';
import { getTestHashValidity } from '../utilities/testIntegrity';
import { formatCourtReferenceId } from '../utilities/courtReference';
import { redactDriverName, redactDriverId } from '../utilities/driverRedaction';

const router = Router();

const serviceSupabase = createClient(
  process.env.SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  {
    auth: {
      persistSession: false,
      detectSessionInUrl: false
    }
  }
);

/**
 * Anonymous court verification lookup. Accepts the opaque token in a header
 * (never in the URL path), returns a strict allowlist with no raw PII, and
 * recomputes hash status server-side from the immutable test row.
 */
router.get('/verify', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  const token = typeof req.headers['x-verification-token'] === 'string'
    ? req.headers['x-verification-token']
    : null;

  if (!token) {
    return res.status(400).json({ error: 'Missing verification token' });
  }

  const { data: tokenRows, error: tokenError } = await serviceSupabase
    .from('court_verification_tokens')
    .select('*')
    .eq('token_hash', hashData(token))
    .limit(1);

  if (tokenError) {
    return res.status(500).json({ error: tokenError.message });
  }

  const tokenRow = tokenRows?.[0] as Record<string, unknown> | undefined;
  if (!tokenRow || tokenRow.revoked_at) {
    return res.status(404).json({ error: 'Invalid verification link' });
  }

  const { data: testRows, error: testError } = await serviceSupabase
    .from('tests')
    .select('*')
    .eq('id', String(tokenRow.test_id))
    .limit(1);

  if (testError) {
    return res.status(500).json({ error: testError.message });
  }

  const row = testRows?.[0] as Record<string, unknown> | undefined;
  if (!row) {
    return res.status(404).json({ error: 'Invalid verification link' });
  }

  const hashValid = getTestHashValidity(row as never);
  const hashStatus = hashValid === true ? 'verified' : hashValid === false ? 'tampered' : 'unavailable';

  return res.json({
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

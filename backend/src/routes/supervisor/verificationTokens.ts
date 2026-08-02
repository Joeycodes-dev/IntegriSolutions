import { Router } from 'express';
import { randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { requireSupervisor, type SupervisorRequest } from '../../middleware/requireSupervisor';
import { asyncHandler } from '../../asyncHandler';
import { hashData } from '../../utilities/hash';
import { getTestHashValidity } from '../../utilities/testIntegrity';
import { formatCourtReferenceId } from '../../utilities/courtReference';
import { writeAuditLog } from '../../utilities/auditLog';

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

const MAX_BATCH = 50;

router.use(requireSupervisor);

/**
 * Issues one fresh, high-entropy verification token per requested test.
 * Tokens are returned once, stored only as SHA-256 hashes, and never expire
 * (court PDFs must stay verifiable) unless explicitly revoked.
 */
router.post('/', asyncHandler(async (req, res) => {
  const authReq = req as unknown as SupervisorRequest;
  const body = req.body as { testIds?: unknown };

  const testIds = Array.isArray(body.testIds)
    ? body.testIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];

  if (testIds.length === 0) {
    return res.status(400).json({ error: 'testIds must be a non-empty array of test ids' });
  }
  if (testIds.length > MAX_BATCH) {
    return res.status(400).json({ error: `testIds may contain at most ${MAX_BATCH} entries` });
  }

  const { data: rows, error } = await serviceSupabase
    .from('tests')
    .select('*')
    .in('id', testIds);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const rowsById = new Map<string, Record<string, unknown>>((rows ?? []).map((row) => [String(row.id), row as Record<string, unknown>]));
  const missing = testIds.filter((id) => !rowsById.has(id));
  if (missing.length > 0) {
    return res.status(404).json({ error: `Test record(s) not found: ${missing.slice(0, 5).join(', ')}` });
  }

  const issuedAt = new Date().toISOString();
  const issuer = authReq.userEmail ?? 'unknown';
  const records: Array<{
    testId: string;
    token: string;
    referenceId: string;
    hash: string;
    hashStatus: 'verified' | 'tampered' | 'unavailable';
    timestamp: string;
    officerBadge: string;
    issuedAt: string;
  }> = [];
  const inserts: Array<{ test_id: string; token_hash: string; issued_by: string }> = [];

  for (const id of testIds) {
    const row = rowsById.get(id)!;
    const token = randomBytes(32).toString('hex');
    const hashValid = getTestHashValidity(row as never);

    inserts.push({ test_id: id, token_hash: hashData(token), issued_by: issuer });
    records.push({
      testId: id,
      token,
      referenceId: formatCourtReferenceId(id, String(row.created_at ?? '')),
      hash: String(row.hash ?? ''),
      hashStatus: hashValid === true ? 'verified' : hashValid === false ? 'tampered' : 'unavailable',
      timestamp: String(row.created_at ?? ''),
      officerBadge: String(row.badge_number ?? ''),
      issuedAt
    });
  }

  const { error: insertError } = await serviceSupabase.from('court_verification_tokens').insert(inserts);
  if (insertError) {
    return res.status(500).json({ error: insertError.message });
  }

  for (const id of testIds) {
    await writeAuditLog(issuer, `Issued court verification token for test ${id}`, id);
  }

  return res.status(201).json(records);
}));

export default router;

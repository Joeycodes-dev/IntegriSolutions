import { Router } from 'express';
import { randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { requireSupervisor, type SupervisorRequest } from '../../middleware/requireSupervisor';
import { asyncHandler } from '../../asyncHandler';
import { hashData } from '../../utilities/hash';
import { getTestHashValidity } from '../../utilities/testIntegrity';
import { formatCourtReferenceId } from '../../utilities/courtReference';
import { writeAuditLog } from '../../utilities/auditLog';
import { resolveRoleByEmail } from '../../utilities/resolveProfile';
import { ROLE_ADMIN } from '../../constants/roles';
import { loadRawSettings, buildRuntimeConfig } from '../../config/systemSettings';

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
// A weekly/period report can legitimately span hundreds of tests — this is a
// genuine "too much to export at once" sanity ceiling, not the small-batch
// UX cap above. See POST /report.
const MAX_REPORT_SIZE = 500;
// Defense-in-depth cap on the optional narrowing testIds list for /report —
// generous relative to MAX_REPORT_SIZE since it's only ever used to narrow
// (intersect with) the date-range query, never the sole source of truth.
const MAX_REPORT_TEST_IDS = 1000;

router.use(requireSupervisor);

/**
 * Enforces the administrator-configured PDF export access policy.
 * Court verification tokens are the server-side gate for all PDF exports.
 */
async function enforcePdfAccess(req: SupervisorRequest, res: import('express').Response): Promise<boolean> {
  const raw = await loadRawSettings();
  const runtime = buildRuntimeConfig(raw);
  const policy = runtime.export.pdfAccess;

  if (policy === 'disabled') {
    res.status(403).json({ error: 'PDF export is disabled by the administrator.' });
    return false;
  }
  if (policy === 'admin_only') {
    const resolved = await resolveRoleByEmail(req.userEmail ?? '');
    if (!resolved || resolved.roleId !== ROLE_ADMIN) {
      res.status(403).json({ error: 'PDF export is restricted to administrators.' });
      return false;
    }
  }
  return true;
}

interface VerificationTokenRecord {
  testId: string;
  token: string;
  referenceId: string;
  hash: string;
  hashStatus: 'verified' | 'tampered' | 'unavailable';
  timestamp: string;
  officerBadge: string;
  issuedAt: string;
}

/**
 * Mints one fresh, high-entropy verification token per row, in the given
 * order. Tokens are returned once, stored only as SHA-256 hashes, and never
 * expire (court PDFs must stay verifiable) unless explicitly revoked. Shared
 * by both the explicit-selection route below and the period-based /report
 * route, so both mint tokens the same way and log the same audit trail.
 */
async function issueTokensForRows(
  orderedIds: string[],
  rowsById: Map<string, Record<string, unknown>>,
  issuer: string
): Promise<{ records: VerificationTokenRecord[] } | { error: string }> {
  const issuedAt = new Date().toISOString();
  const records: VerificationTokenRecord[] = [];
  const inserts: Array<{ test_id: string; token_hash: string; issued_by: string }> = [];

  for (const id of orderedIds) {
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
    return { error: insertError.message };
  }

  for (const id of orderedIds) {
    await writeAuditLog(issuer, `Issued court verification token for test ${id}`, id);
  }

  return { records };
}

/**
 * Issues one fresh, high-entropy verification token per requested test.
 * Tokens are returned once, stored only as SHA-256 hashes, and never expire
 * (court PDFs must stay verifiable) unless explicitly revoked.
 *
 * This is the explicit "I already know which tests" path — e.g. a single
 * evidence-record PDF — capped at MAX_BATCH as a manual-selection sanity
 * limit. A weekly/period report (which can easily exceed that) should use
 * POST /report instead, which queries by date range server-side rather than
 * trusting an arbitrarily large client-supplied id list.
 */
router.post('/', asyncHandler(async (req, res) => {
  const authReq = req as unknown as SupervisorRequest;

  if (!(await enforcePdfAccess(authReq, res))) {
    return;
  }

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

  const issuer = authReq.userEmail ?? 'unknown';
  const result = await issueTokensForRows(testIds, rowsById, issuer);
  if ('error' in result) {
    return res.status(500).json({ error: result.error });
  }

  return res.status(201).json(result.records);
}));

/**
 * Issues verification tokens for every test in a date range, scoped
 * server-side — the scalable path for weekly/period reports. The frontend
 * sends the report period (as precise ISO instants, already resolved from
 * its own date-filter semantics — see reportAnalytics.ts's
 * reportDateRangeToInstants) plus, optionally, the exact set of test ids it
 * already narrowed down via its result/capture-context filters; the backend
 * queries `tests` by date range itself rather than trusting an arbitrarily
 * large id list as the sole source of truth. testIds, when given, only ever
 * narrows the date-range query — it cannot widen it beyond the period.
 */
router.post('/report', asyncHandler(async (req, res) => {
  const authReq = req as unknown as SupervisorRequest;

  if (!(await enforcePdfAccess(authReq, res))) {
    return;
  }

  const body = req.body as { from?: unknown; to?: unknown; testIds?: unknown };

  const from = typeof body.from === 'string' ? body.from : '';
  const to = typeof body.to === 'string' ? body.to : '';
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);

  if (!from || !to || Number.isNaN(fromMs) || Number.isNaN(toMs)) {
    return res.status(400).json({ error: 'from and to must be valid ISO date-time strings' });
  }
  if (fromMs > toMs) {
    return res.status(400).json({ error: 'from must not be after to' });
  }

  const testIds = Array.isArray(body.testIds)
    ? body.testIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];

  if (testIds.length > MAX_REPORT_TEST_IDS) {
    return res.status(400).json({ error: `testIds may contain at most ${MAX_REPORT_TEST_IDS} entries` });
  }

  let query = serviceSupabase.from('tests').select('*').gte('created_at', from).lte('created_at', to);
  if (testIds.length > 0) {
    query = query.in('id', testIds);
  }

  const { data: rows, error } = await query;
  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const resolved = rows ?? [];
  if (resolved.length === 0) {
    return res.status(200).json([]);
  }
  if (resolved.length > MAX_REPORT_SIZE) {
    return res.status(413).json({
      error: `This report contains ${resolved.length} records, which exceeds the ${MAX_REPORT_SIZE}-record export limit. Narrow the date range or filters and try again.`
    });
  }

  // Preserve chronological order (oldest first), matching how the PDF pages
  // are laid out — sorting here rather than trusting row order from Supabase.
  const orderedRows = [...resolved].sort(
    (a, b) => new Date(String(a.created_at)).getTime() - new Date(String(b.created_at)).getTime()
  );
  const orderedIds = orderedRows.map((row) => String(row.id));
  const rowsById = new Map<string, Record<string, unknown>>(orderedRows.map((row) => [String(row.id), row as Record<string, unknown>]));

  const issuer = authReq.userEmail ?? 'unknown';
  const result = await issueTokensForRows(orderedIds, rowsById, issuer);
  if ('error' in result) {
    return res.status(500).json({ error: result.error });
  }

  return res.status(201).json(result.records);
}));

export default router;

import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { requireSupervisor } from '../../middleware/requireSupervisor';
import { asyncHandler } from '../../asyncHandler';

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

const CASE_STATUSES = ['new', 'under_review', 'verified', 'referred', 'invalidated', 'closed'] as const;

function isMissingCaseTable(error: { message?: string; code?: string } | null | undefined): boolean {
  return !!error && (error.code === '42P01' || /case_records/i.test(error.message ?? ''));
}

function toCaseRecord(testRow: Record<string, unknown>, caseRow: Record<string, unknown> | null) {
  const caseStatus =
    typeof caseRow?.case_status === 'string' ? caseRow.case_status : 'new';

  return {
    id: String(testRow.id),
    officerId: testRow.officer_id == null ? null : Number(testRow.officer_id),
    officerName: String(testRow.officer_name ?? ''),
    badgeNumber: String(testRow.badge_number ?? ''),
    driverName: String(testRow.driver_name ?? ''),
    driverId: String(testRow.driver_id ?? ''),
    driverDob: String(testRow.driver_dob ?? ''),
    bacReading: Number(testRow.bac_reading ?? 0),
    result: String(testRow.result ?? ''),
    location: String(testRow.location ?? ''),
    createdAt: String(testRow.created_at ?? ''),
    caseStatus: CASE_STATUSES.includes(caseStatus as (typeof CASE_STATUSES)[number])
      ? caseStatus
      : 'new',
    supervisorEmail: caseRow?.supervisor_email ? String(caseRow.supervisor_email) : null,
    lastComment: caseRow?.comment ? String(caseRow.comment) : null,
    caseUpdatedAt: caseRow?.updated_at ? String(caseRow.updated_at) : null
  };
}

router.use(requireSupervisor);

router.get('/', asyncHandler(async (req, res) => {
  const { status } = req.query;
  const statusFilter =
    typeof status === 'string' && (CASE_STATUSES as readonly string[]).includes(status)
      ? status
      : null;

  const { data: tests, error: testsError } = await serviceSupabase
    .from('tests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (testsError) {
    return res.status(500).json({ error: testsError.message });
  }

  const testRows = tests ?? [];
  const testIds = testRows.map((row) => String(row.id));

  let caseRows: Record<string, unknown>[] = [];
  if (testIds.length > 0) {
    const { data, error } = await serviceSupabase
      .from('case_records')
      .select('*')
      .in('test_id', testIds);

    if (error) {
      if (isMissingCaseTable(error)) {
        return res.status(503).json({
          error: 'Case records table is not set up. Run backend/migrations/20260801_case_lifecycle.sql.'
        });
      }
      return res.status(500).json({ error: error.message });
    }
    caseRows = data ?? [];
  }

  const casesByTestId = new Map<string, Record<string, unknown>>();
  for (const caseRow of caseRows) {
    casesByTestId.set(String(caseRow.test_id), caseRow);
  }

  const records = testRows
    .map((row) => toCaseRecord(row as Record<string, unknown>, casesByTestId.get(String(row.id)) ?? null))
    .filter((record) => statusFilter === null || record.caseStatus === statusFilter);

  return res.json(records);
}));

export default router;

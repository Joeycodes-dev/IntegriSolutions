import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import { serviceSupabase } from '../../serviceSupabase';
import { requireSupervisor } from '../../middleware/requireSupervisor';
import { writeAuditLog } from '../../utilities/auditLog';
import { readJson } from '../../utilities/jsonBody';
import { publishCaseUpdated } from '../../utilities/testEvents';

const router = new Hono<AppEnv>();

const CASE_STATUSES = ['new', 'under_review', 'verified', 'referred', 'invalidated', 'closed'] as const;
const ANNOTATION_STATUSES = [...CASE_STATUSES, 'pending', 'approved'] as const;
type AnnotationStatus = typeof ANNOTATION_STATUSES[number];

function isMissingCaseTable(error: { message?: string; code?: string } | null | undefined): boolean {
  return !!error && (error.code === '42P01' || /case_records/i.test(error.message ?? ''));
}

async function upsertCaseRecord(
  testId: string,
  supervisorEmail: string,
  status: string,
  comment?: string
): Promise<void> {
  const { error } = await serviceSupabase.from('case_records').upsert(
    {
      test_id: testId,
      case_status: status,
      supervisor_email: supervisorEmail,
      comment: comment?.trim() || null
    },
    { onConflict: 'test_id' }
  );

  if (error) {
    console.error('[cases] failed to update case record:', error.message);
  }
}

router.use('*', requireSupervisor);

router.get('/:testId', async (c) => {
  const testId = String(c.req.param('testId'));

  const { data, error } = await serviceSupabase
    .from('annotations')
    .select('*')
    .eq('test_id', testId)
    .order('created_at', { ascending: false });

  if (error) {
    if (error.message.includes('annotations') || error.code === '42P01') {
      return c.json(
        {
          error: 'Annotations table is not set up. Run backend/sql/annotations.sql in your Supabase SQL Editor.'
        },
        503
      );
    }
    return c.json({ error: error.message }, 500);
  }

  return c.json(data ?? []);
});

router.post('/:testId', async (c) => {
  const testId = String(c.req.param('testId'));
  const { comment, status } = await readJson<{ comment?: string; status?: string }>(c);

  if (!status || !(ANNOTATION_STATUSES as readonly string[]).includes(status)) {
    return c.json(
      {
        error: `Status must be one of: ${ANNOTATION_STATUSES.join(', ')}`
      },
      400
    );
  }

  const { data: testExists } = await serviceSupabase
    .from('tests')
    .select('id')
    .eq('id', testId)
    .limit(1);

  if (!testExists?.length) {
    return c.json({ error: 'Test record not found' }, 404);
  }

  const { data: inserted, error } = await serviceSupabase
    .from('annotations')
    .insert([{
      test_id: testId,
      supervisor_email: c.get('userEmail') ?? 'unknown',
      comment: comment?.trim() || null,
      status
    }])
    .select('*');

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  const caseStatus = CASE_STATUSES.includes(status as (typeof CASE_STATUSES)[number])
    ? status
    : status === 'approved'
      ? 'verified'
      : 'under_review';

  await upsertCaseRecord(testId, c.get('userEmail') ?? 'unknown', caseStatus, comment);

  // Notify supervisors via SSE so case queues refresh without polling
  await publishCaseUpdated(c.env, testId, caseStatus, c.get('userEmail') ?? 'unknown');

  await writeAuditLog(
    c.get('userEmail') ?? 'unknown',
    `Annotated test ${testId} as ${status}`,
    testId
  );

  return c.json(
    {
      ...(inserted?.[0] ?? null),
      case_status: caseStatus
    },
    201
  );
});

export default router;

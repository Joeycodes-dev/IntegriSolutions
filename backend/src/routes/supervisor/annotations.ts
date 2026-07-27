import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { requireSupervisor, type SupervisorRequest } from '../../middleware/requireSupervisor';
import { writeAuditLog } from '../../utilities/auditLog';
import { asyncHandler } from '../../asyncHandler';

const router = Router({ mergeParams: true });

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

const ALLOWED_STATUSES = new Set(['approved', 'referred']);

function tableMissing(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42P01' || Boolean(error.message?.includes('annotations'));
}

function toAnnotation(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    testId: String(row.test_id),
    supervisorEmail: String(row.supervisor_email),
    comment: row.comment == null ? null : String(row.comment),
    status: String(row.status) as 'approved' | 'referred',
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at ?? row.created_at)
  };
}

router.use(requireSupervisor);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const testId = String(req.params.testId ?? '');

    const { data: testRows, error: testError } = await serviceSupabase
      .from('tests')
      .select('id')
      .eq('id', testId)
      .limit(1);

    if (testError) {
      return res.status(500).json({ error: testError.message });
    }
    if (!testRows?.length) {
      return res.status(404).json({ error: 'Test record not found' });
    }

    const { data, error } = await serviceSupabase
      .from('annotations')
      .select('*')
      .eq('test_id', testId)
      .order('created_at', { ascending: false });

    if (error) {
      if (tableMissing(error)) {
        return res.status(503).json({
          error: 'Annotations table is not set up. Run backend/sql/annotations.sql in Supabase.'
        });
      }
      return res.status(500).json({ error: error.message });
    }

    return res.json((data ?? []).map((row) => toAnnotation(row as Record<string, unknown>)));
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const authReq = req as unknown as SupervisorRequest;
    const testId = String(req.params.testId ?? '');
    const body = (req.body ?? {}) as Record<string, unknown>;
    const status = String(body.status ?? '').trim().toLowerCase();
    const comment =
      typeof body.comment === 'string' && body.comment.trim() ? body.comment.trim() : null;

    if (!ALLOWED_STATUSES.has(status)) {
      return res.status(400).json({ error: 'status must be "approved" or "referred"' });
    }

    if (status === 'referred' && !comment) {
      return res.status(400).json({ error: 'A comment is required when referring a test' });
    }

    const { data: testRows, error: testError } = await serviceSupabase
      .from('tests')
      .select('id')
      .eq('id', testId)
      .limit(1);

    if (testError) {
      return res.status(500).json({ error: testError.message });
    }
    if (!testRows?.length) {
      return res.status(404).json({ error: 'Test record not found' });
    }

    const { data, error } = await serviceSupabase
      .from('annotations')
      .insert([
        {
          test_id: testId,
          supervisor_email: authReq.userEmail ?? 'unknown',
          comment,
          status
        }
      ])
      .select('*')
      .limit(1);

    if (error) {
      if (tableMissing(error)) {
        return res.status(503).json({
          error: 'Annotations table is not set up. Run backend/sql/annotations.sql in Supabase.'
        });
      }
      return res.status(500).json({ error: error.message });
    }

    const created = data?.[0] ? toAnnotation(data[0] as Record<string, unknown>) : null;

    await writeAuditLog(
      authReq.userEmail ?? 'unknown',
      status === 'approved' ? `Approved test ${testId}` : `Referred test ${testId}`,
      testId
    );

    return res.status(201).json(created);
  })
);

router.patch(
  '/:annotationId',
  asyncHandler(async (req, res) => {
    const authReq = req as unknown as SupervisorRequest;
    const testId = String(req.params.testId ?? '');
    const annotationId = Number(req.params.annotationId);
    const body = (req.body ?? {}) as Record<string, unknown>;

    if (!Number.isFinite(annotationId) || annotationId <= 0) {
      return res.status(400).json({ error: 'Valid annotationId is required' });
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };

    if (body.status != null) {
      const status = String(body.status).trim().toLowerCase();
      if (!ALLOWED_STATUSES.has(status)) {
        return res.status(400).json({ error: 'status must be "approved" or "referred"' });
      }
      updates.status = status;
    }

    if (body.comment !== undefined) {
      updates.comment =
        typeof body.comment === 'string' && body.comment.trim() ? body.comment.trim() : null;
    }

    if (updates.status === 'referred' && !updates.comment) {
      const { data: existing } = await serviceSupabase
        .from('annotations')
        .select('comment')
        .eq('id', annotationId)
        .eq('test_id', testId)
        .limit(1);

      const existingComment = existing?.[0]?.comment;
      if (!existingComment && body.comment === undefined) {
        return res.status(400).json({ error: 'A comment is required when referring a test' });
      }
    }

    const { data, error } = await serviceSupabase
      .from('annotations')
      .update(updates)
      .eq('id', annotationId)
      .eq('test_id', testId)
      .select('*')
      .limit(1);

    if (error) {
      if (tableMissing(error)) {
        return res.status(503).json({
          error: 'Annotations table is not set up. Run backend/sql/annotations.sql in Supabase.'
        });
      }
      return res.status(500).json({ error: error.message });
    }

    if (!data?.length) {
      return res.status(404).json({ error: 'Annotation not found' });
    }

    const updated = toAnnotation(data[0] as Record<string, unknown>);

    await writeAuditLog(
      authReq.userEmail ?? 'unknown',
      `Updated annotation ${annotationId} on test ${testId}`,
      testId
    );

    return res.json(updated);
  })
);

export default router;

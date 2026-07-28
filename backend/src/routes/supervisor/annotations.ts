import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { requireSupervisor, type SupervisorRequest } from '../../middleware/requireSupervisor';
import { writeAuditLog } from '../../utilities/auditLog';
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

router.use(requireSupervisor);

router.get('/:testId', async (req, res) => {
  const testId = String(req.params.testId);

  const { data, error } = await serviceSupabase
    .from('annotations')
    .select('*')
    .eq('test_id', testId)
    .order('created_at', { ascending: false });

  if (error) {
    if (error.message.includes('annotations') || error.code === '42P01') {
      return res.status(503).json({
        error: 'Annotations table is not set up. Run backend/sql/annotations.sql in your Supabase SQL Editor.'
      });
    }
    return res.status(500).json({ error: error.message });
  }

  return res.json(data ?? []);
});

router.post('/:testId', asyncHandler(async (req, res) => {
  const authReq = req as unknown as SupervisorRequest;
  const testId = String(req.params.testId);
  const { comment, status } = req.body as { comment?: string; status?: string };

  if (!status || !['pending', 'approved', 'referred'].includes(status)) {
    return res.status(400).json({ error: 'Status must be one of: pending, approved, referred' });
  }

  const { data: testExists } = await serviceSupabase
    .from('tests')
    .select('id')
    .eq('id', testId)
    .limit(1);

  if (!testExists?.length) {
    return res.status(404).json({ error: 'Test record not found' });
  }

  const { data: inserted, error } = await serviceSupabase
    .from('annotations')
    .insert([{
      test_id: testId,
      supervisor_email: authReq.userEmail ?? 'unknown',
      comment: comment?.trim() || null,
      status
    }])
    .select('*');

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  await writeAuditLog(
    authReq.userEmail ?? 'unknown',
    `Annotated test ${testId} as ${status}`,
    testId
  );

  return res.status(201).json(inserted?.[0] ?? null);
}));

export default router;

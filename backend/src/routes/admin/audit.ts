import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '../../middleware/requireAdmin';
import { toAuditEntry } from '../../utilities/auditLog';

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

router.use(requireAdmin);

router.get('/', async (_req, res) => {
  const { data, error } = await serviceSupabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    if (error.message.includes('audit_logs') || error.code === '42P01') {
      return res.status(503).json({
        error:
          'Audit log table is not set up. Run backend/sql/audit_logs.sql in your Supabase SQL Editor.'
      });
    }
    return res.status(500).json({ error: error.message });
  }

  return res.json((data ?? []).map((row) => toAuditEntry(row as Record<string, unknown>)));
});

export default router;

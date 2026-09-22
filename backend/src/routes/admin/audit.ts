import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import { requireAdmin } from '../../middleware/requireAdmin';
import { toAuditEntry } from '../../utilities/auditLog';
import { serviceSupabase } from '../../serviceSupabase';

const router = new Hono<AppEnv>();

router.use('*', requireAdmin);

router.get('/', async (c) => {
  const { data, error } = await serviceSupabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    if (error.message.includes('audit_logs') || error.code === '42P01') {
      return c.json(
        {
          error:
            'Audit log table is not set up. Run backend/sql/audit_logs.sql in your Supabase SQL Editor.'
        },
        503
      );
    }
    return c.json({ error: error.message }, 500);
  }

  return c.json((data ?? []).map((row) => toAuditEntry(row as Record<string, unknown>)));
});

export default router;

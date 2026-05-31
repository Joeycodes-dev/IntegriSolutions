import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import type { AuthRequest } from '../middleware/auth';

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

const router = Router();

router.use(async (req: Request, _res: Response, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (token) {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      return _res.status(401).json({ error: 'Invalid or expired access token' });
    }
    const authReq = req as AuthRequest;
    authReq.userId = data.user.id;
    authReq.userEmail = data.user.email ?? null;
  }

  return next();
});

router.post('/:testId', async (req, res) => {
  const authReq = req as unknown as AuthRequest;
  const { testId } = req.params;
  const { reason } = req.body;

  if (!authReq.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
    return res.status(400).json({ error: 'Reason for invalidation is required' });
  }

  // Get officer_id from officer_users table
  const { data: officer, error: officerError } = await serviceSupabase
    .from('officer_users')
    .select('officer_id')
    .eq('id', authReq.userId)
    .single();

  if (officerError || !officer) {
    return res.status(404).json({ error: 'Officer profile not found' });
  }

  // Check if test exists
  const { data: test, error: testError } = await serviceSupabase
    .from('tests')
    .select('id')
    .eq('id', testId)
    .single();

  if (testError || !test) {
    return res.status(404).json({ error: 'Test record not found' });
  }

  // Check if already invalidated
  const { data: existing } = await serviceSupabase
    .from('invalidations')
    .select('id')
    .eq('test_id', testId)
    .single();

  if (existing) {
    return res.status(409).json({ error: 'Test has already been invalidated' });
  }

  // Create invalidation record
  const { data: invalidation, error } = await serviceSupabase
    .from('invalidations')
    .insert({
      test_id: testId,
      reason: reason.trim(),
      invalidated_by: officer.officer_id
    })
    .select()
    .single();

  if (error) {
    console.error('Invalidation insert error:', error);
    return res.status(500).json({ error: error.message });
  }

  return res.status(201).json(invalidation);
});

router.get('/:testId', async (req, res) => {
  const { testId } = req.params;

  const { data: invalidations, error } = await serviceSupabase
    .from('invalidations')
    .select(`
      id,
      reason,
      created_at,
      officer_users!invalidated_by (
        officer_name,
        officer_surname,
        badge_number
      )
    `)
    .eq('test_id', testId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Invalidation fetch error:', error);
    return res.status(500).json({ error: error.message });
  }

  return res.json(invalidations || []);
});

export default router;

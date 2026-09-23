import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { supabase } from '../supabase';
import { serviceSupabase } from '../serviceSupabase';
import { resolveProfileByEmail } from '../utilities/resolveProfile';
import { readJson } from '../utilities/jsonBody';

const router = new Hono<AppEnv>();

router.use('*', async (c, next) => {
  const authHeader = c.req.header('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (token) {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      return c.json({ error: 'Invalid or expired access token' }, 401);
    }
    c.set('userId', data.user.id);
    c.set('userEmail', data.user.email ?? null);
  }

  await next();
});

router.post('/:testId', async (c) => {
  const { testId } = c.req.param();
  const { reason } = await readJson<{ reason?: unknown }>(c);

  if (!c.get('userId')) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
    return c.json({ error: 'Reason for invalidation is required' }, 400);
  }

  let resolved;
  try {
    resolved = await resolveProfileByEmail(c.get('userEmail') ?? '', c.get('userId'));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Officer profile lookup failed';
    return c.json({ error: message }, 500);
  }

  if (!resolved || resolved.source !== 'officer_users' || typeof resolved.profile.officerId !== 'number') {
    return c.json({ error: 'Officer profile not found' }, 404);
  }

  const officerId = resolved.profile.officerId;

  // Check if test exists
  const { data: test, error: testError } = await serviceSupabase
    .from('tests')
    .select('id')
    .eq('id', testId)
    .single();

  if (testError || !test) {
    return c.json({ error: 'Test record not found' }, 404);
  }

  // Check if already invalidated
  const { data: existing } = await serviceSupabase
    .from('invalidations')
    .select('id')
    .eq('test_id', testId)
    .single();

  if (existing) {
    return c.json({ error: 'Test has already been invalidated' }, 409);
  }

  // Create invalidation record
  const { data: invalidation, error } = await serviceSupabase
    .from('invalidations')
    .insert({
      test_id: testId,
      reason: reason.trim(),
      invalidated_by: officerId
    })
    .select()
    .single();

  if (error) {
    console.error('Invalidation insert error:', error);
    return c.json({ error: error.message }, 500);
  }

  return c.json(invalidation, 201);
});

router.get('/:testId', async (c) => {
  if (!c.get('userId')) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const { testId } = c.req.param();

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
    return c.json({ error: error.message }, 500);
  }

  return c.json(invalidations || []);
});

export default router;

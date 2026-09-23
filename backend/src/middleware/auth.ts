import type { MiddlewareHandler } from 'hono';
import { supabase } from '../supabase';
import type { AppEnv } from '../env';

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authHeader = c.req.header('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return c.json({ error: 'Authorization header missing or malformed' }, 401);
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return c.json({ error: 'Invalid or expired access token' }, 401);
  }

  c.set('userId', data.user.id);
  c.set('userEmail', data.user.email ?? null);

  const roleHintRaw = c.req.header('x-actor-role-id');
  const roleHint = Number(roleHintRaw);
  if (Number.isInteger(roleHint) && (roleHint === 1 || roleHint === 2 || roleHint === 3)) {
    c.set('preferredRoleId', roleHint);
  }

  await next();
};

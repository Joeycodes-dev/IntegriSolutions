import type { MiddlewareHandler } from 'hono';
import { supabase } from '../supabase';
import type { AppEnv } from '../env';
import { ROLE_ADMIN, ROLE_SUPERVISOR } from '../constants/roles';
import { resolveRoleByEmail } from '../utilities/resolveProfile';

export const requireSupervisor: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authHeader = c.req.header('authorization');
  const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const queryTokenRaw = c.req.query('access_token');
  const queryToken = queryTokenRaw && queryTokenRaw.trim() ? queryTokenRaw.trim() : null;
  const token = headerToken || queryToken;

  if (!token) {
    return c.json({ error: 'Authorization header missing or malformed' }, 401);
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return c.json({ error: 'Invalid or expired access token' }, 401);
  }

  const userEmail = data.user.email ?? null;
  c.set('userId', data.user.id);
  c.set('userEmail', userEmail);

  let resolved;
  try {
    resolved = await resolveRoleByEmail(userEmail ?? '');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Role lookup failed';
    return c.json({ error: message }, 500);
  }

  if (!resolved || (resolved.roleId !== ROLE_SUPERVISOR && resolved.roleId !== ROLE_ADMIN)) {
    return c.json({ error: 'Supervisor access required' }, 403);
  }

  c.set('supervisorOfficerId', resolved.dbId);
  c.set('roleId', resolved.roleId);
  await next();
};

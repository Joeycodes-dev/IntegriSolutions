import type { Request, Response, NextFunction } from 'express';
import { supabase } from '../supabase';
import type { AuthRequest } from './auth';
import { ROLE_ADMIN } from '../constants/roles';
import { resolveRoleByEmail } from '../utilities/resolveProfile';

export interface AdminRequest extends AuthRequest {
  adminOfficerId: number;
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authorization header missing or malformed' });
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return res.status(401).json({ error: 'Invalid or expired access token' });
  }

  const authReq = req as AdminRequest;
  authReq.userId = data.user.id;
  authReq.userEmail = data.user.email ?? null;

  let resolved;
  try {
    resolved = await resolveRoleByEmail(authReq.userEmail ?? '');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Role lookup failed';
    return res.status(500).json({ error: message });
  }

  if (!resolved || resolved.roleId !== ROLE_ADMIN) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  authReq.adminOfficerId = resolved.dbId;
  return next();
}

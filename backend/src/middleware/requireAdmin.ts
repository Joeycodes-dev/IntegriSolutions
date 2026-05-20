import type { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import type { AuthRequest } from './auth';
import { ROLE_ADMIN } from '../constants/roles';

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

  const { data: officerRows, error: officerError } = await serviceSupabase
    .from('officer_users')
    .select('officer_id, role_id')
    .eq('officer_email_address', authReq.userEmail)
    .limit(1);

  if (officerError) {
    return res.status(500).json({ error: officerError.message });
  }

  const officer = Array.isArray(officerRows) ? officerRows[0] : null;
  if (!officer || Number(officer.role_id) !== ROLE_ADMIN) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  authReq.adminOfficerId = officer.officer_id;
  return next();
}

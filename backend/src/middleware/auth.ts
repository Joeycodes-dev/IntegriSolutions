import type { Request, Response, NextFunction } from 'express';
import { supabase } from '../supabase';

export interface AuthRequest extends Request {
  userId: string;
  userEmail: string | null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authorization header missing or malformed' });
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return res.status(401).json({ error: 'Invalid or expired access token' });
  }

  const authReq = req as AuthRequest;
  authReq.userId = data.user.id;
  authReq.userEmail = data.user.email ?? null;

  return next();
}

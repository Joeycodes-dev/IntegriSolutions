import { Router, Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { hashData } from '../utilities/hash';
import type { TestRecord } from '../types';

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

// Soft auth for GET: validates token if present, but doesn't block anonymous requests
async function softAuth(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (token) {
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data.user) {
      const authReq = req as AuthRequest;
      authReq.userId = data.user.id;
      authReq.userEmail = data.user.email ?? null;
    }
  }

  return next();
}

router.use(softAuth);

function toCamelCase(row: any): TestRecord {
  return {
    id: row.id,
    officerId: row.officer_id,
    officerName: row.officer_name,
    badgeNumber: row.badge_number,
    driverName: row.driver_name,
    driverId: row.driver_id,
    driverDob: row.driver_dob,
    bacReading: row.bac_reading,
    result: row.result,
    location: row.location,
    hash: row.hash,
    createdAt: row.created_at
  };
}

router.get('/', async (req, res) => {
  let query = serviceSupabase
    .from('tests')
    .select('*')
    .order('created_at', { ascending: false });

  const { search, result, officer, dateFrom, dateTo, bacMin, bacMax } = req.query;

  if (typeof search === 'string' && search.trim()) {
    const term = `%${search.trim()}%`;
    query = query.or(`officer_name.ilike.${term},badge_number.ilike.${term},driver_name.ilike.${term},driver_id.ilike.${term},id.ilike.${term}`);
  }

  if (typeof result === 'string' && (result === 'pass' || result === 'fail')) {
    query = query.eq('result', result);
  }

  if (typeof officer === 'string' && officer.trim()) {
    query = query.ilike('officer_name', `%${officer.trim()}%`);
  }

  if (typeof dateFrom === 'string' && dateFrom.trim()) {
    query = query.gte('created_at', dateFrom.trim());
  }

  if (typeof dateTo === 'string' && dateTo.trim()) {
    query = query.lte('created_at', dateTo.trim());
  }

  if (typeof bacMin === 'string') {
    const min = parseFloat(bacMin);
    if (!Number.isNaN(min)) {
      query = query.gte('bac_reading', min);
    }
  }

  if (typeof bacMax === 'string') {
    const max = parseFloat(bacMax);
    if (!Number.isNaN(max)) {
      query = query.lte('bac_reading', max);
    }
  }

  const { data, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const records = (data ?? []).map(toCamelCase);
  return res.json(records);
});

router.post('/', requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  const { driverName, driverId, driverDob, bacReading, result, location } = req.body;

  if (!driverName || !driverId || !driverDob || typeof bacReading !== 'number' || !result || !location) {
    return res.status(400).json({ error: 'Missing or invalid test payload' });
  }

  const { data: officer, error: officerError } = await serviceSupabase
    .from('officer_users')
    .select('officer_name, badge_number')
    .eq('officer_email_address', authReq.userEmail)
    .single();

  if (officerError || !officer) {
    return res.status(404).json({ error: officerError?.message ?? 'Officer profile not found' });
  }

  const record = {
    officer_id: authReq.userId,
    officer_name: officer.officer_name,
    badge_number: officer.badge_number,
    driver_name: driverName,
    driver_id: driverId,
    driver_dob: driverDob,
    bac_reading: bacReading,
    result,
    created_at: new Date().toISOString(),
    location: JSON.stringify(location)
  };

  const insertPayload = {
    ...record,
    hash: hashData(record)
  };

  const { data, error } = await serviceSupabase.from('tests').insert([insertPayload]).select();
  const inserted = data ?? [];

  if (error || !inserted.length) {
    return res.status(500).json({ error: error?.message ?? 'Failed to save test record' });
  }

  return res.status(201).json(toCamelCase(inserted[0]));
});

export default router;

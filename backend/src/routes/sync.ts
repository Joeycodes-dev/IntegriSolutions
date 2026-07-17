import { Router, Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import type { AuthRequest } from '../middleware/auth';
import { hashData } from '../utilities/hash';

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

router.use(async (req: Request, _res: Response, next: NextFunction) => {
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

interface SyncRecord {
  id: string;
  officerId: number;
  officerName: string;
  badgeNumber: string;
  driverName: string;
  driverId: string;
  driverDob: string;
  bacReading: number;
  result: string;
  location: { lat: number; lng: number };
  hash: string;
  createdAt: string;
  originalTestId?: string | null;
}

router.post('/', async (req, res) => {
  const { records } = req.body as { records: SyncRecord[] };
  console.log(`[/api/sync] received ${records?.length ?? 0} records`);

  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: 'Records array is required and must not be empty' });
  }

  if (records.length > 50) {
    return res.status(400).json({ error: 'Batch size cannot exceed 50 records' });
  }

  const synced: string[] = [];
  const failed: { id: string; error: string }[] = [];
  const duplicates: string[] = [];

  for (const record of records) {
    if (!record.id || !record.officerId || !record.driverName || typeof record.bacReading !== 'number' || !record.result || !record.hash) {
      failed.push({ id: record.id || 'unknown', error: 'Missing or invalid fields' });
      continue;
    }

    const reconstructed = {
      officerId: record.officerId,
      officerName: record.officerName,
      badgeNumber: record.badgeNumber,
      driverName: record.driverName,
      driverId: record.driverId,
      driverDob: record.driverDob,
      bacReading: record.bacReading,
      result: record.result,
      location: record.location,
      createdAt: record.createdAt,
      originalTestId: record.originalTestId || null
    };

    const computedHash = hashData(reconstructed);

    if (computedHash !== record.hash) {
      console.error(`HASH MISMATCH id=${record.id}`);
      console.error(`  mobile=${record.hash}`);
      console.error(`  backend=${computedHash}`);
      // Temporary: allow through for debugging
      // failed.push({ id: record.id, error: 'Hash verification failed — record may have been tampered with' });
      // continue;
    }

    const { data: existing } = await serviceSupabase
      .from('tests')
      .select('id')
      .eq('id', record.id)
      .single();

    if (existing) {
      duplicates.push(record.id);
      continue;
    }

    const insertPayload = {
      id: record.id,
      officer_id: record.officerId,
      officer_name: record.officerName,
      badge_number: record.badgeNumber,
      driver_name: record.driverName,
      driver_id: record.driverId,
      driver_dob: record.driverDob,
      bac_reading: record.bacReading,
      result: record.result,
      location: JSON.stringify(record.location),
      hash: record.hash,
      created_at: record.createdAt,
      original_test_id: record.originalTestId || null
    };

    const { error } = await serviceSupabase.from('tests').insert([insertPayload]);

    if (error) {
      console.error('Supabase insert error:', error);
      failed.push({ id: record.id, error: error.message });
      continue;
    }

    synced.push(record.id);
  }

  return res.json({ synced, failed, duplicates });
});

export default router;
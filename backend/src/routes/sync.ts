import { Router } from 'express';
import { supabase } from '../supabase';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { hashData } from '../utilities/hash';

const router = Router();
router.use(requireAuth);

interface SyncRecord {
  id: string;
  officerId: string;
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
}

router.post('/', async (req, res) => {
  const authReq = req as AuthRequest;
  const { records } = req.body as { records: SyncRecord[] };

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
      createdAt: record.createdAt
    };

    const computedHash = hashData(reconstructed);

    if (computedHash !== record.hash) {
      failed.push({ id: record.id, error: 'Hash verification failed — record may have been tampered with' });
      continue;
    }

    const { data: existing } = await supabase
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
      officerId: record.officerId,
      officerName: record.officerName,
      badgeNumber: record.badgeNumber,
      driverName: record.driverName,
      driverId: record.driverId,
      driverDob: record.driverDob,
      bacReading: record.bacReading,
      result: record.result,
      status: 'completed',
      location: record.location,
      hash: record.hash,
      createdAt: record.createdAt
    };

    const { error } = await supabase.from('tests').insert([insertPayload]);

    if (error) {
      failed.push({ id: record.id, error: error.message });
      continue;
    }

    synced.push(record.id);
  }

  return res.json({ synced, failed, duplicates });
});

export default router;
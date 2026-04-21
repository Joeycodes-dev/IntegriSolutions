import { Router } from 'express';
import { supabase } from '../supabase';
import { requireAuth, AuthRequest } from '../middleware/auth';
import type { TestRecord } from '../types';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('tests')
    .select('*')
    .order('createdAt', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json(data ?? []);
});

router.post('/', async (req, res) => {
  const authReq = req as AuthRequest;
  const { driverName, driverId, driverDob, bacReading, result, location } = req.body;

  if (!driverName || !driverId || !driverDob || typeof bacReading !== 'number' || !result || !location) {
    return res.status(400).json({ error: 'Missing or invalid test payload' });
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('name, badgeNumber')
    .eq('uid', authReq.userId)
    .single();

  if (profileError || !profile) {
    return res.status(404).json({ error: profileError?.message ?? 'Officer profile not found' });
  }

  const record = {
    officerId: authReq.userId,
    officerName: profile.name,
    badgeNumber: profile.badgeNumber,
    driverName,
    driverId,
    driverDob,
    bacReading,
    result,
    status: 'completed',
    createdAt: new Date().toISOString(),
    location
  };

  const { data, error } = await supabase.from('tests').insert([record]).select();
  const inserted = data as TestRecord[] | null;

  if (error || !inserted?.length) {
    return res.status(500).json({ error: error?.message ?? 'Failed to save test record' });
  }

  return res.status(201).json(data[0]);
});

export default router;

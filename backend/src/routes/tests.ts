import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { serviceSupabase } from '../serviceSupabase';
import { requireAuth } from '../middleware/auth';
import { requireSupervisor } from '../middleware/requireSupervisor';
import { hashData } from '../utilities/hash';
import { getTestHashValidity } from '../utilities/testIntegrity';
import { mapDeviceCustodyRow } from '../utilities/deviceCustody';
import type { TestRecord } from '../types';
import { publishTestInserted } from '../utilities/testEvents';
import { readJson } from '../utilities/jsonBody';

const router = new Hono<AppEnv>();

router.get('/stream', requireSupervisor, async (c) => {
  const hub = c.env.SSE_HUB;
  if (!hub) {
    return c.json({ error: 'Event stream unavailable' }, 503);
  }
  const id = hub.idFromName('global');
  const stub = hub.get(id);
  return stub.fetch(c.req.raw);
});

function normalizeLocationField(location: unknown): string {
  if (location == null) return '';
  if (typeof location === 'string') return location;
  if (typeof location === 'object') {
    try {
      return JSON.stringify(location);
    } catch {
      return '';
    }
  }
  return String(location);
}

function toCamelCase(row: any): TestRecord {
  const reconstructed = {
    officerId: row.officer_id,
    officerName: row.officer_name,
    badgeNumber: row.badge_number,
    driverName: row.driver_name,
    driverId: row.driver_id,
    driverDob: row.driver_dob,
    bacReading: row.bac_reading,
    result: row.result,
    location: row.location,
    createdAt: row.created_at,
    originalTestId: row.original_test_id
  };
  const hashValid = getTestHashValidity(row);

  const device = mapDeviceCustodyRow(row);

  return {
    id: row.id,
    ...reconstructed,
    location: normalizeLocationField(row.location),
    hash: row.hash,
    hashValid,
    createdAt: row.created_at,
    device
  };
}

router.get('/', requireSupervisor, async (c) => {
  let query = serviceSupabase
    .from('tests')
    .select('*')
    .order('created_at', { ascending: false });

  const { search, result, officer, driverLicense, dateFrom, dateTo, bacMin, bacMax } = c.req.query();

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

  if (typeof driverLicense === 'string' && driverLicense.trim()) {
    query = query.ilike('driver_id', `%${driverLicense.trim()}%`);
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
    return c.json({ error: error.message }, 500);
  }

  const records = (data ?? []).map(toCamelCase);
  return c.json(records);
});

router.post('/', requireAuth, async (c) => {
  const { driverName, driverId, driverDob, bacReading, result, location, originalTestId } = await readJson(c);

  if (!driverName || !driverId || !driverDob || typeof bacReading !== 'number' || !result || !location) {
    return c.json({ error: 'Missing or invalid test payload' }, 400);
  }

  const { data: officer, error: officerError } = await serviceSupabase
    .from('officer_users')
    .select('officer_id, officer_name, badge_number')
    .eq('officer_email_address', c.get('userEmail'))
    .single();

  if (officerError || !officer) {
    return c.json({ error: officerError?.message ?? 'Officer profile not found' }, 404);
  }

  const officerId = Number(officer.officer_id);
  if (!Number.isFinite(officerId)) {
    return c.json({ error: 'Officer profile has an invalid officer id' }, 500);
  }

  const record = {
    officer_id: officerId,
    officer_name: officer.officer_name,
    badge_number: officer.badge_number,
    driver_name: driverName,
    driver_id: driverId,
    driver_dob: driverDob,
    bac_reading: bacReading,
    result,
    created_at: new Date().toISOString(),
    location: JSON.stringify(location),
    original_test_id: originalTestId || null
  };

  const insertPayload = {
    ...record,
    hash: hashData(record)
  };

  const { data, error } = await serviceSupabase.from('tests').insert([insertPayload]).select();
  const inserted = data ?? [];

  if (error || !inserted.length) {
    return c.json({ error: error?.message ?? 'Failed to save test record' }, 500);
  }

  await publishTestInserted(c.env, 'web-create', 1);

  return c.json(toCamelCase(inserted[0]), 201);
});

export default router;

import { Router, Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import type { AuthRequest } from '../middleware/auth';
import { hashData } from '../utilities/hash';
import { resolveProfileByEmail } from '../utilities/resolveProfile';
import { publishTestInserted } from '../utilities/testEvents';

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
const SHA256_HEX = /^[a-f0-9]{64}$/i;

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
  officerId: number | null;
  officerName: string;
  badgeNumber: string;
  driverName: string;
  driverId: string;
  driverDob: string;
  bacReading: number;
  result: string;
  location: {
    lat: number;
    lng: number;
    roadblock?: string;
    station?: string;
    officerRank?: string;
    serviceNumber?: string;
    officerNotes?: string;
    label?: string;
    driverCategory?: string;
  };
  hash: string;
  createdAt: string;
  originalTestId?: string | null;
  deviceTransport?: string | null;
  deviceSerial?: string | null;
  deviceCalibrationVersion?: string | null;
  deviceCalibrationR0?: number | null;
  deviceSessionPeakRaw?: number | null;
  deviceAvgRaw?: number | null;
  deviceRaw?: number | null;
  deviceCapturedAt?: string | null;
}

interface DeviceCustody {
  deviceTransport: string;
  deviceSerial?: string;
  deviceCalibrationVersion: string;
  deviceCalibrationR0: number;
  deviceSessionPeakRaw: number;
  deviceAvgRaw: number;
  deviceRaw: number;
  deviceCapturedAt: string;
}

const DEVICE_TRANSPORTS = new Set(['ble', 'simulated']);

function extractDeviceCustody(record: SyncRecord): DeviceCustody | null | 'invalid' {
  const hasDeviceFields =
    record.deviceTransport != null ||
    record.deviceCalibrationVersion != null ||
    record.deviceSessionPeakRaw != null ||
    record.deviceCapturedAt != null;

  if (!hasDeviceFields) return null;

  const transport = typeof record.deviceTransport === 'string' ? record.deviceTransport.trim() : '';
  const calibrationVersion =
    typeof record.deviceCalibrationVersion === 'string' ? record.deviceCalibrationVersion.trim() : '';
  const calibrationR0 = Number(record.deviceCalibrationR0);
  const sessionPeakRaw = Number(record.deviceSessionPeakRaw);
  const avgRaw = Number(record.deviceAvgRaw);
  const raw = Number(record.deviceRaw);
  const capturedAt = typeof record.deviceCapturedAt === 'string' ? record.deviceCapturedAt : '';

  const validSensorValue = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1023;

  if (
    !DEVICE_TRANSPORTS.has(transport) ||
    !calibrationVersion ||
    !Number.isFinite(calibrationR0) ||
    calibrationR0 <= 0 ||
    !validSensorValue(sessionPeakRaw) ||
    !validSensorValue(avgRaw) ||
    !validSensorValue(raw) ||
    !capturedAt ||
    Number.isNaN(Date.parse(capturedAt))
  ) {
    return 'invalid';
  }

  const serial = typeof record.deviceSerial === 'string' ? record.deviceSerial.trim() : '';

  return {
    deviceTransport: transport,
    ...(serial ? { deviceSerial: serial } : {}),
    deviceCalibrationVersion: calibrationVersion,
    deviceCalibrationR0: calibrationR0,
    deviceSessionPeakRaw: sessionPeakRaw,
    deviceAvgRaw: avgRaw,
    deviceRaw: raw,
    deviceCapturedAt: capturedAt
  };
}

function formatOfficerName(profile: { name: string; surname?: string | null }): string {
  return `${profile.name} ${profile.surname ?? ''}`.trim() || profile.name;
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
  const authReq = req as Partial<AuthRequest>;

  if (!authReq.userEmail || !authReq.userId) {
    return res.status(401).json({ error: 'Officer authentication required' });
  }

  let authenticatedOfficer: { officerId: number; officerName: string; badgeNumber: string };
  let resolved;
  try {
    resolved = await resolveProfileByEmail(authReq.userEmail, authReq.userId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Officer profile lookup failed';
    return res.status(500).json({ error: message });
  }

  if (!resolved) {
    return res.status(404).json({ error: 'Officer profile not found' });
  }

  if (resolved.source !== 'officer_users' || typeof resolved.profile.officerId !== 'number') {
    return res.status(403).json({ error: 'Only officer accounts can sync test records' });
  }

  authenticatedOfficer = {
    officerId: resolved.profile.officerId,
    officerName: formatOfficerName(resolved.profile),
    badgeNumber: resolved.profile.badgeNumber
  };

  for (const record of records) {
    const officerId = authenticatedOfficer.officerId;
    const databaseOfficerId = officerId;
    const officerName = authenticatedOfficer.officerName;
    const badgeNumber = authenticatedOfficer.badgeNumber;

    if (
      !record.id ||
      typeof databaseOfficerId !== 'number' ||
      !Number.isFinite(databaseOfficerId) ||
      !officerName?.trim() ||
      !badgeNumber?.trim() ||
      !record.driverName?.trim() ||
      !record.driverId?.trim() ||
      !record.driverDob?.trim() ||
      typeof record.bacReading !== 'number' ||
      !Number.isFinite(record.bacReading) ||
      !record.result?.trim() ||
      !record.hash?.trim()
    ) {
      failed.push({ id: record.id || 'unknown', error: 'Missing or invalid fields' });
      continue;
    }

    const device = extractDeviceCustody(record);
    if (device === 'invalid') {
      failed.push({ id: record.id || 'unknown', error: 'Invalid device custody fields' });
      continue;
    }

    const reconstructed = {
      officerId,
      officerName,
      badgeNumber,
      driverName: record.driverName,
      driverId: record.driverId,
      driverDob: record.driverDob,
      bacReading: record.bacReading,
      result: record.result,
      location: record.location,
      createdAt: record.createdAt,
      originalTestId: record.originalTestId || null,
      ...(device ?? {})
    };

    const computedHash = hashData(reconstructed);
    const storedHash = hashData({
      ...reconstructed,
      officerId: databaseOfficerId
    });

    if (!SHA256_HEX.test(record.hash)) {
      failed.push({ id: record.id, error: 'Invalid record hash format' });
      continue;
    }

    if (computedHash !== record.hash) {
      console.error(`HASH MISMATCH id=${record.id}`);
      console.error(`  mobile=${record.hash}`);
      console.error(`  backend=${computedHash}`);
      failed.push({ id: record.id, error: 'Hash verification failed — record may have been tampered with' });
      continue;
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
      officer_id: databaseOfficerId,
      officer_name: officerName,
      badge_number: badgeNumber,
      driver_name: record.driverName,
      driver_id: record.driverId,
      driver_dob: record.driverDob,
      bac_reading: record.bacReading,
      result: record.result,
      location: JSON.stringify(record.location),
      hash: storedHash,
      created_at: record.createdAt,
      original_test_id: record.originalTestId || null,
      ...(device
        ? {
            device_transport: device.deviceTransport,
            device_serial: device.deviceSerial ?? null,
            device_calibration_version: device.deviceCalibrationVersion,
            device_calibration_r0: device.deviceCalibrationR0,
            device_session_peak_raw: device.deviceSessionPeakRaw,
            device_avg_raw: device.deviceAvgRaw,
            device_raw: device.deviceRaw,
            device_captured_at: device.deviceCapturedAt
          }
        : {})
    };

    const { error } = await serviceSupabase.from('tests').insert([insertPayload]);

    if (error) {
      console.error('Supabase insert error:', error);
      failed.push({ id: record.id, error: error.message });
      continue;
    }

    synced.push(record.id);
  }

  if (synced.length > 0) {
    publishTestInserted('mobile-sync', synced.length);
  }

  return res.json({ synced, failed, duplicates });
});

export default router;
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { supabase } from '../supabase';
import { serviceSupabase } from '../serviceSupabase';
import { hashData } from '../utilities/hash';
import { resolveProfileByEmail } from '../utilities/resolveProfile';
import { publishTestInserted } from '../utilities/testEvents';
import { readJson } from '../utilities/jsonBody';

const router = new Hono<AppEnv>();
const SHA256_HEX = /^[a-f0-9]{64}$/i;
const RECEIPT_NUMBER = /^[A-Z0-9][A-Z0-9-]{7,63}$/;

type SyncFailure = {
  id: string;
  error: string;
  code?: string;
  retryable?: boolean;
};

function isValidReceiptNumber(value: unknown): value is string | null | undefined {
  return value == null || (typeof value === 'string' && RECEIPT_NUMBER.test(value));
}

function normalizeHash(value: unknown): string | null {
  if (typeof value !== 'string' || !SHA256_HEX.test(value)) return null;
  return value.toLowerCase();
}

function normalizeReceiptNumber(value: unknown): string | null | undefined {
  if (value == null) return value;
  return typeof value === 'string' ? value.trim().toUpperCase() : undefined;
}

router.use('*', async (c, next) => {
  const authHeader = c.req.header('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (token) {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      return c.json({ error: 'Invalid or expired access token' }, 401);
    }
    c.set('userId', data.user.id);
    c.set('userEmail', data.user.email ?? null);
  }

  await next();
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
  receiptNumber?: string | null;
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

const DEVICE_TRANSPORTS = new Set(['ble', 'bluetooth_classic', 'simulated']);

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

router.post('/', async (c) => {
  const { records } = await readJson<{ records: SyncRecord[] }>(c);
  console.log(`[/api/sync] received ${records?.length ?? 0} records`);

  if (!Array.isArray(records) || records.length === 0) {
    return c.json({ error: 'Records array is required and must not be empty' }, 400);
  }

  if (records.length > 50) {
    return c.json({ error: 'Batch size cannot exceed 50 records' }, 400);
  }

  const synced: string[] = [];
  const failed: SyncFailure[] = [];
  const duplicates: string[] = [];
  const duplicateReceipts: Record<string, string | null> = {};
  const receipts: Record<string, string | null> = {};
  const seenRecordHashes = new Map<string, string>();
  const seenRecordReceipts = new Map<string, string | null>();
  const userEmail = c.get('userEmail');
  const userId = c.get('userId');

  if (!userEmail || !userId) {
    return c.json({ error: 'Officer authentication required' }, 401);
  }

  let authenticatedOfficer: { officerId: number; officerName: string; badgeNumber: string };
  let resolved;
  try {
    resolved = await resolveProfileByEmail(userEmail, userId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Officer profile lookup failed';
    return c.json({ error: message }, 500);
  }

  if (!resolved) {
    return c.json({ error: 'Officer profile not found' }, 404);
  }

  if (resolved.source !== 'officer_users' || typeof resolved.profile.officerId !== 'number') {
    return c.json({ error: 'Only officer accounts can sync test records' }, 403);
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
      !record.hash?.trim() ||
      !isValidReceiptNumber(record.receiptNumber)
    ) {
      failed.push({ id: record.id || 'unknown', error: 'Missing or invalid fields', code: 'INVALID_RECORD_FORMAT', retryable: false });
      continue;
    }

    const normalizedHash = normalizeHash(record.hash);
    const normalizedReceiptNumber = normalizeReceiptNumber(record.receiptNumber);
    if (!normalizedHash || !isValidReceiptNumber(normalizedReceiptNumber)) {
      failed.push({ id: record.id, error: 'Invalid record hash or receipt format', code: 'INVALID_RECORD_FORMAT', retryable: false });
      continue;
    }
    record.hash = normalizedHash;
    record.receiptNumber = normalizedReceiptNumber;

    const priorHash = seenRecordHashes.get(record.id);
    if (priorHash) {
      const priorReceipt = seenRecordReceipts.get(record.id) ?? null;
      if (
        priorHash === normalizedHash &&
        (!priorReceipt || !record.receiptNumber || priorReceipt === record.receiptNumber)
      ) {
        duplicates.push(record.id);
        duplicateReceipts[record.id] = priorReceipt ?? record.receiptNumber ?? null;
        receipts[record.id] = duplicateReceipts[record.id];
      } else if (priorHash === normalizedHash) {
        failed.push({
          id: record.id,
          error: 'Record ID collision: duplicate records in the batch have different receipts.',
          code: 'RECEIPT_MISMATCH',
          retryable: false,
        });
      } else {
        failed.push({
          id: record.id,
          error: 'Record ID collision: duplicate records in the batch have different hashes.',
          code: 'RECORD_ID_COLLISION',
          retryable: false,
        });
      }
      continue;
    }

    const device = extractDeviceCustody(record);
    if (device === 'invalid') {
      failed.push({ id: record.id || 'unknown', error: 'Invalid device custody fields', code: 'INVALID_DEVICE_CUSTODY', retryable: false });
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
      failed.push({
        id: record.id,
        error: 'Hash verification failed — record may have been tampered with',
        code: 'HASH_MISMATCH',
        retryable: false,
      });
      continue;
    }
    const { data: existing, error: existingError } = await serviceSupabase
      .from('tests')
      .select('id, hash, receipt_number')
      .eq('id', record.id)
      .single();

    if (existingError && existingError.code !== 'PGRST116') {
      failed.push({ id: record.id, error: existingError.message, code: 'DATABASE_LOOKUP_FAILED', retryable: true });
      continue;
    }

    if (existing) {
      const existingHash = normalizeHash(existing.hash);
      if (!existingHash || existingHash !== record.hash) {
        failed.push({
          id: record.id,
          error: 'Record ID collision: the stored hash does not match this record.',
          code: 'RECORD_ID_COLLISION',
          retryable: false,
        });
        continue;
      }
      const existingReceipt = normalizeReceiptNumber(existing.receipt_number);
      if (existingReceipt && record.receiptNumber && existingReceipt !== record.receiptNumber) {
        failed.push({
          id: record.id,
          error: 'Record ID collision: the stored receipt does not match this record.',
          code: 'RECEIPT_MISMATCH',
          retryable: false,
        });
        continue;
      }
      duplicates.push(record.id);
      duplicateReceipts[record.id] = existingReceipt ?? record.receiptNumber ?? null;
      receipts[record.id] = duplicateReceipts[record.id];
      seenRecordHashes.set(record.id, normalizedHash);
      seenRecordReceipts.set(record.id, existingReceipt ?? record.receiptNumber ?? null);
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
      receipt_number: record.receiptNumber ?? null,
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
      if (error.code === '23505') {
        const { data: racedExisting } = await serviceSupabase
          .from('tests')
          .select('id, hash, receipt_number')
          .eq('id', record.id)
          .single();
        const racedHash = normalizeHash(racedExisting?.hash);
        const racedReceipt = normalizeReceiptNumber(racedExisting?.receipt_number);
        if (racedHash === record.hash && (!racedReceipt || !record.receiptNumber || racedReceipt === record.receiptNumber)) {
          duplicates.push(record.id);
          duplicateReceipts[record.id] = racedReceipt ?? record.receiptNumber ?? null;
          receipts[record.id] = duplicateReceipts[record.id];
          seenRecordHashes.set(record.id, normalizedHash);
          seenRecordReceipts.set(record.id, racedReceipt ?? record.receiptNumber ?? null);
          continue;
        }
      }
      console.error('Supabase insert error:', error);
      failed.push({ id: record.id, error: error.message, code: 'SYNC_INSERT_FAILED', retryable: true });
      continue;
    }

    synced.push(record.id);
    receipts[record.id] = record.receiptNumber ?? null;
    seenRecordHashes.set(record.id, normalizedHash);
    seenRecordReceipts.set(record.id, record.receiptNumber ?? null);
  }

  if (synced.length > 0) {
    await publishTestInserted(c.env, 'mobile-sync', synced.length);
  }

  return c.json({ synced, failed, duplicates, duplicateReceipts, receipts });
});

export default router;

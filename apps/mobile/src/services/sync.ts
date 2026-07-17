import { sha256 } from 'js-sha256';
import { insertTest, updateSyncStatus, getPendingSync, type LocalTestRecord } from '../db/repository';
import { syncRecords, uploadEvidencePhoto } from './api';
import { logAuditEvent } from './audit';

export { generateId } from '../lib/id';

function canonicalStringify(obj: Record<string, unknown>): string {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = obj[key];
  }
  return JSON.stringify(sorted);
}

export function computeHash(payload: Record<string, unknown>): string {
  const canonical = canonicalStringify(payload);
  return sha256(canonical);
}

export async function saveLocally(params: {
  id: string;
  officerId: number | null;
  officerName: string;
  badgeNumber: string;
  driverName: string;
  driverId: string;
  driverDob: string;
  bacReading: number;
  result: string;
  location: { lat: number; lng: number };
  photoUri?: string | null;
  originalTestId?: string | null;
}): Promise<LocalTestRecord> {
  const recordPayload: Record<string, unknown> = {
    officerId: params.officerId,
    officerName: params.officerName,
    badgeNumber: params.badgeNumber,
    driverName: params.driverName,
    driverId: params.driverId,
    driverDob: params.driverDob,
    bacReading: params.bacReading,
    result: params.result,
    location: params.location,
    createdAt: new Date().toISOString(),
    originalTestId: params.originalTestId ?? null
  };

  const hash = computeHash(recordPayload);

  if (__DEV__) {
    console.log(`[saveLocally] hash=${hash} canonical=${canonicalStringify(recordPayload)}`);
  }

  const record: LocalTestRecord = {
    id: params.id,
    officerId: params.officerId,
    officerName: params.officerName,
    badgeNumber: params.badgeNumber,
    driverName: params.driverName,
    driverId: params.driverId,
    driverDob: params.driverDob,
    bacReading: params.bacReading,
    result: params.result,
    location: JSON.stringify(params.location),
    hash,
    syncStatus: 'pending_sync',
    createdAt: recordPayload.createdAt as string,
    syncedAt: null,
    retryCount: 0,
    photoUri: params.photoUri ?? null,
    originalTestId: params.originalTestId ?? null
  };

  await insertTest(record);
  await logAuditEvent({
    action: 'test.saved',
    outcome: 'success',
    message: `Test saved for ${record.driverName} (${record.driverId})`,
    entityType: 'test',
    entityId: record.id,
    officerId: record.officerId,
    officerName: record.officerName,
    badgeNumber: record.badgeNumber,
    metadata: {
      bacReading: record.bacReading,
      result: record.result,
      retest: !!record.originalTestId,
      originalTestId: record.originalTestId
    }
  });
  return record;
}

export async function syncPendingRecords(officerId?: number | null): Promise<{
  synced: string[];
  failed: { id: string; error: string }[];
}> {
  const pending = await getPendingSync(officerId);

  if (pending.length === 0) {
    return { synced: [], failed: [] };
  }

  const records = pending.map((record) => ({
    id: record.id,
    officerId: record.officerId,
    officerName: record.officerName,
    badgeNumber: record.badgeNumber,
    driverName: record.driverName,
    driverId: record.driverId,
    driverDob: record.driverDob,
    bacReading: record.bacReading,
    result: record.result,
    location: JSON.parse(record.location),
    hash: record.hash,
    createdAt: record.createdAt,
    originalTestId: record.originalTestId
  }));

  try {
    const response = await syncRecords(records);
    const syncedIds: string[] = [];
    const failedIds: { id: string; error: string }[] = [];

    for (const id of response.synced) {
      await updateSyncStatus(id, 'synced', new Date().toISOString());
      syncedIds.push(id);

      const record = pending.find((r) => r.id === id);
      if (record?.photoUri) {
        try {
          await uploadEvidencePhoto(id, record.photoUri);
          if (__DEV__) {
            console.log(`[sync] uploaded photo for test ${id}`);
          }
        } catch (photoError) {
          if (__DEV__) {
            console.error(`[sync] photo upload failed for test ${id}:`, photoError);
          }
        }
      }
    }

    for (const id of response.duplicates) {
      await updateSyncStatus(id, 'synced', new Date().toISOString());
      syncedIds.push(id);
    }

    for (const failure of response.failed) {
      const record = pending.find((r) => r.id === failure.id);
      if (record && record.retryCount >= 4) {
        await updateSyncStatus(failure.id, 'failed');
        failedIds.push(failure);
      } else {
        await updateSyncStatus(failure.id, 'pending_sync');
        failedIds.push(failure);
      }
    }

    await logAuditEvent({
      action: 'sync.batch.completed',
      outcome: failedIds.length > 0 ? 'failure' : 'success',
      severity: failedIds.length > 0 ? 'warning' : 'info',
      message: `Sync batch: ${syncedIds.length} synced, ${failedIds.length} failed (${pending.length} attempted)`,
      entityType: 'sync',
      metadata: {
        attempted: pending.length,
        synced: syncedIds.length,
        duplicates: response.duplicates.length,
        failed: failedIds.length,
        failedIds: failedIds.map((f) => ({ id: f.id, error: f.error }))
      }
    });

    return { synced: syncedIds, failed: failedIds };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failedIds: { id: string; error: string }[] = [];
    for (const record of pending) {
      const entry = { id: record.id, error: message };
      if (record.retryCount >= 4) {
        await updateSyncStatus(record.id, 'failed');
        failedIds.push(entry);
      } else {
        await updateSyncStatus(record.id, 'pending_sync');
        failedIds.push(entry);
      }
    }
    await logAuditEvent({
      action: 'sync.batch.failed',
      outcome: 'failure',
      severity: 'critical',
      message: `Sync batch failed: ${message}`,
      entityType: 'sync',
      metadata: {
        attempted: pending.length,
        failed: failedIds.length,
        error: message
      }
    });
    return { synced: [], failed: failedIds };
  }
}
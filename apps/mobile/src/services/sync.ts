import { sha256 } from 'js-sha256';
import { insertTest, updateSyncStatus, getPendingSync, type LocalTestRecord } from '../db/repository';
import { syncRecords } from './api';

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

export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
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
    createdAt: new Date().toISOString()
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
    retryCount: 0
  };

  await insertTest(record);
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
    createdAt: record.createdAt
  }));

  try {
    const response = await syncRecords(records);
    const syncedIds: string[] = [];
    const failedIds: { id: string; error: string }[] = [];

    for (const id of response.synced) {
      await updateSyncStatus(id, 'synced', new Date().toISOString());
      syncedIds.push(id);
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
    return { synced: [], failed: failedIds };
  }
}
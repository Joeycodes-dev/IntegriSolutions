import { getDB } from './client';

export type SyncStatus = 'pending_sync' | 'synced' | 'failed';

export interface LocalTestRecord {
  id: string;
  officerId: string;
  officerName: string;
  badgeNumber: string;
  driverName: string;
  driverId: string;
  driverDob: string;
  bacReading: number;
  result: string;
  location: string;
  hash: string;
  syncStatus: SyncStatus;
  createdAt: string;
  syncedAt: string | null;
  retryCount: number;
}

export interface LocalDraft {
  id: string;
  officerId: string;
  driverData: string;
  step: 'scan' | 'reading';
  createdAt: string;
}

export async function insertTest(record: LocalTestRecord): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO tests (id, officerId, officerName, badgeNumber, driverName, driverId, driverDob, bacReading, result, location, hash, syncStatus, createdAt, syncedAt, retryCount)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.officerId,
      record.officerName,
      record.badgeNumber,
      record.driverName,
      record.driverId,
      record.driverDob,
      record.bacReading,
      record.result,
      record.location,
      record.hash,
      record.syncStatus,
      record.createdAt,
      record.syncedAt,
      record.retryCount
    ]
  );
}

export async function updateSyncStatus(
  id: string,
  syncStatus: SyncStatus,
  syncedAt?: string
): Promise<void> {
  const db = await getDB();
  if (syncStatus === 'synced' && syncedAt) {
    await db.runAsync(
      `UPDATE tests SET syncStatus = ?, syncedAt = ?, retryCount = 0 WHERE id = ?`,
      [syncStatus, syncedAt, id]
    );
  } else if (syncStatus === 'failed') {
    await db.runAsync(
      `UPDATE tests SET syncStatus = ?, retryCount = retryCount + 1 WHERE id = ?`,
      [syncStatus, id]
    );
  } else {
    await db.runAsync(
      `UPDATE tests SET syncStatus = ? WHERE id = ?`,
      [syncStatus, id]
    );
  }
}

export async function incrementRetryCount(id: string): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `UPDATE tests SET retryCount = retryCount + 1, syncStatus = 'pending_sync' WHERE id = ?`,
    [id]
  );
}

export async function markAsFailed(id: string): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `UPDATE tests SET syncStatus = 'failed' WHERE id = ?`,
    [id]
  );
}

export async function getPendingSync(): Promise<LocalTestRecord[]> {
  const db = await getDB();
  return db.getAllAsync<LocalTestRecord>(
    `SELECT * FROM tests WHERE syncStatus = 'pending_sync' ORDER BY createdAt ASC`
  );
}

export async function getFailedSync(): Promise<LocalTestRecord[]> {
  const db = await getDB();
  return db.getAllAsync<LocalTestRecord>(
    `SELECT * FROM tests WHERE syncStatus = 'failed' ORDER BY createdAt ASC`
  );
}

export async function getSyncedCount(): Promise<number> {
  const db = await getDB();
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM tests WHERE syncStatus = 'synced'`
  );
  return row?.count ?? 0;
}

export async function getPendingCount(): Promise<number> {
  const db = await getDB();
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM tests WHERE syncStatus = 'pending_sync'`
  );
  return row?.count ?? 0;
}

export async function getFailedCount(): Promise<number> {
  const db = await getDB();
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM tests WHERE syncStatus = 'failed'`
  );
  return row?.count ?? 0;
}

export async function getAllTests(): Promise<LocalTestRecord[]> {
  const db = await getDB();
  return db.getAllAsync<LocalTestRecord>(
    `SELECT * FROM tests ORDER BY createdAt DESC`
  );
}

export async function deleteSyncedOlderThan(days: number): Promise<void> {
  const db = await getDB();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  await db.runAsync(
    `DELETE FROM tests WHERE syncStatus = 'synced' AND createdAt < ?`,
    [cutoff.toISOString()]
  );
}

export async function getTestById(id: string): Promise<LocalTestRecord | null> {
  const db = await getDB();
  return db.getFirstAsync<LocalTestRecord>(
    `SELECT * FROM tests WHERE id = ?`,
    [id]
  );
}

export async function insertDraft(draft: LocalDraft): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO drafts (id, officerId, driverData, step, createdAt) VALUES (?, ?, ?, ?, ?)`,
    [draft.id, draft.officerId, draft.driverData, draft.step, draft.createdAt]
  );
}

export async function updateDraft(id: string, driverData: string, step: 'scan' | 'reading'): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `UPDATE drafts SET driverData = ?, step = ? WHERE id = ?`,
    [driverData, step, id]
  );
}

export async function getDraft(id: string): Promise<LocalDraft | null> {
  const db = await getDB();
  return db.getFirstAsync<LocalDraft>(
    `SELECT * FROM drafts WHERE id = ?`,
    [id]
  );
}

export async function deleteDraft(id: string): Promise<void> {
  const db = await getDB();
  await db.runAsync(`DELETE FROM drafts WHERE id = ?`, [id]);
}

export async function getLatestDraft(): Promise<LocalDraft | null> {
  const db = await getDB();
  return db.getFirstAsync<LocalDraft>(
    `SELECT * FROM drafts ORDER BY createdAt DESC LIMIT 1`
  );
}
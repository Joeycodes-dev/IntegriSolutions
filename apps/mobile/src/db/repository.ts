import { getDB } from './client';

export type SyncStatus = 'pending_sync' | 'synced' | 'failed';

export type AuditAction =
  | 'auth.login'
  | 'auth.login.failed'
  | 'auth.logout'
  | 'test.saved'
  | 'test.invalidated'
  | 'test.invalidation.failed'
  | 'sync.batch.completed'
  | 'sync.batch.failed';

export type AuditOutcome = 'success' | 'failure';
export type AuditSeverity = 'info' | 'warning' | 'critical';

export interface AuditEvent {
  id: string;
  occurredAt: string;
  officerId: number | null;
  officerName: string | null;
  badgeNumber: string | null;
  action: AuditAction;
  entityType: string | null;
  entityId: string | null;
  outcome: AuditOutcome;
  severity: AuditSeverity;
  message: string;
  metadata: string | null;
}

export interface LocalTestRecord {
  id: string;
  officerId: number | null;
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
  photoUri: string | null;
  originalTestId: string | null;
}

export interface LocalDraft {
  id: string;
  officerId: number | null;
  driverData: string;
  step: 'scan' | 'reading';
  createdAt: string;
}

export async function insertTest(record: LocalTestRecord): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO tests (id, officerId, officerName, badgeNumber, driverName, driverId, driverDob, bacReading, result, location, hash, syncStatus, createdAt, syncedAt, retryCount, photoUri, originalTestId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      record.retryCount,
      record.photoUri,
      record.originalTestId
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
      `UPDATE tests SET syncStatus = ?, retryCount = retryCount + 1 WHERE id = ?`,
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

export async function getPendingSync(officerId?: number | null): Promise<LocalTestRecord[]> {
  const db = await getDB();
  if (officerId !== undefined && officerId !== null) {
    return db.getAllAsync<LocalTestRecord>(
      `SELECT * FROM tests WHERE syncStatus = 'pending_sync' AND officerId = ? ORDER BY createdAt ASC`,
      [officerId]
    );
  }
  return db.getAllAsync<LocalTestRecord>(
    `SELECT * FROM tests WHERE syncStatus = 'pending_sync' AND officerId IS NULL ORDER BY createdAt ASC`
  );
}

export async function getFailedSync(officerId?: number | null): Promise<LocalTestRecord[]> {
  const db = await getDB();
  if (officerId !== undefined && officerId !== null) {
    return db.getAllAsync<LocalTestRecord>(
      `SELECT * FROM tests WHERE syncStatus = 'failed' AND officerId = ? ORDER BY createdAt ASC`,
      [officerId]
    );
  }
  return db.getAllAsync<LocalTestRecord>(
    `SELECT * FROM tests WHERE syncStatus = 'failed' AND officerId IS NULL ORDER BY createdAt ASC`
  );
}

export async function getSyncedCount(officerId?: number | null): Promise<number> {
  const db = await getDB();
  if (officerId !== undefined && officerId !== null) {
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM tests WHERE syncStatus = 'synced' AND officerId = ?`,
      [officerId]
    );
    return row?.count ?? 0;
  }
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM tests WHERE syncStatus = 'synced' AND officerId IS NULL`
  );
  return row?.count ?? 0;
}

export async function getPendingCount(officerId?: number | null): Promise<number> {
  const db = await getDB();
  if (officerId !== undefined && officerId !== null) {
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM tests WHERE syncStatus = 'pending_sync' AND officerId = ?`,
      [officerId]
    );
    return row?.count ?? 0;
  }
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM tests WHERE syncStatus = 'pending_sync' AND officerId IS NULL`
  );
  return row?.count ?? 0;
}

export async function getFailedCount(officerId?: number | null): Promise<number> {
  const db = await getDB();
  if (officerId !== undefined && officerId !== null) {
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM tests WHERE syncStatus = 'failed' AND officerId = ?`,
      [officerId]
    );
    return row?.count ?? 0;
  }
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM tests WHERE syncStatus = 'failed' AND officerId IS NULL`
  );
  return row?.count ?? 0;
}

export async function getTestCountBetween(
  startIso: string,
  endIso: string,
  officerId?: number | null
): Promise<number> {
  const db = await getDB();
  if (officerId !== undefined && officerId !== null) {
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM tests WHERE createdAt >= ? AND createdAt < ? AND officerId = ?`,
      [startIso, endIso, officerId]
    );
    return row?.count ?? 0;
  }
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM tests WHERE createdAt >= ? AND createdAt < ? AND officerId IS NULL`,
    [startIso, endIso]
  );
  return row?.count ?? 0;
}

export async function getAllTests(officerId?: number | null): Promise<LocalTestRecord[]> {
  const db = await getDB();
  if (officerId !== undefined && officerId !== null) {
    return db.getAllAsync<LocalTestRecord>(
      `SELECT * FROM tests WHERE officerId = ? ORDER BY createdAt DESC`,
      [officerId]
    );
  }
  return db.getAllAsync<LocalTestRecord>(
    `SELECT * FROM tests WHERE officerId IS NULL ORDER BY createdAt DESC`
  );
}

export async function getRecentTests(limit = 3, officerId?: number | null): Promise<LocalTestRecord[]> {
  const db = await getDB();
  if (officerId !== undefined && officerId !== null) {
    return db.getAllAsync<LocalTestRecord>(
      `SELECT * FROM tests WHERE officerId = ? ORDER BY createdAt DESC LIMIT ?`,
      [officerId, limit]
    );
  }
  return db.getAllAsync<LocalTestRecord>(
    `SELECT * FROM tests WHERE officerId IS NULL ORDER BY createdAt DESC LIMIT ?`,
    [limit]
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

export async function insertAuditEvent(event: AuditEvent): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO audit_events
       (id, occurredAt, officerId, officerName, badgeNumber, action, entityType, entityId, outcome, severity, message, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      event.id,
      event.occurredAt,
      event.officerId,
      event.officerName,
      event.badgeNumber,
      event.action,
      event.entityType,
      event.entityId,
      event.outcome,
      event.severity,
      event.message,
      event.metadata
    ]
  );
}

export async function getAllAuditEvents(limit = 500): Promise<AuditEvent[]> {
  const db = await getDB();
  return db.getAllAsync<AuditEvent>(
    `SELECT * FROM audit_events ORDER BY occurredAt DESC LIMIT ?`,
    [limit]
  );
}

export async function getAuditEventsByAction(
  actionPrefix: string,
  limit = 500
): Promise<AuditEvent[]> {
  const db = await getDB();
  return db.getAllAsync<AuditEvent>(
    `SELECT * FROM audit_events WHERE action LIKE ? ORDER BY occurredAt DESC LIMIT ?`,
    [`${actionPrefix}%`, limit]
  );
}

export async function getAuditEventCounts(): Promise<{
  total: number;
  auth: number;
  tests: number;
  sync: number;
  failures: number;
}> {
  const db = await getDB();
  const totalRow = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM audit_events`
  );
  const authRow = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM audit_events WHERE action LIKE 'auth.%'`
  );
  const testsRow = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM audit_events WHERE action LIKE 'test.%'`
  );
  const syncRow = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM audit_events WHERE action LIKE 'sync.%'`
  );
  const failuresRow = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM audit_events WHERE outcome = 'failure'`
  );
  return {
    total: totalRow?.count ?? 0,
    auth: authRow?.count ?? 0,
    tests: testsRow?.count ?? 0,
    sync: syncRow?.count ?? 0,
    failures: failuresRow?.count ?? 0
  };
}
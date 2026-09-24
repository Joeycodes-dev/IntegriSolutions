import { getDB } from './client';

export type SyncStatus = 'pending_sync' | 'synced' | 'failed';

export type AuditAction =
  | 'auth.login'
  | 'auth.login.failed'
  | 'auth.logout'
  | 'test.saved'
  | 'test.device.captured'
  | 'test.device.connected'
  | 'test.device.disconnected'
  | 'test.device.calibrated'
  | 'test.device.diagnostic'
  | 'test.invalidated'
  | 'test.invalidation.failed'
  | 'sync.batch.completed'
  | 'sync.batch.failed'
  | 'sync.batch.throttled'
  | 'alert.received'
  | 'alert.acknowledged.queued'
  | 'alert.acknowledged.synced';

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
  deviceTransport?: string | null;
  deviceSerial?: string | null;
  deviceCalibrationVersion?: string | null;
  deviceCalibrationR0?: number | null;
  deviceSessionPeakRaw?: number | null;
  deviceAvgRaw?: number | null;
  deviceRaw?: number | null;
  deviceCapturedAt?: string | null;
}

export interface LocalEvidenceAttachment {
  id: string;
  testId: string;
  category: string;
  uri: string;
  syncStatus: SyncStatus;
  retryCount: number;
  createdAt: string;
  syncedAt: string | null;
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
    `INSERT INTO tests (id, officerId, officerName, badgeNumber, driverName, driverId, driverDob, bacReading, result, location, hash, syncStatus, createdAt, syncedAt, retryCount, photoUri, originalTestId, deviceTransport, deviceSerial, deviceCalibrationVersion, deviceCalibrationR0, deviceSessionPeakRaw, deviceAvgRaw, deviceRaw, deviceCapturedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      record.originalTestId,
      record.deviceTransport ?? null,
      record.deviceSerial ?? null,
      record.deviceCalibrationVersion ?? null,
      record.deviceCalibrationR0 ?? null,
      record.deviceSessionPeakRaw ?? null,
      record.deviceAvgRaw ?? null,
      record.deviceRaw ?? null,
      record.deviceCapturedAt ?? null
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
      `SELECT * FROM tests WHERE syncStatus = 'pending_sync' AND (officerId = ? OR officerId IS NULL) ORDER BY createdAt ASC`,
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
      `SELECT * FROM tests WHERE syncStatus = 'failed' AND (officerId = ? OR officerId IS NULL) ORDER BY createdAt ASC`,
      [officerId]
    );
  }
  return db.getAllAsync<LocalTestRecord>(
    `SELECT * FROM tests WHERE syncStatus = 'failed' AND officerId IS NULL ORDER BY createdAt ASC`
  );
}

export async function resetFailedToPending(officerId?: number | null): Promise<void> {
  const db = await getDB();
  if (officerId !== undefined && officerId !== null) {
    await db.runAsync(
      `UPDATE tests SET syncStatus = 'pending_sync' WHERE syncStatus = 'failed' AND (officerId = ? OR officerId IS NULL)`,
      [officerId]
    );
    return;
  }

  await db.runAsync(
    `UPDATE tests SET syncStatus = 'pending_sync' WHERE syncStatus = 'failed' AND officerId IS NULL`
  );
}

export async function getSyncedCount(officerId?: number | null): Promise<number> {
  const db = await getDB();
  if (officerId !== undefined && officerId !== null) {
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM tests WHERE syncStatus = 'synced' AND (officerId = ? OR officerId IS NULL)`,
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
      `SELECT COUNT(*) as count FROM tests WHERE syncStatus = 'pending_sync' AND (officerId = ? OR officerId IS NULL)`,
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
      `SELECT COUNT(*) as count FROM tests WHERE syncStatus = 'failed' AND (officerId = ? OR officerId IS NULL)`,
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
      `SELECT COUNT(*) as count FROM tests WHERE createdAt >= ? AND createdAt < ? AND (officerId = ? OR officerId IS NULL)`,
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
      `SELECT * FROM tests WHERE officerId = ? OR officerId IS NULL ORDER BY createdAt DESC`,
      [officerId]
    );
  }
  return db.getAllAsync<LocalTestRecord>(
    `SELECT * FROM tests WHERE officerId IS NULL ORDER BY createdAt DESC`
  );
}

export async function getRecentTests(limit = 3, officerId?: number | null): Promise<LocalTestRecord[]> {
  const db = await getDB();
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.trunc(limit)) : 3;
  if (officerId !== undefined && officerId !== null) {
    return db.getAllAsync<LocalTestRecord>(
      `SELECT * FROM tests WHERE officerId = ? OR officerId IS NULL ORDER BY createdAt DESC LIMIT ${safeLimit}`,
      [officerId]
    );
  }
  return db.getAllAsync<LocalTestRecord>(
    `SELECT * FROM tests WHERE officerId IS NULL ORDER BY createdAt DESC LIMIT ${safeLimit}`
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

export interface CachedAlertRecord {
  id: string;
  officerId: number | null;
  version: number;
  alertJson: string;
  receivedAt: string;
  acknowledgedAt: string | null;
  updatedAt: string;
}

/**
 * Upserts the officer's active-alerts snapshot for offline reads. receivedAt
 * is stamped once per (id, version) — untouched on refreshes that don't
 * change the alert's version — so it reflects when this device first saw
 * that version, distinct from the alert's server-side createdAt.
 */
export async function upsertCachedAlerts(
  officerId: number | null,
  alerts: Array<{ id: string; version: number; acknowledgedAt: string | null; payload: unknown }>
): Promise<Array<{ id: string; version: number; receivedAt: string; isNewReceipt: boolean }>> {
  const db = await getDB();
  const now = new Date().toISOString();
  const receipts: Array<{ id: string; version: number; receivedAt: string; isNewReceipt: boolean }> = [];
  for (const alert of alerts) {
    const existing = await db.getFirstAsync<CachedAlertRecord>(
      `SELECT * FROM alert_cache WHERE id = ?`,
      [alert.id]
    );
    const isNewReceipt = !existing || existing.version !== alert.version;
    const receivedAt = isNewReceipt ? now : existing!.receivedAt;
    const alertJson = JSON.stringify(alert.payload);
    if (existing) {
      await db.runAsync(
        `UPDATE alert_cache SET officerId = ?, version = ?, alertJson = ?, receivedAt = ?, acknowledgedAt = ?, updatedAt = ? WHERE id = ?`,
        [officerId, alert.version, alertJson, receivedAt, alert.acknowledgedAt, now, alert.id]
      );
    } else {
      await db.runAsync(
        `INSERT INTO alert_cache (id, officerId, version, alertJson, receivedAt, acknowledgedAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [alert.id, officerId, alert.version, alertJson, receivedAt, alert.acknowledgedAt, now]
      );
    }
    receipts.push({ id: alert.id, version: alert.version, receivedAt, isNewReceipt });
  }
  return receipts;
}

export async function getCachedAlerts(officerId?: number | null): Promise<CachedAlertRecord[]> {
  const db = await getDB();
  if (officerId !== undefined && officerId !== null) {
    return db.getAllAsync<CachedAlertRecord>(
      `SELECT * FROM alert_cache WHERE officerId = ? OR officerId IS NULL ORDER BY updatedAt DESC`,
      [officerId]
    );
  }
  return db.getAllAsync<CachedAlertRecord>(
    `SELECT * FROM alert_cache WHERE officerId IS NULL ORDER BY updatedAt DESC`
  );
}

/** Reflects an optimistic (or confirmed) acknowledgement into the offline cache. */
export async function updateCachedAlertAcknowledgement(id: string, acknowledgedAt: string): Promise<void> {
  const db = await getDB();
  await db.runAsync(`UPDATE alert_cache SET acknowledgedAt = ? WHERE id = ?`, [acknowledgedAt, id]);
}

export interface PendingAlertAck {
  alertId: string;
  officerId: number | null;
  requestedAt: string;
  retryCount: number;
}

/** One pending ack per alert — acknowledgement is idempotent server-side, so
 * a second offline tap on the same alert doesn't need its own queue row. */
export async function queueAlertAck(alertId: string, officerId: number | null, requestedAt: string): Promise<void> {
  const db = await getDB();
  const existing = await db.getFirstAsync<PendingAlertAck>(
    `SELECT * FROM alert_ack_queue WHERE alertId = ?`,
    [alertId]
  );
  if (existing) return;
  await db.runAsync(
    `INSERT INTO alert_ack_queue (alertId, officerId, requestedAt, retryCount) VALUES (?, ?, ?, 0)`,
    [alertId, officerId, requestedAt]
  );
}

export async function getPendingAlertAcks(): Promise<PendingAlertAck[]> {
  const db = await getDB();
  return db.getAllAsync<PendingAlertAck>(`SELECT * FROM alert_ack_queue ORDER BY requestedAt ASC`);
}

export async function removeAlertAckFromQueue(alertId: string): Promise<void> {
  const db = await getDB();
  await db.runAsync(`DELETE FROM alert_ack_queue WHERE alertId = ?`, [alertId]);
}

export async function incrementAlertAckRetry(alertId: string): Promise<void> {
  const db = await getDB();
  await db.runAsync(`UPDATE alert_ack_queue SET retryCount = retryCount + 1 WHERE alertId = ?`, [alertId]);
}

export async function insertDraft(draft: LocalDraft): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO drafts (id, officerId, driverData, step, createdAt) VALUES (?, ?, ?, ?, ?)`,
    [draft.id, draft.officerId, draft.driverData, draft.step, draft.createdAt]
  );
}

export async function insertEvidenceAttachment(attachment: LocalEvidenceAttachment): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO evidence_attachments (id, testId, category, uri, syncStatus, retryCount, createdAt, syncedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      attachment.id,
      attachment.testId,
      attachment.category,
      attachment.uri,
      attachment.syncStatus,
      attachment.retryCount,
      attachment.createdAt,
      attachment.syncedAt
    ]
  );
}

export async function getAttachmentsByTest(testId: string): Promise<LocalEvidenceAttachment[]> {
  const db = await getDB();
  return db.getAllAsync<LocalEvidenceAttachment>(
    `SELECT * FROM evidence_attachments WHERE testId = ? ORDER BY createdAt ASC`,
    [testId]
  );
}

export async function getPendingAttachments(): Promise<LocalEvidenceAttachment[]> {
  const db = await getDB();
  return db.getAllAsync<LocalEvidenceAttachment>(
    `SELECT * FROM evidence_attachments WHERE syncStatus = 'pending_sync' ORDER BY createdAt ASC`
  );
}

export async function getFailedAttachments(): Promise<LocalEvidenceAttachment[]> {
  const db = await getDB();
  return db.getAllAsync<LocalEvidenceAttachment>(
    `SELECT * FROM evidence_attachments WHERE syncStatus = 'failed' ORDER BY createdAt ASC`
  );
}

export async function updateAttachmentSyncStatus(
  id: string,
  syncStatus: SyncStatus,
  syncedAt?: string
): Promise<void> {
  const db = await getDB();
  if (syncStatus === 'synced' && syncedAt) {
    await db.runAsync(
      `UPDATE evidence_attachments SET syncStatus = ?, syncedAt = ?, retryCount = 0 WHERE id = ?`,
      [syncStatus, syncedAt, id]
    );
  } else {
    await db.runAsync(
      `UPDATE evidence_attachments SET syncStatus = ?, retryCount = retryCount + 1 WHERE id = ?`,
      [syncStatus, id]
    );
  }
}

export async function resetAttachmentToPending(id: string): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `UPDATE evidence_attachments SET syncStatus = 'pending_sync', retryCount = 0 WHERE id = ?`,
    [id]
  );
}

export async function resetFailedAttachmentsToPending(): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `UPDATE evidence_attachments SET syncStatus = 'pending_sync' WHERE syncStatus = 'failed'`
  );
}

export async function deleteAttachment(id: string): Promise<void> {
  const db = await getDB();
  await db.runAsync(`DELETE FROM evidence_attachments WHERE id = ?`, [id]);
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
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.trunc(limit)) : 500;
  return db.getAllAsync<AuditEvent>(
    `SELECT * FROM audit_events ORDER BY occurredAt DESC LIMIT ${safeLimit}`
  );
}

export async function getAuditEventsByAction(
  actionPrefix: string,
  limit = 500
): Promise<AuditEvent[]> {
  const db = await getDB();
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.trunc(limit)) : 500;
  return db.getAllAsync<AuditEvent>(
    `SELECT * FROM audit_events WHERE action LIKE ? ORDER BY occurredAt DESC LIMIT ${safeLimit}`,
    [`${actionPrefix}%`]
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
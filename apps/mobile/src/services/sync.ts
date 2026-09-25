import { sha256 } from 'js-sha256';
import {
  insertTest,
  insertTestWithAttachments,
  getPendingSync,
  getTestById,
  markSyncSuccess,
  recordSyncAttempt,
  type LocalTestRecord
} from '../db/repository';
import type { TestLocationPayload } from '../lib/testLocation';
import type { DeviceEvidencePayload } from './breathalyzer';
import {
  syncRecords,
  uploadEvidencePhoto,
  acknowledgeAlert,
  isNetworkRequestError,
  isRateLimitError,
  isPermanentApiError,
  isRetryableApiError,
} from './api';
import { logAuditEvent } from './audit';
import { getAccessToken } from './auth';
import { deleteDurableAttachmentFile } from './activeTestDraftAttachments';
import { syncCoordinator } from '../lib/SyncCoordinator';
import { createLocalReceiptNumber } from '../lib/receipt';
import {
  evidenceIdempotencyKey,
  hashEvidenceFile,
  isSha256,
} from '../lib/evidenceIntegrity';
import {
  getPendingAttachments,
  insertEvidenceAttachment,
  updateEvidenceIntegrity,
  markAttachmentSyncSuccess,
  recordAttachmentSyncAttempt,
  getPendingAlertAcks,
  removeAlertAckFromQueue,
  incrementAlertAckRetry,
  updateCachedAlertAcknowledgement
} from '../db/repository';

export { generateId } from '../lib/id';
export type { TestLocationPayload } from '../lib/testLocation';

function normalizeSyncError(error: unknown, fallback = 'Sync failed'): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const normalized = raw.replace(/\s+/g, ' ').trim();
  return (normalized || fallback).slice(0, 1000);
}

function isTransientSyncError(error: unknown): boolean {
  if (
    isRateLimitError(error) ||
    isNetworkRequestError(error) ||
    (typeof isRetryableApiError === 'function' && isRetryableApiError(error))
  ) return true;
  const message = normalizeSyncError(error);
  return /\bHTTP 5\d\d\b|internal server error|service unavailable|bad gateway|gateway timeout|temporarily unavailable|invalid or expired access token|session expired|sign in again|unauthorized/i.test(
    message,
  );
}

function isPermanentSyncError(error: unknown): boolean {
  if (typeof isPermanentApiError === 'function' && isPermanentApiError(error)) return true;
  return /\b(?:collision|conflict|idempotency|integrity|invalid|mismatch|not found|forbidden|unauthorized|hashed|could not be read|unsupported|hash verification|tampered)\b/i.test(
    normalizeSyncError(error),
  );
}

function safeParseLocation(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // Keep legacy or malformed values as plain text so one bad row does not block the whole sync batch.
    return raw;
  }
}

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

function normalizeIdentifier(value: string): string {
  return value.replace(/\s+/g, '').trim();
}

function maskIdentifier(value: string): string {
  if (value.length <= 4) return value;
  return `${value.slice(0, 2)}${'*'.repeat(Math.max(1, value.length - 4))}${value.slice(-2)}`;
}

function protectIdentifier(value: string): string {
  const normalized = normalizeIdentifier(value);
  if (!normalized) return '';
  const digest = sha256(normalized);
  return `enc:${maskIdentifier(normalized)}:${digest.slice(0, 24)}`;
}

export interface RecordPayloadParams {
  officerId: number | null;
  officerName: string;
  badgeNumber: string;
  driverName: string;
  driverId: string;
  driverDob: string;
  bacReading: number;
  result: string;
  location: TestLocationPayload;
  createdAt: string;
  originalTestId?: string | null;
  device?: DeviceEvidencePayload | null;
}

export function buildRecordPayload(params: RecordPayloadParams): Record<string, unknown> {
  return {
    officerId: params.officerId,
    officerName: params.officerName,
    badgeNumber: params.badgeNumber,
    driverName: params.driverName,
    driverId: params.driverId,
    driverDob: params.driverDob,
    bacReading: params.bacReading,
    result: params.result,
    location: params.location,
    createdAt: params.createdAt,
    originalTestId: params.originalTestId ?? null,
    ...(params.device
      ? {
          deviceTransport: params.device.transport,
          ...(params.device.serial ? { deviceSerial: params.device.serial } : {}),
          deviceCalibrationVersion: params.device.calibrationVersion,
          deviceCalibrationR0: params.device.calibrationCleanAirResistanceOhms,
          deviceSessionPeakRaw: params.device.sessionPeakRaw,
          deviceAvgRaw: params.device.avgRaw,
          deviceRaw: params.device.raw,
          deviceCapturedAt: params.device.capturedAt
        }
      : {})
  };
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
  location: TestLocationPayload;
  createdAt?: string;
  photoUri?: string | null;
  attachments?: Array<{
    id: string;
    category: string;
    uri: string;
    idempotencyKey?: string | null;
    contentHash?: string | null;
  }>;
  originalTestId?: string | null;
  device?: DeviceEvidencePayload | null;
}): Promise<LocalTestRecord> {
  const protectedDriverId = protectIdentifier(params.driverId);
  const createdAt = params.createdAt ?? new Date().toISOString();
  const device = params.device ?? null;

  const recordPayload = buildRecordPayload({
    officerId: params.officerId,
    officerName: params.officerName,
    badgeNumber: params.badgeNumber,
    driverName: params.driverName,
    driverId: protectedDriverId,
    driverDob: params.driverDob,
    bacReading: params.bacReading,
    result: params.result,
    location: params.location,
    createdAt,
    originalTestId: params.originalTestId,
    device
  });

  const hash = computeHash(recordPayload);

  if (__DEV__) {
    console.log(`[saveLocally] hash=${hash} canonical=${canonicalStringify(recordPayload)}`);
  }

  const record: LocalTestRecord = {
    id: params.id,
    receiptNumber: createLocalReceiptNumber(params.id, createdAt),
    officerId: params.officerId,
    officerName: params.officerName,
    badgeNumber: params.badgeNumber,
    driverName: params.driverName,
    driverId: protectedDriverId,
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
    originalTestId: params.originalTestId ?? null,
    deviceTransport: device?.transport ?? null,
    deviceSerial: device?.serial ?? null,
    deviceCalibrationVersion: device?.calibrationVersion ?? null,
    deviceCalibrationR0: device?.calibrationCleanAirResistanceOhms ?? null,
    deviceSessionPeakRaw: device?.sessionPeakRaw ?? null,
    deviceAvgRaw: device?.avgRaw ?? null,
    deviceRaw: device?.raw ?? null,
    deviceCapturedAt: device?.capturedAt ?? null
  };

  const attachments = [...(params.attachments ?? [])];
  if (params.photoUri && !attachments.some((attachment) => attachment.uri === params.photoUri)) {
    attachments.push({
      id: `${record.id}-legacy-vehicle`,
      category: 'vehicle',
      uri: params.photoUri
    });
  }

  const localAttachments = attachments.map((attachment) => ({
    id: attachment.id,
    testId: record.id,
    category: attachment.category,
    uri: attachment.uri,
    idempotencyKey: attachment.idempotencyKey ?? evidenceIdempotencyKey(attachment.id),
    contentHash: isSha256(attachment.contentHash) ? attachment.contentHash : null,
    syncStatus: 'pending_sync' as const,
    retryCount: 0,
    createdAt: new Date().toISOString(),
    syncedAt: null
  }));

  // Keep the fallback for lightweight repository mocks and older native
  // bundles; current SQLite builds use the atomic bundle insert.
  if (typeof insertTestWithAttachments === 'function') {
    await insertTestWithAttachments(record, localAttachments);
  } else {
    await insertTest(record);
    for (const attachment of localAttachments) {
      await insertEvidenceAttachment(attachment);
    }
  }

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
      receiptNumber: record.receiptNumber,
      retest: !!record.originalTestId,
      originalTestId: record.originalTestId,
      roadblock: params.location.roadblock ?? null
    }
  });
  return record;
}
export type SyncAttachmentResult = {
  testId: string;
  attachmentId: string;
  category: string;
  status: 'synced' | 'pending' | 'failed';
  error?: string;
};

export type SyncRecordsResult = {
  attempted: number;
  synced: string[];
  duplicates: string[];
  duplicateReceipts?: Record<string, string | null>;
  receipts?: Record<string, string | null>;
  failed: { id: string; error: string; code?: string; retryable?: boolean }[];
  deferred: { id: string; error: string }[];
  attachmentResults: SyncAttachmentResult[];
  runError: string | null;
};

export type SyncScope =
  | { kind: 'all' }
  | {
      kind: 'selected';
      recordIds?: readonly string[];
      attachmentIds?: readonly string[];
    };

export function syncPendingRecords(
  officerId?: number | null,
  scope: SyncScope = { kind: 'all' }
): Promise<SyncRecordsResult> {
  return syncCoordinator.run(() => syncPendingRecordsInternal(officerId, scope));
}

export async function syncPendingRecordsInternal(
  officerId?: number | null,
  scope: SyncScope = { kind: 'all' }
): Promise<SyncRecordsResult> {
  const token = await getAccessToken();
  if (!token) {
    return {
      attempted: 0,
      synced: [],
      duplicates: [],
      failed: [],
      deferred: [],
      attachmentResults: [],
      runError: 'Sign in to sync local records.'
    };
  }

  const selectedRecordIds = scope.kind === 'selected'
    ? new Set(scope.recordIds ?? [])
    : null;
  const selectedAttachmentIds = scope.kind === 'selected'
    ? new Set(scope.attachmentIds ?? [])
    : null;
  const allPending = await getPendingSync(officerId);
  const pending = selectedRecordIds
    ? allPending.filter((record) => selectedRecordIds.has(record.id))
    : allPending;
  const attachmentResults: SyncAttachmentResult[] = [];
  const processedAttachmentTestIds = new Set<string>();
  // Flipped as soon as the server tells us to back off. Attachments are one HTTP
  // request each, so without this a throttled batch would keep spending the
  // budget we have just been told has run out.
  let throttled = false;

  const attachmentInScope = (attachment: { id: string; testId: string }): boolean => {
    if (scope.kind === 'all') return true;
    if (selectedAttachmentIds?.has(attachment.id)) return true;
    return selectedRecordIds?.has(attachment.testId) ?? false;
  };

  const uploadAttachmentsFor = async (testId: string) => {
    if (throttled || processedAttachmentTestIds.has(testId)) return;
    const parent = await getTestById(testId);
    if (!parent || parent.syncStatus !== 'synced') return;

    processedAttachmentTestIds.add(testId);
    const attachments = await getPendingAttachments(officerId);
    const owned = attachments.filter(
      (attachment) => attachment.testId === testId && attachmentInScope(attachment)
    );

    for (const attachment of owned) {
      try {
        const idempotencyKey = attachment.idempotencyKey ?? evidenceIdempotencyKey(attachment.id);
        const contentHash = isSha256(attachment.contentHash)
          ? attachment.contentHash
          : await hashEvidenceFile(attachment.uri);
        if (!isSha256(contentHash)) {
          throw new Error('Evidence file could not be hashed before upload.');
        }
        if (!isSha256(attachment.contentHash) && typeof updateEvidenceIntegrity === 'function') {
          await updateEvidenceIntegrity(attachment.id, idempotencyKey, contentHash);
        }
        await uploadEvidencePhoto(testId, attachment.uri, attachment.category, {
          idempotencyKey,
          contentHash
        });
        const syncedAt = new Date().toISOString();
        await markAttachmentSyncSuccess(attachment.id, syncedAt);
        await deleteDurableAttachmentFile(attachment.uri);
        attachmentResults.push({
          testId,
          attachmentId: attachment.id,
          category: attachment.category,
          status: 'synced'
        });
        if (__DEV__) {
          console.log(`[sync] uploaded ${attachment.category} photo for test ${testId}`);
        }
      } catch (photoError) {
        const message = normalizeSyncError(photoError, 'Photo upload failed');
        const deferred = isTransientSyncError(photoError);
        const permanent = isPermanentSyncError(photoError);
        if (isRateLimitError(photoError)) throttled = true;
        const finalStatus = !deferred && (permanent || attachment.retryCount >= 4) ? 'failed' : 'pending_sync';
        await recordAttachmentSyncAttempt(
          attachment.id,
          finalStatus,
          message,
          new Date().toISOString(),
          !deferred,
        );
        attachmentResults.push({
          testId,
          attachmentId: attachment.id,
          category: attachment.category,
          status: finalStatus === 'failed' ? 'failed' : 'pending',
          error: message
        });
        if (isRateLimitError(photoError)) return;
        if (__DEV__) {
          console.warn(`[sync] photo upload deferred for test ${testId} (${attachment.category}):`, message);
        }
      }
    }
  };

  if (pending.length === 0) {
    const pendingAttachments = (await getPendingAttachments(officerId)).filter(attachmentInScope);
    const attachmentTestIds = Array.from(new Set(pendingAttachments.map((attachment) => attachment.testId)));
    for (const testId of attachmentTestIds) {
      await uploadAttachmentsFor(testId);
    }
    return {
      attempted: 0,
      synced: [],
      duplicates: [],
      failed: [],
      deferred: [],
      attachmentResults,
      runError: null
    };
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
    location: safeParseLocation(record.location),
    hash: record.hash,
    receiptNumber: record.receiptNumber,
    createdAt: record.createdAt,
    originalTestId: record.originalTestId,
    deviceTransport: record.deviceTransport ?? undefined,
    deviceSerial: record.deviceSerial ?? undefined,
    deviceCalibrationVersion: record.deviceCalibrationVersion ?? undefined,
    deviceCalibrationR0: record.deviceCalibrationR0 ?? undefined,
    deviceSessionPeakRaw: record.deviceSessionPeakRaw ?? undefined,
    deviceAvgRaw: record.deviceAvgRaw ?? undefined,
    deviceRaw: record.deviceRaw ?? undefined,
    deviceCapturedAt: record.deviceCapturedAt ?? undefined
  }));

  let responseComplete = false;
  try {
    const response = {
      synced: [] as string[],
      failed: [] as { id: string; error: string; code?: string; retryable?: boolean }[],
      duplicates: [] as string[],
      duplicateReceipts: {} as Record<string, string | null>,
      receipts: {} as Record<string, string | null>
    };
    for (let index = 0; index < records.length; index += 50) {
      const chunk = await syncRecords(records.slice(index, index + 50));
      response.synced.push(...chunk.synced);
      response.failed.push(...chunk.failed);
      response.duplicates.push(...chunk.duplicates);
      Object.assign(response.duplicateReceipts, chunk.duplicateReceipts ?? {});
      Object.assign(response.receipts, chunk.receipts ?? {});
    }
    responseComplete = true;
    const submittedIds = new Set(pending.map((record) => record.id));
    response.synced = response.synced.filter((id) => submittedIds.has(id));
    response.duplicates = response.duplicates.filter((id) => submittedIds.has(id));
    response.failed = response.failed.filter((failure) => submittedIds.has(failure.id));
    const syncedIds: string[] = [];
    const failedIds: { id: string; error: string }[] = [];

    for (const id of response.synced) {
      await markSyncSuccess(id, new Date().toISOString());
      syncedIds.push(id);
      await uploadAttachmentsFor(id);
    }

    for (const id of response.duplicates) {
      await markSyncSuccess(id, new Date().toISOString());
      syncedIds.push(id);
      await uploadAttachmentsFor(id);
    }

    const failedTestIds = new Set(response.failed.map((failure) => failure.id));
    const pendingTestIds = new Set(pending.map((record) => record.id));
    const remainingAttachments = (await getPendingAttachments(officerId)).filter(attachmentInScope);
    const orphanTestIds = Array.from(new Set(remainingAttachments.map((attachment) => attachment.testId)))
      .filter((testId) => !pendingTestIds.has(testId) && !failedTestIds.has(testId) && !processedAttachmentTestIds.has(testId));
    for (const testId of orphanTestIds) {
      await uploadAttachmentsFor(testId);
    }

    for (const failure of response.failed) {
      const record = pending.find((r) => r.id === failure.id);
      const permanent = failure.retryable === false || isPermanentSyncError(failure.error);
      const finalStatus = record && (permanent || record.retryCount >= 4) ? 'failed' : 'pending_sync';
      const normalizedFailure = {
        id: failure.id,
        error: normalizeSyncError(failure.error, 'The server rejected this record.'),
      };
      await recordSyncAttempt(
        failure.id,
        finalStatus,
        normalizedFailure.error,
        new Date().toISOString(),
        true,
      );
      failedIds.push(normalizedFailure);
    }

    const returnedIds = new Set([
      ...response.synced,
      ...response.duplicates,
      ...response.failed.map((failure) => failure.id),
    ]);
    for (const record of pending) {
      if (returnedIds.has(record.id)) continue;
      const error = 'The server did not return a sync result for this record. It remains queued.';
      await recordSyncAttempt(
        record.id,
        'pending_sync',
        error,
        new Date().toISOString(),
        false,
      );
      failedIds.push({ id: record.id, error });
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
        attachments: attachmentResults,
        failedIds: failedIds.map((f) => ({ id: f.id, error: f.error }))
      }
    });

    return {
      attempted: pending.length,
      synced: syncedIds,
      duplicates: response.duplicates,
      duplicateReceipts: response.duplicateReceipts,
      receipts: response.receipts,
      failed: failedIds,
      deferred: [],
      attachmentResults,
      runError: failedIds[0]?.error ?? null
    };
  } catch (error) {
    // Once the server response has been received, later failures are local
    // persistence/upload work. Never rewrite already-accepted records as
    // pending because one evidence row or audit write failed.
    if (responseComplete) throw error;

    const message = normalizeSyncError(error);

    if (isTransientSyncError(error)) {
      // Throttled/offline: leave every record pending with its retry budget
      // intact, while preserving the latest reason for the Sync Centre.
      const attemptedAt = new Date().toISOString();
      for (const record of pending) {
        await recordSyncAttempt(
          record.id,
          'pending_sync',
          message,
          attemptedAt,
          false,
        );
      }
      await logAuditEvent({
        action: 'sync.batch.deferred',
        outcome: 'failure',
        severity: 'warning',
        message: `Sync batch deferred, safely retaining ${pending.length} record(s)`,
        entityType: 'sync',
        metadata: { attempted: pending.length, deferred: pending.length, error: message }
      });
      return {
        attempted: pending.length,
        synced: [],
        duplicates: [],
        failed: [],
        deferred: pending.map((record) => ({ id: record.id, error: message })),
        attachmentResults,
        runError: message
      };
    }

    const failedIds: { id: string; error: string }[] = [];
    for (const record of pending) {
      const entry = { id: record.id, error: message };
      const finalStatus = record.retryCount >= 4 ? 'failed' : 'pending_sync';
      await recordSyncAttempt(
        record.id,
        finalStatus,
        message,
        new Date().toISOString(),
        true,
      );
      failedIds.push(entry);
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
    return {
      attempted: pending.length,
      synced: [],
      duplicates: [],
      failed: failedIds,
      deferred: [],
      attachmentResults,
      runError: message
    };
  }
}

/**
 * Drains alert_ack_queue (offline acknowledgements from useActiveAlerts,
 * see lib/useActiveAlerts.ts) into POST /alerts/:id/acknowledge. The backend
 * upserts on (alert_id, officer_id, alert_version) and derives the version
 * itself, so replaying an ack here is already idempotent — no request body
 * or dedupe bookkeeping needed beyond removing the row once it lands.
 *
 * Called from SyncContext's existing sync tick (see lib/SyncContext.tsx) —
 * this deliberately reuses that heartbeat rather than running its own timer.
 */
export function syncPendingAlertAcks(
  officerId?: number | null
): Promise<{
  synced: string[];
  failed: string[];
  errors: { alertId: string; error: string }[];
}> {
  return syncCoordinator.run(() => syncPendingAlertAcksInternal(officerId));
}

export async function syncPendingAlertAcksInternal(
  officerId?: number | null
): Promise<{
  synced: string[];
  failed: string[];
  errors: { alertId: string; error: string }[];
}> {
  const token = await getAccessToken();
  if (!token) {
    return { synced: [], failed: [], errors: [] };
  }

  const pending = await getPendingAlertAcks(officerId);
  const synced: string[] = [];
  const failed: string[] = [];
  const errors: { alertId: string; error: string }[] = [];

  for (const ack of pending) {
    try {
      const result = await acknowledgeAlert(ack.alertId);
      await removeAlertAckFromQueue(ack.alertId);
      await updateCachedAlertAcknowledgement(ack.alertId, result.acknowledgedAt);
      synced.push(ack.alertId);
      await logAuditEvent({
        action: 'alert.acknowledged.synced',
        outcome: 'success',
        message: `Queued acknowledgement for alert ${ack.alertId} synced`,
        entityType: 'alert',
        entityId: ack.alertId,
        officerId: ack.officerId
      });
    } catch (error) {
      const message = normalizeSyncError(error, 'Alert acknowledgement failed');
      failed.push(ack.alertId);
      errors.push({ alertId: ack.alertId, error: message });
      await logAuditEvent({
        action: 'alert.acknowledged.failed',
        outcome: 'failure',
        severity: isTransientSyncError(error) ? 'warning' : 'critical',
        message: `Queued acknowledgement for alert ${ack.alertId} failed: ${message}`,
        entityType: 'alert',
        entityId: ack.alertId,
        officerId: ack.officerId,
        metadata: { retryCount: ack.retryCount, error: message }
      });
      if (isRateLimitError(error) || /invalid or expired access token|session expired|sign in again|unauthorized/i.test(message)) {
        return { synced, failed, errors };
      }
      if (isTransientSyncError(error)) {
        // Still offline, or the server is throttling us — leave queued and retry
        // next tick. Neither is the server rejecting the acknowledgement, so
        // neither should cost retry budget or drop the ack after 4 attempts.
        continue;
      }
      // Server rejected the request outright (e.g. alert no longer eligible).
      // Retrying won't help, so drop it rather than retrying forever.
      await incrementAlertAckRetry(ack.alertId);
      if (ack.retryCount >= 4) {
        await removeAlertAckFromQueue(ack.alertId);
      }
    }
  }

  return { synced, failed, errors };
}

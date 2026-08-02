import { sha256 } from 'js-sha256';
import { insertTest, updateSyncStatus, getPendingSync, type LocalTestRecord } from '../db/repository';
import type { TestLocationPayload } from '../lib/testLocation';
import { syncRecords, uploadEvidencePhoto } from './api';
import { logAuditEvent } from './audit';
import { getAccessToken } from './auth';
import {
  getPendingAttachments,
  insertEvidenceAttachment,
  updateAttachmentSyncStatus
} from '../db/repository';

export { generateId } from '../lib/id';
export type { TestLocationPayload } from '../lib/testLocation';

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
  photoUri?: string | null;
  attachments?: Array<{
    id: string;
    category: string;
    uri: string;
  }>;
  originalTestId?: string | null;
}): Promise<LocalTestRecord> {
  const protectedDriverId = protectIdentifier(params.driverId);

  const recordPayload: Record<string, unknown> = {
    officerId: params.officerId,
    officerName: params.officerName,
    badgeNumber: params.badgeNumber,
    driverName: params.driverName,
    driverId: protectedDriverId,
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
    originalTestId: params.originalTestId ?? null
  };

  await insertTest(record);

  const attachments = [...(params.attachments ?? [])];
  if (params.photoUri && !attachments.some((attachment) => attachment.uri === params.photoUri)) {
    attachments.push({
      id: `${record.id}-legacy-vehicle`,
      category: 'vehicle',
      uri: params.photoUri
    });
  }

  for (const attachment of attachments) {
    await insertEvidenceAttachment({
      id: attachment.id,
      testId: record.id,
      category: attachment.category,
      uri: attachment.uri,
      syncStatus: 'pending_sync',
      retryCount: 0,
      createdAt: new Date().toISOString(),
      syncedAt: null
    });
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
      retest: !!record.originalTestId,
      originalTestId: record.originalTestId,
      roadblock: params.location.roadblock ?? null
    }
  });
  return record;
}
export async function syncPendingRecords(officerId?: number | null): Promise<{
  synced: string[];
  failed: { id: string; error: string }[];
  attachmentResults: {
    testId: string;
    attachmentId: string;
    category: string;
    status: 'synced' | 'pending' | 'failed';
    error?: string;
  }[];
}> {
  const token = await getAccessToken();
  if (!token) {
    return { synced: [], failed: [], attachmentResults: [] };
  }

  const pending = await getPendingSync(officerId);
  const attachmentResults: Awaited<ReturnType<typeof syncPendingRecords>>['attachmentResults'] = [];
  const processedAttachmentTestIds = new Set<string>();

  const uploadAttachmentsFor = async (testId: string) => {
    processedAttachmentTestIds.add(testId);
    const attachments = await getPendingAttachments();
    const owned = attachments.filter((attachment) => attachment.testId === testId);

    for (const attachment of owned) {
      try {
        await uploadEvidencePhoto(testId, attachment.uri, attachment.category);
        await updateAttachmentSyncStatus(attachment.id, 'synced', new Date().toISOString());
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
        const message = photoError instanceof Error ? photoError.message : 'Photo upload failed';
        if (attachment.retryCount >= 4) {
          await updateAttachmentSyncStatus(attachment.id, 'failed');
          attachmentResults.push({
            testId,
            attachmentId: attachment.id,
            category: attachment.category,
            status: 'failed',
            error: message
          });
        } else {
          await updateAttachmentSyncStatus(attachment.id, 'pending_sync');
          attachmentResults.push({
            testId,
            attachmentId: attachment.id,
            category: attachment.category,
            status: 'pending',
            error: message
          });
        }
        if (__DEV__) {
          console.warn(`[sync] photo upload deferred for test ${testId} (${attachment.category}):`, message);
        }
      }
    }
  };

  if (pending.length === 0) {
    const orphanAttachments = await getPendingAttachments();
    const orphanTestIds = Array.from(new Set(orphanAttachments.map((attachment) => attachment.testId)));
    for (const testId of orphanTestIds) {
      await uploadAttachmentsFor(testId);
    }
    return { synced: [], failed: [], attachmentResults };
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
      await uploadAttachmentsFor(id);
    }

    for (const id of response.duplicates) {
      await updateSyncStatus(id, 'synced', new Date().toISOString());
      syncedIds.push(id);
      await uploadAttachmentsFor(id);
    }

    const failedTestIds = new Set(response.failed.map((failure) => failure.id));
    const pendingTestIds = new Set(pending.map((record) => record.id));
    const remainingAttachments = await getPendingAttachments();
    const orphanTestIds = Array.from(new Set(remainingAttachments.map((attachment) => attachment.testId)))
      .filter((testId) => !pendingTestIds.has(testId) && !failedTestIds.has(testId) && !processedAttachmentTestIds.has(testId));
    for (const testId of orphanTestIds) {
      await uploadAttachmentsFor(testId);
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
        attachments: attachmentResults.length,
        failedIds: failedIds.map((f) => ({ id: f.id, error: f.error }))
      }
    });

    return { synced: syncedIds, failed: failedIds, attachmentResults };
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
    return { synced: [], failed: failedIds, attachmentResults: [] };
  }
}

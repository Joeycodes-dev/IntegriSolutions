import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../src/db/client', () => require('../../src/db/client.web'));

import {
  deleteActiveTestDraft,
  getAttachmentStatusCounts,
  getAuditEventsByAction,
  getFailedSync,
  getLatestActiveTestDraft,
  getNewestSyncedAt,
  getPendingSync,
  getSyncEvidenceAttachments,
  insertAuditEvent,
  insertEvidenceAttachment,
  insertTest,
  insertTestWithAttachments,
  getAttachmentsByTest,
  updateEvidenceIntegrity,
  markAttachmentSyncSuccess,
  markSyncSuccess,
  saveActiveTestDraft,
  recordAttachmentSyncAttempt,
  recordSyncAttempt,
  resetFailedAttachmentsToPending,
  type LocalTestRecord,
} from '../../src/db/repository';

const values = new Map<string, string>();
const localStorage = {
  getItem: jest.fn((key: string) => values.get(key) ?? null),
  setItem: jest.fn((key: string, value: string) => {
    values.set(key, value);
  }),
  removeItem: jest.fn((key: string) => {
    values.delete(key);
  }),
  clear: jest.fn(() => values.clear()),
  key: jest.fn(),
  length: 0,
};

function makeRecord(overrides: Partial<LocalTestRecord> = {}): LocalTestRecord {
  return {
    id: 'test-1',
    officerId: 1,
    officerName: 'Officer One',
    badgeNumber: 'B001',
    driverName: 'Driver A',
    driverId: 'DL001',
    driverDob: '1990-01-01',
    bacReading: 0.08,
    result: 'fail',
    location: '{}',
    hash: 'hash-1',
    syncStatus: 'pending_sync',
    createdAt: '2026-09-24T10:00:00.000Z',
    syncedAt: null,
    retryCount: 0,
    photoUri: null,
    originalTestId: null,
    ...overrides,
  };
}

describe('sync diagnostics repository web shim', () => {
  beforeEach(() => {
    values.clear();
    jest.clearAllMocks();
    (global as unknown as { window: unknown }).window = { localStorage };
  });

  it('persists record errors, retry counts, and successful cleanup', async () => {
    await insertTest(makeRecord());
    await recordSyncAttempt(
      'test-1',
      'failed',
      'HTTP 422: Custody hash verification failed',
      '2026-09-24T10:05:00.000Z'
    );

    const [failed] = await getFailedSync(1);
    expect(failed).toMatchObject({
      syncStatus: 'failed',
      retryCount: 1,
      lastAttemptAt: '2026-09-24T10:05:00.000Z',
      lastError: 'HTTP 422: Custody hash verification failed',
    });

    await markSyncSuccess('test-1', '2026-09-24T10:06:00.000Z');
    expect(await getFailedSync(1)).toEqual([]);
    expect(await getPendingSync(1)).toEqual([]);
    await expect(getNewestSyncedAt(1)).resolves.toEqual(new Date('2026-09-24T10:06:00.000Z'));
  });

  it('writes a receipt and evidence integrity metadata in one bundle and protects it from overwrite', async () => {
    await insertTestWithAttachments(
      makeRecord({ id: 'bundle-1', receiptNumber: 'IS-20260924-ABCDEF123456' }),
      [{
        id: 'bundle-evidence-1',
        testId: 'bundle-1',
        category: 'licence_front',
        uri: 'file:///bundle.jpg',
        idempotencyKey: 'evidence-bundle-evidence-1',
        contentHash: 'a'.repeat(64),
        syncStatus: 'pending_sync',
        retryCount: 0,
        createdAt: '2026-09-24T10:01:00.000Z',
        syncedAt: null,
      }],
    );

    expect((await getAttachmentsByTest('bundle-1'))[0]).toMatchObject({
      idempotencyKey: 'evidence-bundle-evidence-1',
      contentHash: 'a'.repeat(64),
    });

    await updateEvidenceIntegrity(
      'bundle-evidence-1',
      'evidence-different',
      'b'.repeat(64),
    );
    expect((await getAttachmentsByTest('bundle-1'))[0]).toMatchObject({
      idempotencyKey: 'evidence-bundle-evidence-1',
      contentHash: 'a'.repeat(64),
    });
  });

  it('tracks evidence independently and re-queues it even when its parent failed', async () => {
    await insertTest(makeRecord({ id: 'parent-1', syncStatus: 'failed' }));
    await insertEvidenceAttachment({
      id: 'evidence-1',
      testId: 'parent-1',
      category: 'licence_front',
      uri: 'file:///licence.jpg',
      syncStatus: 'pending_sync',
      retryCount: 0,
      createdAt: '2026-09-24T10:01:00.000Z',
      syncedAt: null,
    });
    await recordAttachmentSyncAttempt(
      'evidence-1',
      'failed',
      'HTTP 413: Photo exceeds the 5 MB limit',
      '2026-09-24T10:02:00.000Z'
    );

    expect(await getAttachmentStatusCounts(1)).toEqual({ synced: 0, pending: 0, failed: 1 });
    expect(await getSyncEvidenceAttachments(1)).toEqual([
      expect.objectContaining({
        id: 'evidence-1',
        syncStatus: 'failed',
        parentSyncStatus: 'failed',
        lastError: 'HTTP 413: Photo exceeds the 5 MB limit',
      }),
    ]);

    await resetFailedAttachmentsToPending(1);
    expect(await getSyncEvidenceAttachments(1)).toEqual([
      expect.objectContaining({
        id: 'evidence-1',
        syncStatus: 'pending_sync',
        retryCount: 0,
        lastError: null,
        parentSyncStatus: 'failed',
      }),
    ]);
  });

  it('uses evidence acceptance as the latest successful transfer time', async () => {
    await insertTest(makeRecord({
      id: 'parent-2',
      syncStatus: 'synced',
      syncedAt: '2026-09-24T10:00:00.000Z',
    }));
    await insertEvidenceAttachment({
      id: 'evidence-2',
      testId: 'parent-2',
      category: 'vehicle',
      uri: 'file:///vehicle.jpg',
      syncStatus: 'pending_sync',
      retryCount: 0,
      createdAt: '2026-09-24T10:01:00.000Z',
      syncedAt: null,
    });
    await markAttachmentSyncSuccess('evidence-2', '2026-09-24T10:08:00.000Z');

    await expect(getNewestSyncedAt(1)).resolves.toEqual(new Date('2026-09-24T10:08:00.000Z'));
    expect(await getAttachmentStatusCounts(1)).toEqual({ synced: 1, pending: 0, failed: 0 });
  });

  it('persists one owner-scoped active draft and cleans up superseded rows', async () => {
    const owner = {
      ownerKey: 'officer:1',
      officerId: 1,
      officerUid: 'officer-uid-1',
    };
    await saveActiveTestDraft({
      id: 'draft-1',
      owner,
      driverData: JSON.stringify({ draftId: 'draft-1', version: 1 }),
      step: 'scan',
      payloadVersion: 1,
      createdAt: '2026-09-24T10:00:00.000Z',
      updatedAt: '2026-09-24T10:01:00.000Z',
    });
    await saveActiveTestDraft({
      id: 'draft-1',
      owner,
      driverData: JSON.stringify({ draftId: 'draft-1', version: 1, notes: 'updated' }),
      step: 'reading',
      payloadVersion: 1,
      createdAt: '2026-09-24T10:00:00.000Z',
      updatedAt: '2026-09-24T10:02:00.000Z',
    });
    await saveActiveTestDraft({
      id: 'draft-2',
      owner,
      driverData: JSON.stringify({ draftId: 'draft-2', version: 1 }),
      step: 'scan',
      payloadVersion: 1,
      createdAt: '2026-09-24T10:03:00.000Z',
      updatedAt: '2026-09-24T10:03:00.000Z',
    });

    await expect(getLatestActiveTestDraft(owner)).resolves.toMatchObject({
      id: 'draft-2',
      step: 'scan',
      createdAt: '2026-09-24T10:03:00.000Z',
    });
    await deleteActiveTestDraft('draft-2', owner);
    await expect(getLatestActiveTestDraft(owner)).resolves.toBeNull();
  });

  it('loads bounded sync and alert activity for the Activity tab', async () => {
    await insertAuditEvent({
      id: 'audit-sync',
      occurredAt: '2026-09-24T10:00:00.000Z',
      officerId: 1,
      officerName: 'Officer One',
      badgeNumber: 'B001',
      action: 'sync.batch.deferred',
      entityType: 'sync',
      entityId: null,
      outcome: 'failure',
      severity: 'warning',
      message: 'Sync safely deferred',
      metadata: null,
    });
    await insertAuditEvent({
      id: 'audit-alert',
      occurredAt: '2026-09-24T10:01:00.000Z',
      officerId: 1,
      officerName: 'Officer One',
      badgeNumber: 'B001',
      action: 'alert.acknowledged.failed',
      entityType: 'alert',
      entityId: 'alert-1',
      outcome: 'failure',
      severity: 'warning',
      message: 'Alert acknowledgement deferred',
      metadata: null,
    });

    expect(await getAuditEventsByAction('sync', 50)).toEqual([
      expect.objectContaining({ id: 'audit-sync' }),
    ]);
    expect(await getAuditEventsByAction('alert.acknowledged', 20)).toEqual([
      expect.objectContaining({ id: 'audit-alert' }),
    ]);
  });
});

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { saveLocally, syncPendingRecords } from '../../src/services/sync';
import * as repository from '../../src/db/repository';
import * as api from '../../src/services/api';
import * as auth from '../../src/services/auth';
import * as audit from '../../src/services/audit';

jest.mock('../../src/services/auth', () => ({
  getAccessToken: jest.fn(),
}));

jest.mock('../../src/services/api', () => ({
  syncRecords: jest.fn(),
  uploadEvidencePhoto: jest.fn(),
  isNetworkRequestError: jest.fn((err: unknown) =>
    err instanceof Error && /^Network error requesting/.test(err.message)
  ),
  isRateLimitError: jest.fn((err: unknown) => err instanceof Error && err.name === 'RateLimitError'),
}));

jest.mock('../../src/services/audit', () => ({
  logAuditEvent: jest.fn(),
}));

jest.mock('../../src/db/repository', () => ({
  insertTest: jest.fn(),
  insertEvidenceAttachment: jest.fn(),
  getPendingSync: jest.fn(),
  getTestById: jest.fn(),
  markSyncSuccess: jest.fn(),
  recordSyncAttempt: jest.fn(),
  getPendingAttachments: jest.fn(),
  markAttachmentSyncSuccess: jest.fn(),
  recordAttachmentSyncAttempt: jest.fn(),
}));

const authMock = auth as jest.Mocked<typeof auth>;
const apiMock = api as jest.Mocked<typeof api>;
const repositoryMock = repository as jest.Mocked<typeof repository>;
const auditMock = audit as jest.Mocked<typeof audit>;

const pendingTest = {
  id: 'test-1',
  officerId: 1,
  officerName: 'Officer One',
  badgeNumber: 'B001',
  driverName: 'Driver A',
  driverId: 'DL001',
  driverDob: '1990-01-01',
  bacReading: 0.08,
  result: 'fail' as const,
  location: '{}',
  hash: 'abc123',
  syncStatus: 'pending_sync' as const,
  createdAt: '2026-08-01T10:00:00Z',
  syncedAt: null,
  retryCount: 0,
  photoUri: null,
  originalTestId: null,
};

const pendingAttachment = {
  id: 'att-1',
  testId: 'test-1',
  category: 'licence_front',
  uri: 'file:///licence.jpg',
  idempotencyKey: 'evidence-att-1',
  contentHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  syncStatus: 'pending_sync' as const,
  retryCount: 0,
  createdAt: '2026-08-01T10:00:01Z',
  syncedAt: null,
};

describe('syncPendingRecords attachment handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authMock.getAccessToken.mockResolvedValue('token-123');
    repositoryMock.getPendingSync.mockResolvedValue([pendingTest]);
    repositoryMock.getTestById.mockResolvedValue({ ...pendingTest, syncStatus: 'synced' });
    repositoryMock.markSyncSuccess.mockResolvedValue(undefined);
    repositoryMock.recordSyncAttempt.mockResolvedValue(undefined);
    repositoryMock.markAttachmentSyncSuccess.mockResolvedValue(undefined);
    repositoryMock.recordAttachmentSyncAttempt.mockResolvedValue(undefined);
    apiMock.syncRecords.mockResolvedValue({
      synced: ['test-1'],
      failed: [],
      duplicates: [],
    });
    apiMock.uploadEvidencePhoto.mockResolvedValue({ id: 1 });
    repositoryMock.getPendingAttachments.mockResolvedValue([pendingAttachment]);
    auditMock.logAuditEvent.mockResolvedValue(undefined);
  });

  it('uploads pending attachments only after the parent record is accepted', async () => {
    const result = await syncPendingRecords(1);

    expect(result.synced).toEqual(['test-1']);
    expect(repositoryMock.markSyncSuccess).toHaveBeenCalledWith('test-1', expect.any(String));
    expect(apiMock.uploadEvidencePhoto).toHaveBeenCalledWith(
      'test-1',
      'file:///licence.jpg',
      'licence_front',
      {
        idempotencyKey: 'evidence-att-1',
        contentHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      }
    );
    expect(repositoryMock.markAttachmentSyncSuccess).toHaveBeenCalledWith(
      'att-1',
      expect.any(String)
    );
    expect(result.attachmentResults).toEqual([
      expect.objectContaining({
        testId: 'test-1',
        attachmentId: 'att-1',
        category: 'licence_front',
        status: 'synced',
      }),
    ]);
  });

  it('uploads only the selected record and its dependent evidence', async () => {
    const otherTest = { ...pendingTest, id: 'test-2' };
    const otherAttachment = {
      ...pendingAttachment,
      id: 'att-2',
      testId: 'test-2',
      idempotencyKey: 'evidence-att-2',
    };
    repositoryMock.getPendingSync.mockResolvedValue([pendingTest, otherTest]);
    repositoryMock.getPendingAttachments.mockResolvedValue([pendingAttachment, otherAttachment]);
    repositoryMock.getTestById.mockResolvedValue({ ...pendingTest, syncStatus: 'synced' });
    apiMock.syncRecords.mockResolvedValue({
      synced: ['test-1'],
      failed: [],
      duplicates: [],
    });

    const result = await syncPendingRecords(1, {
      kind: 'selected',
      recordIds: ['test-1'],
    });

    expect(apiMock.syncRecords).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'test-1' }),
    ]);
    expect(apiMock.uploadEvidencePhoto).toHaveBeenCalledTimes(1);
    expect(apiMock.uploadEvidencePhoto).toHaveBeenCalledWith(
      'test-1',
      'file:///licence.jpg',
      'licence_front',
      expect.objectContaining({ idempotencyKey: 'evidence-att-1' }),
    );
    expect(result.attempted).toBe(1);
  });

  it('keeps a transient upload pending without consuming retry budget', async () => {
    apiMock.uploadEvidencePhoto.mockRejectedValue(
      new Error('Network error requesting /evidence/test-1')
    );

    const result = await syncPendingRecords(1);

    expect(result.attachmentResults[0].status).toBe('pending');
    expect(repositoryMock.recordAttachmentSyncAttempt).toHaveBeenCalledWith(
      'att-1',
      'pending_sync',
      expect.stringContaining('Network error'),
      expect.any(String),
      false
    );
  });

  it('marks a genuine upload rejection failed at the retry cap', async () => {
    apiMock.uploadEvidencePhoto.mockRejectedValue(new Error('File is not a supported image'));

    const result = await syncPendingRecords(1);

    expect(result.attachmentResults[0].status).toBe('pending');
    expect(repositoryMock.recordAttachmentSyncAttempt).toHaveBeenCalledWith(
      'att-1',
      'pending_sync',
      'File is not a supported image',
      expect.any(String),
      true
    );

    jest.clearAllMocks();
    authMock.getAccessToken.mockResolvedValue('token-123');
    repositoryMock.getPendingSync.mockResolvedValue([pendingTest]);
    repositoryMock.getTestById.mockResolvedValue({ ...pendingTest, syncStatus: 'synced' });
    apiMock.syncRecords.mockResolvedValue({ synced: ['test-1'], failed: [], duplicates: [] });
    apiMock.uploadEvidencePhoto.mockRejectedValue(new Error('File is not a supported image'));
    repositoryMock.getPendingAttachments.mockResolvedValue([
      { ...pendingAttachment, retryCount: 4 },
    ]);
    auditMock.logAuditEvent.mockResolvedValue(undefined);

    const resultAtCap = await syncPendingRecords(1);
    expect(resultAtCap.attachmentResults[0].status).toBe('failed');
    expect(repositoryMock.recordAttachmentSyncAttempt).toHaveBeenCalledWith(
      'att-1',
      'failed',
      'File is not a supported image',
      expect.any(String),
      true
    );
  });

  it('does not upload evidence while its parent is still pending', async () => {
    repositoryMock.getTestById.mockResolvedValue(pendingTest);

    const result = await syncPendingRecords(1);

    expect(apiMock.uploadEvidencePhoto).not.toHaveBeenCalled();
    expect(result.attachmentResults).toEqual([]);
  });

  it('still uploads pending attachments when the parent test already synced', async () => {
    repositoryMock.getPendingSync.mockResolvedValue([]);

    const result = await syncPendingRecords(1);

    expect(apiMock.syncRecords).not.toHaveBeenCalled();
    expect(apiMock.uploadEvidencePhoto).toHaveBeenCalledWith(
      'test-1',
      'file:///licence.jpg',
      'licence_front',
      {
        idempotencyKey: 'evidence-att-1',
        contentHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      }
    );
    expect(result.attachmentResults).toHaveLength(1);
    expect(result.attachmentResults[0].status).toBe('synced');
  });

  it('uploads an already-synced test attachment even when another test is pending', async () => {
    const orphanAttachment = { ...pendingAttachment, id: 'att-2', testId: 'already-synced' };
    repositoryMock.getPendingAttachments.mockResolvedValue([pendingAttachment, orphanAttachment]);
    repositoryMock.getTestById.mockImplementation(async (testId: string) => ({
      ...pendingTest,
      id: testId,
      syncStatus: 'synced',
    }));

    const result = await syncPendingRecords(1);

    expect(apiMock.uploadEvidencePhoto).toHaveBeenCalledWith(
      'test-1',
      'file:///licence.jpg',
      'licence_front',
      {
        idempotencyKey: 'evidence-att-1',
        contentHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      }
    );
    expect(apiMock.uploadEvidencePhoto).toHaveBeenCalledWith(
      'already-synced',
      'file:///licence.jpg',
      'licence_front',
      {
        idempotencyKey: 'evidence-att-1',
        contentHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      }
    );
    expect(result.attachmentResults).toHaveLength(2);
  });

  it('maps a legacy photoUri into a vehicle attachment', async () => {
    repositoryMock.insertTest.mockResolvedValue(undefined);
    repositoryMock.insertEvidenceAttachment.mockResolvedValue(undefined);

    await saveLocally({
      ...pendingTest,
      id: 'legacy-test',
      location: { lat: -26.2, lng: 28.0 },
      photoUri: 'file:///legacy.jpg'
    });

    expect(repositoryMock.insertEvidenceAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        testId: 'legacy-test',
        category: 'vehicle',
        uri: 'file:///legacy.jpg',
        syncStatus: 'pending_sync'
      })
    );
  });

  it('returns a structured sign-in error when the officer is not authenticated', async () => {
    authMock.getAccessToken.mockResolvedValue(null);

    const result = await syncPendingRecords(1);

    expect(result).toEqual({
      attempted: 0,
      synced: [],
      duplicates: [],
      failed: [],
      deferred: [],
      attachmentResults: [],
      runError: 'Sign in to sync local records.'
    });
    expect(apiMock.syncRecords).not.toHaveBeenCalled();
  });
});

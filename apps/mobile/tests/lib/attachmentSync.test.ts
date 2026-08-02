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
}));

jest.mock('../../src/services/audit', () => ({
  logAuditEvent: jest.fn(),
}));

jest.mock('../../src/db/repository', () => ({
  insertTest: jest.fn(),
  insertEvidenceAttachment: jest.fn(),
  getPendingSync: jest.fn(),
  updateSyncStatus: jest.fn(),
  getPendingAttachments: jest.fn(),
  updateAttachmentSyncStatus: jest.fn(),
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
  result: 'fail',
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
    apiMock.syncRecords.mockResolvedValue({
      synced: ['test-1'],
      failed: [],
      duplicates: [],
    });
    apiMock.uploadEvidencePhoto.mockResolvedValue({ id: 1 });
    repositoryMock.getPendingAttachments.mockResolvedValue([pendingAttachment]);
    auditMock.logAuditEvent.mockResolvedValue(undefined);
  });

  it('uploads pending attachments and marks them synced after the test syncs', async () => {
    const result = await syncPendingRecords(1);

    expect(result.synced).toEqual(['test-1']);
    expect(apiMock.uploadEvidencePhoto).toHaveBeenCalledWith('test-1', 'file:///licence.jpg', 'licence_front');
    expect(repositoryMock.updateAttachmentSyncStatus).toHaveBeenCalledWith(
      'att-1',
      'synced',
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

  it('keeps a failed attachment pending while under the retry cap and marks failed at the cap', async () => {
    apiMock.uploadEvidencePhoto.mockRejectedValue(new Error('Network down'));

    const result = await syncPendingRecords(1);
    expect(result.attachmentResults[0].status).toBe('pending');
    expect(repositoryMock.updateAttachmentSyncStatus).toHaveBeenCalledWith('att-1', 'pending_sync');

    jest.clearAllMocks();
    authMock.getAccessToken.mockResolvedValue('token-123');
    repositoryMock.getPendingSync.mockResolvedValue([pendingTest]);
    apiMock.syncRecords.mockResolvedValue({ synced: ['test-1'], failed: [], duplicates: [] });
    apiMock.uploadEvidencePhoto.mockRejectedValue(new Error('Network down'));
    repositoryMock.getPendingAttachments.mockResolvedValue([
      { ...pendingAttachment, retryCount: 4 },
    ]);
    auditMock.logAuditEvent.mockResolvedValue(undefined);

    const resultAtCap = await syncPendingRecords(1);
    expect(resultAtCap.attachmentResults[0].status).toBe('failed');
    expect(repositoryMock.updateAttachmentSyncStatus).toHaveBeenCalledWith('att-1', 'failed');
  });

  it('still uploads pending attachments when the parent test already synced', async () => {
    repositoryMock.getPendingSync.mockResolvedValue([]);

    const result = await syncPendingRecords(1);

    expect(apiMock.syncRecords).not.toHaveBeenCalled();
    expect(apiMock.uploadEvidencePhoto).toHaveBeenCalledWith('test-1', 'file:///licence.jpg', 'licence_front');
    expect(result.attachmentResults).toHaveLength(1);
    expect(result.attachmentResults[0].status).toBe('synced');
  });

  it('uploads an already-synced test attachment even when another test is pending', async () => {
    const orphanAttachment = { ...pendingAttachment, id: 'att-2', testId: 'already-synced' };
    repositoryMock.getPendingAttachments.mockResolvedValue([pendingAttachment, orphanAttachment]);

    const result = await syncPendingRecords(1);

    expect(apiMock.uploadEvidencePhoto).toHaveBeenCalledWith('test-1', 'file:///licence.jpg', 'licence_front');
    expect(apiMock.uploadEvidencePhoto).toHaveBeenCalledWith('already-synced', 'file:///licence.jpg', 'licence_front');
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

  it('returns empty results when the officer is not authenticated', async () => {
    authMock.getAccessToken.mockResolvedValue(null);

    const result = await syncPendingRecords(1);

    expect(result).toEqual({ synced: [], failed: [], attachmentResults: [] });
    expect(apiMock.syncRecords).not.toHaveBeenCalled();
  });
});

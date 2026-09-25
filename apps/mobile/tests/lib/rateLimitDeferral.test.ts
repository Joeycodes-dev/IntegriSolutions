import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { syncPendingRecords, syncPendingAlertAcks } from '../../src/services/sync';
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
  acknowledgeAlert: jest.fn(),
  isNetworkRequestError: jest.fn((err: unknown) => err instanceof Error && /^Network error requesting/.test(err.message)),
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
  getPendingAlertAcks: jest.fn(),
  removeAlertAckFromQueue: jest.fn(),
  incrementAlertAckRetry: jest.fn(),
  updateCachedAlertAcknowledgement: jest.fn(),
}));

const authMock = auth as jest.Mocked<typeof auth>;
const apiMock = api as jest.Mocked<typeof api>;
const repositoryMock = repository as jest.Mocked<typeof repository>;
const auditMock = audit as jest.Mocked<typeof audit>;

/** A 429 is "not right now", not a rejection of the payload. */
function throttled(): Error {
  const error = new Error('Too many requests, please try again shortly');
  error.name = 'RateLimitError';
  return error;
}

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
  retryCount: 4,
  photoUri: null,
  originalTestId: null,
};

function attachment(id: string, testId: string) {
  return {
    id,
    testId,
    category: 'licence_front',
    uri: `file:///${id}.jpg`,
    idempotencyKey: `evidence-${id}`,
    contentHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    syncStatus: 'pending_sync' as const,
    retryCount: 4,
    createdAt: '2026-08-01T10:00:01Z',
    syncedAt: null,
  };
}

describe('rate limited (429) sync deferral', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authMock.getAccessToken.mockResolvedValue('token-123');
    repositoryMock.getPendingSync.mockResolvedValue([pendingTest]);
    repositoryMock.getTestById.mockResolvedValue({ ...pendingTest, syncStatus: 'synced' });
    repositoryMock.markSyncSuccess.mockResolvedValue(undefined);
    repositoryMock.recordSyncAttempt.mockResolvedValue(undefined);
    repositoryMock.getPendingAttachments.mockResolvedValue([]);
    repositoryMock.markAttachmentSyncSuccess.mockResolvedValue(undefined);
    repositoryMock.recordAttachmentSyncAttempt.mockResolvedValue(undefined);
    repositoryMock.getPendingAlertAcks.mockResolvedValue([]);
    repositoryMock.removeAlertAckFromQueue.mockResolvedValue(undefined);
    repositoryMock.incrementAlertAckRetry.mockResolvedValue(undefined);
    repositoryMock.updateCachedAlertAcknowledgement.mockResolvedValue(undefined);
    auditMock.logAuditEvent.mockResolvedValue(undefined);
  });

  it('defers a throttled batch instead of spending the retry budget', async () => {
    apiMock.syncRecords.mockRejectedValue(throttled());

    const result = await syncPendingRecords(1);

    expect(result).toEqual({
      attempted: 1,
      synced: [],
      duplicates: [],
      failed: [],
      deferred: [{ id: 'test-1', error: 'Too many requests, please try again shortly' }],
      attachmentResults: [],
      runError: 'Too many requests, please try again shortly'
    });
    // A temporary limit records the reason but must not consume retry budget.
    expect(repositoryMock.recordSyncAttempt).toHaveBeenCalledWith(
      'test-1',
      'pending_sync',
      'Too many requests, please try again shortly',
      expect.any(String),
      false
    );
  });

  it('defers server 5xx failures without spending record retry budget', async () => {
    apiMock.syncRecords.mockRejectedValue(new Error('HTTP 503: Service unavailable'));

    const result = await syncPendingRecords(1);

    expect(result.deferred).toEqual([
      { id: 'test-1', error: 'HTTP 503: Service unavailable' },
    ]);
    expect(repositoryMock.recordSyncAttempt).toHaveBeenCalledWith(
      'test-1',
      'pending_sync',
      'HTTP 503: Service unavailable',
      expect.any(String),
      false
    );
  });

  it('leaves attachments pending and abandons the pass once throttled', async () => {
    repositoryMock.getPendingSync.mockResolvedValue([
      { ...pendingTest, id: 'test-1' },
      { ...pendingTest, id: 'test-2' },
    ]);
    repositoryMock.getPendingAttachments.mockResolvedValue([
      attachment('att-1', 'test-1'),
      attachment('att-2', 'test-2'),
    ]);
    apiMock.syncRecords.mockResolvedValue({ synced: ['test-1', 'test-2'], failed: [], duplicates: [] });
    apiMock.uploadEvidencePhoto.mockRejectedValue(throttled());

    const result = await syncPendingRecords(1);

    // One request each — pressing on would spend budget we've just been told we
    // don't have.
    expect(apiMock.uploadEvidencePhoto).toHaveBeenCalledTimes(1);
    expect(repositoryMock.recordAttachmentSyncAttempt).toHaveBeenCalledWith(
      'att-1',
      'pending_sync',
      'Too many requests, please try again shortly',
      expect.any(String),
      false
    );
    expect(result.attachmentResults).toEqual([
      {
        testId: 'test-1',
        attachmentId: 'att-1',
        category: 'licence_front',
        status: 'pending',
        error: 'Too many requests, please try again shortly',
      },
    ]);
  });

  it('keeps a throttled alert ack queued even at the retry cap', async () => {
    repositoryMock.getPendingAlertAcks.mockResolvedValue([
      { alertId: 'alert-1', officerId: 1, requestedAt: '2026-09-13T10:00:00Z', retryCount: 4 },
    ]);
    apiMock.acknowledgeAlert.mockRejectedValue(throttled());

    const result = await syncPendingAlertAcks();

    expect(result).toEqual({
      synced: [],
      failed: ['alert-1'],
      errors: [{ alertId: 'alert-1', error: 'Too many requests, please try again shortly' }]
    });
    // 429 is not the server rejecting the acknowledgement, so it must neither
    // cost retry budget nor drop the queued ack.
    expect(repositoryMock.incrementAlertAckRetry).not.toHaveBeenCalled();
    expect(repositoryMock.removeAlertAckFromQueue).not.toHaveBeenCalled();
  });
});

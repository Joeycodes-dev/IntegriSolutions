import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { syncPendingAlertAcks } from '../../src/services/sync';
import * as repository from '../../src/db/repository';
import * as api from '../../src/services/api';
import * as auth from '../../src/services/auth';
import * as audit from '../../src/services/audit';

jest.mock('../../src/services/auth', () => ({
  getAccessToken: jest.fn(),
}));

jest.mock('../../src/services/api', () => ({
  acknowledgeAlert: jest.fn(),
  isNetworkRequestError: jest.fn((err: unknown) => err instanceof Error && /^Network error requesting/.test(err.message)),
  isRateLimitError: jest.fn((err: unknown) => err instanceof Error && err.name === 'RateLimitError'),
}));

jest.mock('../../src/services/audit', () => ({
  logAuditEvent: jest.fn(),
}));

jest.mock('../../src/db/repository', () => ({
  getPendingAlertAcks: jest.fn(),
  removeAlertAckFromQueue: jest.fn(),
  incrementAlertAckRetry: jest.fn(),
  updateCachedAlertAcknowledgement: jest.fn(),
}));

const authMock = auth as jest.Mocked<typeof auth>;
const apiMock = api as jest.Mocked<typeof api>;
const repositoryMock = repository as jest.Mocked<typeof repository>;

describe('syncPendingAlertAcks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authMock.getAccessToken.mockResolvedValue('token-123');
    repositoryMock.updateCachedAlertAcknowledgement.mockResolvedValue(undefined);
    repositoryMock.removeAlertAckFromQueue.mockResolvedValue(undefined);
    repositoryMock.incrementAlertAckRetry.mockResolvedValue(undefined);
  });

  it('does nothing when there is no access token yet', async () => {
    authMock.getAccessToken.mockResolvedValue(null);
    repositoryMock.getPendingAlertAcks.mockResolvedValue([
      { alertId: 'alert-1', officerId: 1, requestedAt: '2026-09-13T10:00:00Z', retryCount: 0 },
    ]);

    const result = await syncPendingAlertAcks();

    expect(result).toEqual({ synced: [], failed: [], errors: [] });
    expect(apiMock.acknowledgeAlert).not.toHaveBeenCalled();
  });

  it('replays each queued ack and removes it from the queue on success', async () => {
    repositoryMock.getPendingAlertAcks.mockResolvedValue([
      { alertId: 'alert-1', officerId: 1, requestedAt: '2026-09-13T10:00:00Z', retryCount: 0 },
    ]);
    apiMock.acknowledgeAlert.mockResolvedValue({ alertId: 'alert-1', acknowledgedAt: '2026-09-13T10:05:00Z' });

    const result = await syncPendingAlertAcks();

    expect(apiMock.acknowledgeAlert).toHaveBeenCalledWith('alert-1');
    expect(repositoryMock.removeAlertAckFromQueue).toHaveBeenCalledWith('alert-1');
    expect(repositoryMock.updateCachedAlertAcknowledgement).toHaveBeenCalledWith('alert-1', '2026-09-13T10:05:00Z');
    expect(result.synced).toEqual(['alert-1']);
  });

  it('leaves a queued ack in place when still offline, to retry on the next tick', async () => {
    repositoryMock.getPendingAlertAcks.mockResolvedValue([
      { alertId: 'alert-1', officerId: 1, requestedAt: '2026-09-13T10:00:00Z', retryCount: 0 },
    ]);
    apiMock.acknowledgeAlert.mockRejectedValue(new Error('Network error requesting /alerts/alert-1/acknowledge: down'));

    const result = await syncPendingAlertAcks();

    expect(repositoryMock.removeAlertAckFromQueue).not.toHaveBeenCalled();
    expect(repositoryMock.incrementAlertAckRetry).not.toHaveBeenCalled();
    expect(audit.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'alert.acknowledged.failed',
        outcome: 'failure',
        severity: 'warning',
      })
    );
    expect(result.failed).toEqual(['alert-1']);
  });

  it('drops a queued ack after repeated genuine server rejections instead of retrying forever', async () => {
    repositoryMock.getPendingAlertAcks.mockResolvedValue([
      { alertId: 'alert-1', officerId: 1, requestedAt: '2026-09-13T10:00:00Z', retryCount: 4 },
    ]);
    apiMock.acknowledgeAlert.mockRejectedValue(new Error('This alert is not targeted to you'));

    await syncPendingAlertAcks();

    expect(repositoryMock.incrementAlertAckRetry).toHaveBeenCalledWith('alert-1');
    expect(repositoryMock.removeAlertAckFromQueue).toHaveBeenCalledWith('alert-1');
  });
});

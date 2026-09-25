import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { SyncProvider, useSync, type SyncRunSummary } from '../../src/lib/SyncContext';
import * as repository from '../../src/db/repository';
import * as sync from '../../src/services/sync';
import * as Network from 'expo-network';

const mockAuthState = {
  profile: { officerId: 1, name: 'Test Officer' },
  token: 'token-123' as string | null
};

jest.mock('../../src/lib/AuthContext', () => ({
  useAuth: () => mockAuthState
}));

jest.mock('../../src/db/repository', () => ({
  getPendingCount: jest.fn(),
  getFailedCount: jest.fn(),
  getSyncedCount: jest.fn(),
  getTestCountBetween: jest.fn(),
  getRecentTests: jest.fn(),
  getAttachmentStatusCounts: jest.fn(),
  getQueuedAlertAckCount: jest.fn(),
  getNewestSyncedAt: jest.fn(),
  resetFailedToPending: jest.fn(),
  resetFailedAttachmentsToPending: jest.fn(),
  retryFailedSyncRecord: jest.fn(),
  resetAttachmentToPending: jest.fn()
}));

jest.mock('../../src/services/sync', () => ({
  syncPendingRecords: jest.fn(),
  syncPendingAlertAcks: jest.fn(),
  syncPendingRecordsInternal: jest.fn(),
  syncPendingAlertAcksInternal: jest.fn()
}));

jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn()
}));

function emptySyncResult() {
  return {
    attempted: 0,
    synced: [],
    duplicates: [],
    failed: [],
    deferred: [],
    attachmentResults: [],
    runError: null
  };
}

describe('SyncContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (repository.getPendingCount as jest.Mock).mockResolvedValue(5);
    (repository.getFailedCount as jest.Mock).mockResolvedValue(2);
    (repository.getSyncedCount as jest.Mock).mockResolvedValue(10);
    (repository.getAttachmentStatusCounts as jest.Mock).mockResolvedValue({
      synced: 7,
      pending: 3,
      failed: 1
    });
    (repository.getQueuedAlertAckCount as jest.Mock).mockResolvedValue(2);
    (repository.getNewestSyncedAt as jest.Mock).mockResolvedValue(null);
    (repository.getTestCountBetween as jest.Mock).mockImplementation((startIso: string, endIso: string) => {
      const days = (new Date(endIso).getTime() - new Date(startIso).getTime()) / 86400000;
      return Promise.resolve(days > 1 ? 18 : 4);
    });
    (repository.getRecentTests as jest.Mock).mockResolvedValue([
      {
        id: 'record-1',
        officerId: 1,
        officerName: 'Test Officer',
        badgeNumber: 'BADGE-1',
        driverName: 'Test Driver',
        driverId: 'DL123',
        driverDob: '1990-01-01',
        bacReading: 0,
        result: 'pass',
        location: '{}',
        hash: 'hash',
        syncStatus: 'synced',
        createdAt: new Date().toISOString(),
        syncedAt: new Date().toISOString(),
        retryCount: 0,
        photoUri: null,
        originalTestId: null
      }
    ]);
    (repository.resetFailedToPending as jest.Mock).mockResolvedValue(undefined);
    (repository.resetFailedAttachmentsToPending as jest.Mock).mockResolvedValue(undefined);
    (repository.retryFailedSyncRecord as jest.Mock).mockResolvedValue(undefined);
    (repository.resetAttachmentToPending as jest.Mock).mockResolvedValue(undefined);
    (Network.getNetworkStateAsync as jest.Mock).mockResolvedValue({ isConnected: true });
    (sync.syncPendingRecords as jest.Mock).mockResolvedValue(emptySyncResult());
    (sync.syncPendingRecordsInternal as jest.Mock).mockResolvedValue(emptySyncResult());
    (sync.syncPendingAlertAcks as jest.Mock).mockResolvedValue({
      synced: [],
      failed: [],
      errors: []
    });
    (sync.syncPendingAlertAcksInternal as jest.Mock).mockResolvedValue({
      synced: [],
      failed: [],
      errors: []
    });
    mockAuthState.token = 'token-123';
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('provides record, evidence, and alert queue counts', async () => {
    const { result } = renderHook(() => useSync(), { wrapper: SyncProvider });

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(5);
      expect(result.current.failedCount).toBe(2);
      expect(result.current.syncedCount).toBe(10);
      expect(result.current.pendingEvidenceCount).toBe(3);
      expect(result.current.failedEvidenceCount).toBe(1);
      expect(result.current.syncedEvidenceCount).toBe(7);
      expect(result.current.queuedAlertCount).toBe(2);
      expect(result.current.todayCount).toBe(4);
      expect(result.current.weekCount).toBe(18);
      expect(result.current.recentTests).toHaveLength(1);
      expect(result.current.recentTests[0].driverName).toBe('Test Driver');
    });
  });

  it('exposes idle and last-synced state', async () => {
    const { result } = renderHook(() => useSync(), { wrapper: SyncProvider });
    expect(result.current.isSyncing).toBe(false);

    await waitFor(() => {
      expect(result.current.networkStatus).toBe('online');
    });
    expect(result.current.lastSyncedAt).toBeNull();
  });

  it('refreshes counts when refreshCounts is called', async () => {
    const { result } = renderHook(() => useSync(), { wrapper: SyncProvider });

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(5);
    });

    (repository.getPendingCount as jest.Mock).mockResolvedValue(3);

    await act(async () => {
      await result.current.refreshCounts();
    });

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(3);
    });
  });

  it('syncs pending work without resetting failed records', async () => {
    const acceptedAt = new Date();
    (repository.getNewestSyncedAt as jest.Mock).mockResolvedValue(acceptedAt);
    (sync.syncPendingRecords as jest.Mock).mockResolvedValue({
      ...emptySyncResult(),
      attempted: 1,
      synced: ['record-1']
    });
    (sync.syncPendingRecordsInternal as jest.Mock).mockResolvedValue({
      ...emptySyncResult(),
      attempted: 1,
      synced: ['record-1']
    });

    const { result } = renderHook(() => useSync(), { wrapper: SyncProvider });
    await waitFor(() => expect(result.current.pendingCount).toBe(5));

    let run!: SyncRunSummary;
    await act(async () => {
      run = await result.current.forceSync();
    });

    expect(sync.syncPendingRecordsInternal).toHaveBeenCalledWith(1, { kind: 'all' });
    expect(repository.resetFailedToPending).not.toHaveBeenCalled();
    expect(result.current.lastSyncedAt).toEqual(acceptedAt);
    expect(result.current.lastRun?.status).toBe('success');
    expect(run.status).toBe('success');
  });

  it('resets failed items only through the explicit retryFailed action', async () => {
    const { result } = renderHook(() => useSync(), { wrapper: SyncProvider });
    await waitFor(() => expect(result.current.pendingCount).toBe(5));

    await act(async () => {
      await result.current.retryFailed();
    });

    expect(repository.resetFailedToPending).toHaveBeenCalledWith(1);
    expect(repository.resetFailedAttachmentsToPending).toHaveBeenCalledWith(1);
    expect(sync.syncPendingRecordsInternal).toHaveBeenCalled();
  });

  it('does not sync when offline', async () => {
    (Network.getNetworkStateAsync as jest.Mock).mockResolvedValue({ isConnected: false });

    const { result } = renderHook(() => useSync(), { wrapper: SyncProvider });

    await act(async () => {
      await result.current.forceSync();
    });

    expect(sync.syncPendingRecords).not.toHaveBeenCalled();
    expect(result.current.lastRun?.status).toBe('offline');
  });

  it('does not sync without an access token', async () => {
    mockAuthState.token = null;

    const { result } = renderHook(() => useSync(), { wrapper: SyncProvider });

    await act(async () => {
      await result.current.forceSync();
    });

    expect(sync.syncPendingRecords).not.toHaveBeenCalled();
    expect(result.current.lastRun?.status).toBe('auth_required');
  });

  it('auto-syncs on interval', async () => {
    const { result } = renderHook(() => useSync(), { wrapper: SyncProvider });
    await waitFor(() => expect(result.current.pendingCount).toBe(5));

    await act(async () => {
      jest.advanceTimersByTime(10000);
    });

    await waitFor(() => {
      expect(sync.syncPendingRecordsInternal).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      jest.advanceTimersByTime(10000);
    });

    await waitFor(() => {
      expect(sync.syncPendingRecordsInternal).toHaveBeenCalledTimes(2);
    });
  });

  it('retries only the selected record through the serialized scope', async () => {
    const { result } = renderHook(() => useSync(), { wrapper: SyncProvider });
    await waitFor(() => expect(result.current.pendingCount).toBe(5));

    await act(async () => {
      await result.current.retryRecord('record-1');
    });

    expect(repository.retryFailedSyncRecord).toHaveBeenCalledWith('record-1', 1);
    expect(sync.syncPendingRecordsInternal).toHaveBeenCalledWith(1, {
      kind: 'selected',
      recordIds: ['record-1']
    });
    expect(sync.syncPendingAlertAcksInternal).not.toHaveBeenCalled();
  });

  it('retries only the selected evidence item through the serialized scope', async () => {
    const { result } = renderHook(() => useSync(), { wrapper: SyncProvider });
    await waitFor(() => expect(result.current.pendingCount).toBe(5));

    await act(async () => {
      await result.current.retryEvidence('evidence-1');
    });

    expect(repository.resetAttachmentToPending).toHaveBeenCalledWith('evidence-1', 1);
    expect(sync.syncPendingRecordsInternal).toHaveBeenCalledWith(1, {
      kind: 'selected',
      attachmentIds: ['evidence-1']
    });
    expect(sync.syncPendingAlertAcksInternal).not.toHaveBeenCalled();
  });

  it('handles sync errors gracefully', async () => {
    (sync.syncPendingRecords as jest.Mock).mockRejectedValue(new Error('Network error'));
    (sync.syncPendingRecordsInternal as jest.Mock).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useSync(), { wrapper: SyncProvider });

    await act(async () => {
      await result.current.forceSync();
    });

    expect(result.current.isSyncing).toBe(false);
    expect(result.current.lastRun?.status).toBe('error');
  });

  it('throws when useSync is used outside its provider', () => {
    expect(() => renderHook(() => useSync())).toThrow(
      'useSync must be used within a SyncProvider'
    );
  });
});

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { SyncProvider, useSync } from '../../src/lib/SyncContext';
import * as repository from '../../src/db/repository';
import * as sync from '../../src/services/sync';
import * as Network from 'expo-network';
import { AppState } from 'react-native';

jest.mock('../../src/lib/AuthContext', () => ({
  useAuth: () => ({
    profile: { officerId: 1, name: 'Test Officer' }
  })
}));

jest.mock('../../src/db/repository', () => ({
  getPendingCount: jest.fn(),
  getFailedCount: jest.fn(),
  getSyncedCount: jest.fn()
}));

jest.mock('../../src/services/sync', () => ({
  syncPendingRecords: jest.fn()
}));

jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn()
}));

describe('SyncContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (repository.getPendingCount as jest.Mock).mockResolvedValue(5);
    (repository.getFailedCount as jest.Mock).mockResolvedValue(2);
    (repository.getSyncedCount as jest.Mock).mockResolvedValue(10);
    (Network.getNetworkStateAsync as jest.Mock).mockResolvedValue({ isConnected: true });
    (sync.syncPendingRecords as jest.Mock).mockResolvedValue({ synced: [], failed: [] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('provides initial sync counts', async () => {
    const { result } = renderHook(() => useSync(), { wrapper: SyncProvider });

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(5);
      expect(result.current.failedCount).toBe(2);
      expect(result.current.syncedCount).toBe(10);
    });
  });

  it('exposes isSyncing state', () => {
    const { result } = renderHook(() => useSync(), { wrapper: SyncProvider });
    expect(result.current.isSyncing).toBe(false);
  });

  it('exposes lastSyncedAt as null initially', () => {
    const { result } = renderHook(() => useSync(), { wrapper: SyncProvider });
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

  it('performs sync when forceSync is called', async () => {
    (sync.syncPendingRecords as jest.Mock).mockResolvedValue({
      synced: ['record-1'],
      failed: []
    });

    const { result } = renderHook(() => useSync(), { wrapper: SyncProvider });

    await act(async () => {
      await result.current.forceSync();
    });

    expect(sync.syncPendingRecords).toHaveBeenCalledWith(1);
    expect(result.current.lastSyncedAt).not.toBeNull();
  });

  it('does not sync when offline', async () => {
    (Network.getNetworkStateAsync as jest.Mock).mockResolvedValue({ isConnected: false });

    const { result } = renderHook(() => useSync(), { wrapper: SyncProvider });

    await act(async () => {
      await result.current.forceSync();
    });

    expect(sync.syncPendingRecords).not.toHaveBeenCalled();
  });

  it('auto-syncs on interval', async () => {
    const { result } = renderHook(() => useSync(), { wrapper: SyncProvider });

    // First interval fires after 10s — doSync calls syncPendingRecords twice (initial + retry)
    await act(async () => {
      jest.advanceTimersByTime(10000);
    });

    await waitFor(() => {
      expect(sync.syncPendingRecords).toHaveBeenCalledTimes(2);
    });

    // Second interval fires after another 10s
    await act(async () => {
      jest.advanceTimersByTime(10000);
    });

    await waitFor(() => {
      expect(sync.syncPendingRecords).toHaveBeenCalledTimes(4);
    });
  });

  it('handles sync errors gracefully', async () => {
    (sync.syncPendingRecords as jest.Mock).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useSync(), { wrapper: SyncProvider });

    await act(async () => {
      await result.current.forceSync();
    });

    expect(result.current.isSyncing).toBe(false);
  });

  it('throws error when useSync is used outside provider', () => {
    expect(() => {
      renderHook(() => useSync());
    }).toThrow('useSync must be used within a SyncProvider');
  });
});

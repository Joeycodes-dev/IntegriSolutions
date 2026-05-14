import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import * as Network from 'expo-network';
import { getPendingCount, getFailedCount } from '../db/repository';
import { syncPendingRecords } from '../services/sync';

type SyncContextType = {
  pendingCount: number;
  failedCount: number;
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  forceSync: () => Promise<void>;
};

const SyncContext = createContext<SyncContextType | undefined>(undefined);

const SYNC_INTERVAL_MS = 30_000;

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const isSyncingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshCounts = useCallback(async () => {
    try {
      const pending = await getPendingCount();
      const failed = await getFailedCount();
      setPendingCount(pending);
      setFailedCount(failed);
    } catch {
      // DB not ready yet
    }
  }, []);

  const doSync = useCallback(async () => {
    if (isSyncingRef.current) return;

    let isOnline = false;
    try {
      const state = await Network.getNetworkStateAsync();
      isOnline = state.isConnected ?? false;
    } catch {
      // Assume online if we can't check
      isOnline = true;
    }

    if (!isOnline) return;

    isSyncingRef.current = true;
    setIsSyncing(true);

    try {
      const result = await syncPendingRecords();
      if (result.synced.length > 0) {
        setLastSyncedAt(new Date());
      }
      // Retry failed records that haven't hit the cap
      await syncPendingRecords();
    } catch {
      // Sync will be retried on next interval
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
      await refreshCounts();
    }
  }, [refreshCounts]);

  const forceSync = useCallback(async () => {
    await doSync();
  }, [doSync]);

  useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      doSync();
      refreshCounts();
    }, SYNC_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [doSync, refreshCounts]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        refreshCounts();
        doSync();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [refreshCounts, doSync]);

  return (
    <SyncContext.Provider value={{ pendingCount, failedCount, isSyncing, lastSyncedAt, forceSync }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
}
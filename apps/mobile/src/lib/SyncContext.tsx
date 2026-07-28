import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import * as Network from 'expo-network';
import {
  getPendingCount,
  getFailedCount,
  getSyncedCount,
  getTestCountBetween,
  getRecentTests,
  type LocalTestRecord
} from '../db/repository';
import { syncPendingRecords } from '../services/sync';
import { useAuth } from '../lib/AuthContext';

type SyncContextType = {
  pendingCount: number;
  failedCount: number;
  syncedCount: number;
  todayCount: number;
  weekCount: number;
  recentTests: LocalTestRecord[];
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  forceSync: () => Promise<void>;
  refreshCounts: () => Promise<void>;
};

const SyncContext = createContext<SyncContextType | undefined>(undefined);

const SYNC_INTERVAL_MS = 10_000;

function getTodayRange(now = new Date()): { start: string; end: string } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function getWeekRange(now = new Date()): { start: string; end: string } {
  const start = new Date(now);
  const day = start.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  start.setDate(start.getDate() - daysSinceMonday);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [syncedCount, setSyncedCount] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [weekCount, setWeekCount] = useState(0);
  const [recentTests, setRecentTests] = useState<LocalTestRecord[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const isSyncingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshCounts = useCallback(async () => {
    try {
      const officerId = profile?.officerId ?? null;
      const pending = await getPendingCount(officerId);
      const failed = await getFailedCount(officerId);
      const synced = await getSyncedCount(officerId);
      const todayRange = getTodayRange();
      const weekRange = getWeekRange();
      const today = await getTestCountBetween(todayRange.start, todayRange.end, officerId);
      const week = await getTestCountBetween(weekRange.start, weekRange.end, officerId);
      const recent = await getRecentTests(3, officerId);
      setPendingCount(pending);
      setFailedCount(failed);
      setSyncedCount(synced);
      setTodayCount(today);
      setWeekCount(week);
      setRecentTests(recent);
    } catch {
      // DB not ready yet
    }
  }, [profile?.officerId]);

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
      const officerId = profile?.officerId ?? null;
      const result = await syncPendingRecords(officerId);
      if (result.synced.length > 0) {
        setLastSyncedAt(new Date());
      }
      if (result.failed.length > 0) {
        console.warn('Sync: some records failed to sync');
        for (const f of result.failed) {
          console.warn(`  ${f.id}: ${f.error}`);
        }
      }
      // Retry failed records that haven't hit the cap
      await syncPendingRecords(officerId);
    } catch (error) {
      console.error('Sync error:', error);
      // Sync will be retried on next interval
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
      await refreshCounts();
    }
  }, [refreshCounts, profile?.officerId]);

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
    <SyncContext.Provider value={{ pendingCount, failedCount, syncedCount, todayCount, weekCount, recentTests, isSyncing, lastSyncedAt, forceSync, refreshCounts }}>
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

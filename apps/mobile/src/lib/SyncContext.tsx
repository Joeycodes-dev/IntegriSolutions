import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import * as Network from 'expo-network';
import {
  getPendingCount,
  getFailedCount,
  getSyncedCount,
  getTestCountBetween,
  getRecentTests,
  getAttachmentStatusCounts,
  getQueuedAlertAckCount,
  getNewestSyncedAt,
  resetFailedToPending,
  resetFailedAttachmentsToPending,
  retryFailedSyncRecord,
  resetAttachmentToPending,
  type LocalTestRecord
} from '../db/repository';
import {
  syncPendingRecordsInternal,
  syncPendingAlertAcksInternal,
  type SyncScope,
} from '../services/sync';
import { syncCoordinator } from './SyncCoordinator';
import { getRateLimitCooldownMs } from '../services/api';
import { useAuth } from '../lib/AuthContext';

export type SyncNetworkStatus = 'online' | 'offline' | 'unknown';
export type SyncRunStatus =
  | 'success'
  | 'partial'
  | 'deferred'
  | 'offline'
  | 'auth_required'
  | 'rate_limited'
  | 'error';

export type SyncRunSummary = {
  status: SyncRunStatus;
  message: string;
  startedAt: string;
  finishedAt: string;
  attempted: number;
  uploaded: number;
  duplicates: number;
  failed: number;
  deferred: number;
  evidenceUploaded: number;
  evidencePending: number;
  evidenceFailed: number;
  alertsSynced: number;
};

type SyncContextType = {
  pendingCount: number;
  failedCount: number;
  syncedCount: number;
  pendingEvidenceCount: number;
  failedEvidenceCount: number;
  syncedEvidenceCount: number;
  queuedAlertCount: number;
  todayCount: number;
  weekCount: number;
  recentTests: LocalTestRecord[];
  isSyncing: boolean;
  networkStatus: SyncNetworkStatus;
  lastSyncedAt: Date | null;
  lastAttemptAt: Date | null;
  lastRun: SyncRunSummary | null;
  databaseError: string | null;
  syncNow: () => Promise<SyncRunSummary>;
  retryFailed: () => Promise<SyncRunSummary>;
  retryRecord: (recordId: string) => Promise<SyncRunSummary>;
  retryEvidence: (attachmentId: string) => Promise<SyncRunSummary>;
  forceSync: () => Promise<SyncRunSummary>;
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

function summary(
  status: SyncRunStatus,
  message: string,
  startedAt: string,
  overrides: Partial<SyncRunSummary> = {}
): SyncRunSummary {
  return {
    status,
    message,
    startedAt,
    finishedAt: new Date().toISOString(),
    attempted: 0,
    uploaded: 0,
    duplicates: 0,
    failed: 0,
    deferred: 0,
    evidenceUploaded: 0,
    evidencePending: 0,
    evidenceFailed: 0,
    alertsSynced: 0,
    ...overrides,
  };
}

function isAuthErrorMessage(value: string | null | undefined): boolean {
  return /invalid or expired access token|session expired|sign in again|unauthorized/i.test(
    value ?? ''
  );
}

function isTransientErrorMessage(value: string): boolean {
  return /network error|failed to fetch|too many requests|rate limit|\bHTTP 5\d\d\b|service unavailable|unauthorized|session expired|access token/i.test(
    value
  );
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { profile, token } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [syncedCount, setSyncedCount] = useState(0);
  const [pendingEvidenceCount, setPendingEvidenceCount] = useState(0);
  const [failedEvidenceCount, setFailedEvidenceCount] = useState(0);
  const [syncedEvidenceCount, setSyncedEvidenceCount] = useState(0);
  const [queuedAlertCount, setQueuedAlertCount] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [weekCount, setWeekCount] = useState(0);
  const [recentTests, setRecentTests] = useState<LocalTestRecord[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [networkStatus, setNetworkStatus] = useState<SyncNetworkStatus>('unknown');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [lastAttemptAt, setLastAttemptAt] = useState<Date | null>(null);
  const [lastRun, setLastRun] = useState<SyncRunSummary | null>(null);
  const [databaseError, setDatabaseError] = useState<string | null>(null);
  const autoSyncQueuedRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshNetworkStatus = useCallback(async (): Promise<SyncNetworkStatus> => {
    try {
      const state = await Network.getNetworkStateAsync();
      const next =
        state.isConnected && state.isInternetReachable !== false
          ? 'online'
          : 'offline';
      setNetworkStatus(next);
      return next;
    } catch {
      setNetworkStatus('unknown');
      return 'unknown';
    }
  }, []);

  const refreshCounts = useCallback(async () => {
    try {
      const officerId = profile?.officerId ?? null;
      const todayRange = getTodayRange();
      const weekRange = getWeekRange();
      const [
        pending,
        failed,
        synced,
        evidence,
        alerts,
        today,
        week,
        recent,
        newestSyncedAt
      ] = await Promise.all([
        getPendingCount(officerId),
        getFailedCount(officerId),
        getSyncedCount(officerId),
        getAttachmentStatusCounts(officerId),
        getQueuedAlertAckCount(officerId),
        getTestCountBetween(todayRange.start, todayRange.end, officerId),
        getTestCountBetween(weekRange.start, weekRange.end, officerId),
        getRecentTests(3, officerId),
        getNewestSyncedAt(officerId)
      ]);
      setPendingCount(pending);
      setFailedCount(failed);
      setSyncedCount(synced);
      setPendingEvidenceCount(evidence.pending);
      setFailedEvidenceCount(evidence.failed);
      setSyncedEvidenceCount(evidence.synced);
      setQueuedAlertCount(alerts);
      setTodayCount(today);
      setWeekCount(week);
      setRecentTests(recent);
      setLastSyncedAt(newestSyncedAt);
      setDatabaseError(null);
    } catch (error) {
      setDatabaseError(error instanceof Error ? error.message : 'Local database unavailable');
    }
  }, [profile?.officerId]);

  const runSyncScope = useCallback(async (scope: SyncScope): Promise<SyncRunSummary> => {
    const startedAt = new Date().toISOString();
    const status = await refreshNetworkStatus();
    if (status === 'offline') {
      const result = summary(
        'offline',
        'Offline. Records remain safe on this device and sync resumes when connected.',
        startedAt,
      );
      setLastRun(result);
      await refreshCounts();
      return result;
    }
    if (!token) {
      const result = summary(
        'auth_required',
        'Sign in to upload queued records and evidence.',
        startedAt,
      );
      setLastRun(result);
      await refreshCounts();
      return result;
    }

    const cooldownMs = getRateLimitCooldownMs();
    if (cooldownMs > 0) {
      const seconds = Math.max(1, Math.ceil(cooldownMs / 1000));
      const result = summary(
        'rate_limited',
        `The server is limiting requests. Try again in about ${seconds}s.`,
        startedAt,
        { deferred: 1 },
      );
      setLastRun(result);
      await refreshCounts();
      return result;
    }

    setIsSyncing(true);
    setLastAttemptAt(new Date(startedAt));

    try {
      const officerId = profile?.officerId ?? null;
      const result = await syncPendingRecordsInternal(officerId, scope);
      const hasAuthFailure =
        isAuthErrorMessage(result.runError) ||
        result.failed.some((failure) => isAuthErrorMessage(failure.error)) ||
        result.attachmentResults.some((item) => isAuthErrorMessage(item.error));
      const shouldSyncAlerts = scope.kind === 'all' && !hasAuthFailure && getRateLimitCooldownMs() === 0;
      const alertResult = shouldSyncAlerts
        ? await syncPendingAlertAcksInternal(officerId)
        : { synced: [], failed: [], errors: [] };

      const evidenceUploaded = result.attachmentResults.filter((item) => item.status === 'synced').length;
      const evidencePending = result.attachmentResults.filter((item) => item.status === 'pending').length;
      const evidenceFailed = result.attachmentResults.filter((item) => item.status === 'failed').length;
      const alertDeferred = alertResult.errors.filter((item) =>
        isTransientErrorMessage(item.error)
      ).length;
      const alertFailed = Math.max(0, alertResult.failed.length - alertDeferred);
      const failed = result.failed.length + evidenceFailed + alertFailed;
      const deferred = result.deferred.length + evidencePending + alertDeferred;
      const runStatus: SyncRunStatus = hasAuthFailure
        ? 'auth_required'
        : failed > 0
          ? 'partial'
          : deferred > 0
            ? 'deferred'
            : 'success';
      const runMessage = hasAuthFailure
        ? 'Your session expired. Sign in again to continue syncing.'
        : failed > 0
          ? `${result.failed.length} record${result.failed.length === 1 ? '' : 's'}, ${evidenceFailed} evidence item${evidenceFailed === 1 ? '' : 's'}, and ${alertFailed} alert action${alertFailed === 1 ? '' : 's'} need attention.`
          : deferred > 0
            ? 'Some work is waiting for the network or server rate limit.'
            : scope.kind === 'selected'
              ? 'Selected sync item completed.'
              : result.attempted === 0 && evidenceUploaded === 0 && alertResult.synced.length === 0
                ? 'Everything on this device is up to date.'
                : `${result.synced.length} record${result.synced.length === 1 ? '' : 's'} and ${evidenceUploaded} evidence item${evidenceUploaded === 1 ? '' : 's'} uploaded.`;

      const run = summary(runStatus, runMessage, startedAt, {
        attempted: result.attempted,
        uploaded: result.synced.length,
        duplicates: result.duplicates.length,
        failed,
        deferred,
        evidenceUploaded,
        evidencePending,
        evidenceFailed,
        alertsSynced: alertResult.synced.length,
      });
      setLastRun(run);
      if (result.synced.length > 0 || evidenceUploaded > 0) setLastSyncedAt(new Date());
      return run;
    } catch (error) {
      const run = summary(
        'error',
        error instanceof Error ? error.message : 'Sync could not be completed.',
        startedAt,
      );
      setLastRun(run);
      return run;
    } finally {
      setIsSyncing(false);
      await refreshCounts();
    }
  }, [profile?.officerId, refreshCounts, refreshNetworkStatus, token]);

  const executeSync = useCallback(
    (scope: SyncScope = { kind: 'all' }) => syncCoordinator.run(() => runSyncScope(scope)),
    [runSyncScope],
  );

  const requestAutomaticSync = useCallback(() => {
    if (autoSyncQueuedRef.current) return;
    autoSyncQueuedRef.current = true;
    void executeSync().finally(() => {
      autoSyncQueuedRef.current = false;
    });
  }, [executeSync]);

  const syncNow = useCallback(() => executeSync(), [executeSync]);

  const retryFailed = useCallback(() => syncCoordinator.run(async () => {
    const officerId = profile?.officerId ?? null;
    await Promise.all([
      resetFailedToPending(officerId),
      resetFailedAttachmentsToPending(officerId),
    ]);
    await refreshCounts();
    return runSyncScope({ kind: 'all' });
  }), [profile?.officerId, refreshCounts, runSyncScope]);

  const retryRecord = useCallback((recordId: string) => syncCoordinator.run(async () => {
    await retryFailedSyncRecord(recordId, profile?.officerId ?? null);
    await refreshCounts();
    return runSyncScope({ kind: 'selected', recordIds: [recordId] });
  }), [profile?.officerId, refreshCounts, runSyncScope]);

  const retryEvidence = useCallback((attachmentId: string) => syncCoordinator.run(async () => {
    await resetAttachmentToPending(attachmentId, profile?.officerId ?? null);
    await refreshCounts();
    return runSyncScope({ kind: 'selected', attachmentIds: [attachmentId] });
  }), [profile?.officerId, refreshCounts, runSyncScope]);

  const forceSync = useCallback(() => syncNow(), [syncNow]);

  useEffect(() => {
    void refreshCounts();
    void refreshNetworkStatus();
  }, [refreshCounts, refreshNetworkStatus]);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      void requestAutomaticSync();
    }, SYNC_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [requestAutomaticSync]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        void refreshCounts();
        void requestAutomaticSync();
      }
    });
    return () => subscription.remove();
  }, [refreshCounts, requestAutomaticSync]);

  return (
    <SyncContext.Provider
      value={{
        pendingCount,
        failedCount,
        syncedCount,
        pendingEvidenceCount,
        failedEvidenceCount,
        syncedEvidenceCount,
        queuedAlertCount,
        todayCount,
        weekCount,
        recentTests,
        isSyncing,
        networkStatus,
        lastSyncedAt,
        lastAttemptAt,
        lastRun,
        databaseError,
        syncNow,
        retryFailed,
        retryRecord,
        retryEvidence,
        forceSync,
        refreshCounts
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) throw new Error('useSync must be used within a SyncProvider');
  return context;
}

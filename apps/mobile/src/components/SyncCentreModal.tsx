import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getAuditEventsByAction,
  getFailedSync,
  getPendingSync,
  getSyncEvidenceAttachments,
  type AuditEvent,
  type LocalTestRecord,
  type SyncEvidenceAttachment,
} from '../db/repository';
import { useSync, type SyncRunStatus } from '../lib/SyncContext';
import { useAuth } from '../lib/AuthContext';
import { evidenceCategoryLabel } from '../lib/evidenceCategories';

import { styles } from './SyncCentreModal.styles';
import { colors } from '../styles/colors';

type SyncCentreTab = 'overview' | 'records' | 'evidence' | 'activity';

type Props = {
  visible: boolean;
  onClose: () => void;
  onViewAudit?: () => void;
  onViewReports?: () => void;
  onSignIn?: () => void;
};

type Notice = {
  type: 'success' | 'error' | 'info';
  text: string;
};

const TABS: Array<{
  key: SyncCentreTab;
  label: string;
  icon: keyof typeof Feather.glyphMap;
}> = [
  { key: 'overview', label: 'Overview', icon: 'activity' },
  { key: 'records', label: 'Records', icon: 'file-text' },
  { key: 'evidence', label: 'Evidence', icon: 'image' },
  { key: 'activity', label: 'Activity', icon: 'clock' },
];

const QUEUE_DISPLAY_LIMIT = 100;

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

function redactDiagnosticText(value: string): string {
  return value
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\b(token|password|secret)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .replace(/\b\d{13}\b/g, '[redacted-id]')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[redacted-email]')
    .replace(/-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/g, '[redacted-location]')
    .slice(0, 500);
}

function formatTimestamp(value: string | Date | null | undefined): string {
  if (!value) return 'Not yet';
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Unknown time';
  return date.toLocaleString([], {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusVisual(input: {
  failedCount: number;
  pendingCount: number;
  isSyncing: boolean;
  networkStatus: 'online' | 'offline' | 'unknown';
  lastRunStatus: SyncRunStatus | null;
}): {
  label: string;
  detail: string;
  color: string;
  background: string;
} {
  if (input.isSyncing) {
    return {
      label: 'Syncing',
      detail: 'Uploading queued records and evidence…',
      color: colors.warning,
      background: 'rgba(245, 158, 11, 0.16)',
    };
  }
  if (input.networkStatus === 'offline') {
    return {
      label: 'Offline',
      detail: 'Records are safe on this device and will retry when connected.',
      color: colors.warning,
      background: 'rgba(245, 158, 11, 0.16)',
    };
  }
  if (input.lastRunStatus === 'auth_required') {
    return {
      label: 'Sign-in required',
      detail: 'Sign in before queued work can be uploaded.',
      color: colors.error,
      background: 'rgba(220, 38, 38, 0.14)',
    };
  }
  if (input.lastRunStatus === 'rate_limited' || input.lastRunStatus === 'deferred') {
    return {
      label: 'Temporarily waiting',
      detail: 'The queue is safe. Sync will try again automatically.',
      color: colors.warning,
      background: 'rgba(245, 158, 11, 0.16)',
    };
  }
  if (input.failedCount > 0) {
    return {
      label: 'Action required',
      detail: `${input.failedCount} item${input.failedCount === 1 ? '' : 's'} could not be uploaded.`,
      color: colors.error,
      background: 'rgba(220, 38, 38, 0.14)',
    };
  }
  if (input.pendingCount > 0) {
    return {
      label: 'Waiting to sync',
      detail: `${input.pendingCount} item${input.pendingCount === 1 ? '' : 's'} queued for upload.`,
      color: colors.warning,
      background: 'rgba(245, 158, 11, 0.16)',
    };
  }
  return {
    label: 'Up to date',
    detail: 'Local records and evidence have been accepted by the server.',
    color: colors.success,
    background: 'rgba(34, 197, 94, 0.16)',
  };
}

function friendlyError(message: string | null | undefined): {
  title: string;
  guidance: string;
} {
  const value = message?.trim() ?? '';
  if (!value) {
    return {
      title: 'No error detail saved',
      guidance: 'This item failed before detailed diagnostics were stored. Retry it or share the sync report for support.',
    };
  }
  if (/network error|failed to fetch|offline/i.test(value)) {
    return {
      title: 'Network unavailable',
      guidance: 'The item remains safe on this phone. Reconnect and retry.',
    };
  }
  if (/session expired|sign in|access token|unauthorized/i.test(value)) {
    return {
      title: 'Sign-in required',
      guidance: 'Sign in again, then retry this item.',
    };
  }
  if (/hash|tamper|integrity/i.test(value)) {
    return {
      title: 'Integrity check failed',
      guidance: 'Do not edit or delete this record. Keep it on the device and contact support.',
    };
  }
  if (/\bHTTP 5\d\d\b|internal server error|service unavailable|bad gateway|gateway timeout/i.test(value)) {
    return {
      title: 'Server temporarily unavailable',
      guidance: 'The item remains queued. The app will retry automatically.',
    };
  }
  if (/rate|too many|try again|\bHTTP 429\b/i.test(value)) {
    return {
      title: 'Server is busy',
      guidance: 'This is temporary. Wait briefly and retry.',
    };
  }
  if (/database|column|schema|insert/i.test(value)) {
    return {
      title: 'Server rejected the record',
      guidance: 'The server could not store this item. Share diagnostics with support.',
    };
  }
  return {
    title: 'Upload was rejected',
    guidance: 'Review the reported reason below, then retry or share diagnostics.',
  };
}

function MetricCard({
  label,
  value,
  tone = 'neutral',
  icon,
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'success' | 'warning' | 'error';
  icon: keyof typeof Feather.glyphMap;
}) {
  const toneStyle =
    tone === 'success'
      ? styles.metricSuccess
      : tone === 'warning'
        ? styles.metricWarning
        : tone === 'error'
          ? styles.metricError
          : null;
  return (
    <View style={[styles.metricCard, toneStyle]}>
      <View style={styles.metricIcon}>
        <Feather name={icon} size={17} color={colors.primaryDark} />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function noticeTypeForRun(status: SyncRunStatus): Notice['type'] {
  if (status === 'success') return 'success';
  if (status === 'error' || status === 'auth_required') return 'error';
  return 'info';
}

function EmptyState({
  icon,
  title,
  detail,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  detail: string;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Feather name={icon} size={24} color={colors.primaryDark} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDetail}>{detail}</Text>
    </View>
  );
}

export function SyncCentreModal({
  visible,
  onClose,
  onViewAudit,
  onViewReports,
  onSignIn,
}: Props) {
  const { profile } = useAuth();
  const {
    pendingCount,
    failedCount,
    syncedCount,
    pendingEvidenceCount,
    failedEvidenceCount,
    syncedEvidenceCount,
    queuedAlertCount,
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
    refreshCounts,
  } = useSync();
  const [activeTab, setActiveTab] = useState<SyncCentreTab>('overview');
  const [records, setRecords] = useState<LocalTestRecord[]>([]);
  const [evidence, setEvidence] = useState<SyncEvidenceAttachment[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const loadRequestRef = useRef(0);

  const attentionCount = failedCount + failedEvidenceCount;
  const queuedCount = pendingCount + pendingEvidenceCount;
  const status = useMemo(
    () => statusVisual({
      failedCount: attentionCount,
      pendingCount: queuedCount,
      isSyncing,
      networkStatus,
      lastRunStatus: lastRun?.status ?? null,
    }),
    [attentionCount, queuedCount, isSyncing, networkStatus, lastRun?.status],
  );

  const loadDetails = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setIsLoadingDetails(true);
    try {
      const officerId = profile?.officerId ?? null;
      const [failedRecords, pendingRecords, queuedEvidence, syncEvents, alertEvents] = await Promise.all([
        getFailedSync(officerId),
        getPendingSync(officerId),
        getSyncEvidenceAttachments(officerId),
        getAuditEventsByAction('sync', 50),
        getAuditEventsByAction('alert.acknowledged', 20),
      ]);
      if (requestId !== loadRequestRef.current) return;
      setRecords([...failedRecords, ...pendingRecords]);
      setEvidence(queuedEvidence);
      setAuditEvents(
        [...syncEvents, ...alertEvents]
          .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
          .slice(0, 50)
      );
      await refreshCounts();
    } catch (error) {
      if (requestId !== loadRequestRef.current) return;
      setNotice({
        type: 'error',
        text: error instanceof Error ? error.message : 'Could not load local sync details.',
      });
    } finally {
      if (requestId === loadRequestRef.current) setIsLoadingDetails(false);
    }
  }, [profile?.officerId, refreshCounts]);

  useEffect(() => {
    if (!visible) {
      loadRequestRef.current += 1;
      return;
    }
    setActiveTab('overview');
    setNotice(null);
  }, [visible]);

  useEffect(() => {
    if (!visible || isSyncing) return;
    void loadDetails();
  }, [
    visible,
    isSyncing,
    pendingCount,
    failedCount,
    pendingEvidenceCount,
    failedEvidenceCount,
    lastRun?.finishedAt,
    loadDetails,
  ]);

  const handleSyncNow = async () => {
    setNotice(null);
    try {
      const result = await syncNow();
      await loadDetails();
      setNotice({ type: noticeTypeForRun(result.status), text: result.message });
    } catch (error) {
      setNotice({
        type: 'error',
        text: error instanceof Error ? error.message : 'Sync could not be completed.',
      });
    }
  };

  const handleRetryAll = () => {
    Alert.alert(
      'Retry all failed items?',
      'Failed record and evidence retry counters will be reset. The immutable local records will not be changed or deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Retry all',
          onPress: () => {
            setBusyItemId('all');
            void (async () => {
              try {
                const result = await retryFailed();
                await loadDetails();
                setNotice({ type: noticeTypeForRun(result.status), text: result.message });
              } catch (error) {
                setNotice({
                  type: 'error',
                  text: error instanceof Error ? error.message : 'Failed items could not be retried.',
                });
              } finally {
                setBusyItemId(null);
              }
            })();
          },
        },
      ],
    );
  };

  const handleRetryRecord = async (record: LocalTestRecord) => {
    setBusyItemId(record.id);
    setNotice(null);
    try {
      const result = await retryRecord(record.id);
      await loadDetails();
      setNotice({ type: noticeTypeForRun(result.status), text: result.message });
    } catch (error) {
      setNotice({
        type: 'error',
        text: error instanceof Error ? error.message : 'This record could not be retried.',
      });
    } finally {
      setBusyItemId(null);
    }
  };

  const handleRetryEvidence = async (attachment: SyncEvidenceAttachment) => {
    if (attachment.parentSyncStatus !== 'synced') {
      setNotice({
        type: 'info',
        text: 'The parent record must sync before this evidence can be uploaded.',
      });
      return;
    }
    setBusyItemId(attachment.id);
    setNotice(null);
    try {
      const result = await retryEvidence(attachment.id);
      await loadDetails();
      setNotice({ type: noticeTypeForRun(result.status), text: result.message });
    } catch (error) {
      setNotice({
        type: 'error',
        text: error instanceof Error ? error.message : 'This evidence item could not be retried.',
      });
    } finally {
      setBusyItemId(null);
    }
  };

  const handleShareDiagnostics = async () => {
    const lines = [
      'IntegriScan sync diagnostics',
      `Generated: ${new Date().toISOString()}`,
      `Network: ${networkStatus}`,
      `Records: ${syncedCount} synced, ${pendingCount} pending, ${failedCount} failed`,
      `Evidence: ${syncedEvidenceCount} synced, ${pendingEvidenceCount} pending, ${failedEvidenceCount} failed`,
      `Queued alert acknowledgements: ${queuedAlertCount}`,
      `Last successful local acceptance: ${formatTimestamp(lastSyncedAt)}`,
      `Last attempt: ${formatTimestamp(lastAttemptAt)}`,
      '',
      'Recent sync activity:',
      ...auditEvents.slice(0, 10).map((event) => `${event.occurredAt} — ${redactDiagnosticText(event.message)}`),
    ];
    if (records.some((record) => record.lastError)) {
      lines.push('', 'Failed record details:');
      for (const record of records.filter((item) => item.lastError).slice(0, 20)) {
        lines.push(`${shortId(record.id)}${record.receiptNumber ? ` · local receipt ${record.receiptNumber}` : ''} — ${redactDiagnosticText(record.lastError ?? '')}`);
      }
    }
    if (evidence.some((item) => item.lastError)) {
      lines.push('', 'Failed evidence details:');
      for (const item of evidence.filter((entry) => entry.lastError).slice(0, 20)) {
        lines.push(
          `${shortId(item.id)} (${evidenceCategoryLabel(item.category)}) — ${redactDiagnosticText(item.lastError ?? '')}`
        );
      }
    }
    try {
      await Share.share({ title: 'IntegriScan sync diagnostics', message: lines.join('\n') });
    } catch (error) {
      setNotice({
        type: 'error',
        text: error instanceof Error ? error.message : 'Could not share sync diagnostics.',
      });
    }
  };

  const renderNotice = () => {
    if (databaseError) {
      return (
        <View style={[styles.notice, styles.noticeError]} accessibilityRole="alert">
          <Feather name="alert-triangle" size={18} color={colors.errorText} />
          <Text style={styles.noticeText}>Local data could not be read: {databaseError}</Text>
        </View>
      );
    }
    if (!notice) return null;
    return (
      <View
        style={[
          styles.notice,
          notice.type === 'error'
            ? styles.noticeError
            : notice.type === 'success'
              ? styles.noticeSuccess
              : styles.noticeInfo,
        ]}
        accessibilityLiveRegion="polite"
      >
        <Feather
          name={notice.type === 'success' ? 'check-circle' : notice.type === 'error' ? 'alert-circle' : 'info'}
          size={18}
          color={notice.type === 'success' ? colors.successText : notice.type === 'error' ? colors.errorText : colors.primaryDark}
        />
        <Text style={styles.noticeText}>{notice.text}</Text>
      </View>
    );
  };

  const renderOverview = () => (
    <>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Records</Text>
        <Text style={styles.sectionDescription}>Test records stored on this phone.</Text>
        <View style={styles.metricGrid}>
          <MetricCard label="Synced" value={syncedCount} tone="success" icon="check-circle" />
          <MetricCard label="Pending" value={pendingCount} tone={pendingCount > 0 ? 'warning' : 'neutral'} icon="clock" />
          <MetricCard label="Failed" value={failedCount} tone={failedCount > 0 ? 'error' : 'neutral'} icon="x-circle" />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Evidence</Text>
        <Text style={styles.sectionDescription}>Photos are uploaded after their parent record is accepted.</Text>
        <View style={styles.metricGrid}>
          <MetricCard label="Synced" value={syncedEvidenceCount} tone="success" icon="check-circle" />
          <MetricCard label="Pending" value={pendingEvidenceCount} tone={pendingEvidenceCount > 0 ? 'warning' : 'neutral'} icon="clock" />
          <MetricCard label="Failed" value={failedEvidenceCount} tone={failedEvidenceCount > 0 ? 'error' : 'neutral'} icon="x-circle" />
        </View>
      </View>

      <View style={styles.actionCard}>
        <View style={styles.actionCardHeader}>
          <View style={styles.actionCardIcon}>
            <Feather name="zap" size={20} color={colors.primaryDark} />
          </View>
          <View style={styles.actionCardText}>
            <Text style={styles.actionCardTitle}>Sync now</Text>
            <Text style={styles.actionCardDetail}>
              Uploads pending work without changing or deleting failed records.
            </Text>
          </View>
        </View>
        {lastRun?.status === 'auth_required' && onSignIn ? (
          <Pressable
            style={styles.primaryButton}
            onPress={onSignIn}
            accessibilityRole="button"
            accessibilityLabel="Sign in again to resume syncing"
          >
            <Feather name="log-in" size={17} color={colors.background} />
            <Text style={styles.primaryButtonText}>Sign in again to resume syncing</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.primaryButton, (isSyncing || networkStatus === 'offline') && styles.buttonDisabled]}
            onPress={() => void handleSyncNow()}
            disabled={isSyncing || networkStatus === 'offline'}
            accessibilityRole="button"
            accessibilityState={{ busy: isSyncing, disabled: networkStatus === 'offline' }}
          >
            {isSyncing ? (
              <ActivityIndicator size="small" color={colors.background} />
            ) : (
              <Feather name="refresh-cw" size={17} color={colors.background} />
            )}
            <Text style={styles.primaryButtonText}>
              {isSyncing ? 'Syncing…' : networkStatus === 'offline' ? 'Offline — waiting' : 'Sync pending work'}
            </Text>
          </Pressable>
        )}
        {attentionCount > 0 && lastRun?.status !== 'auth_required' ? (
          <Pressable
            style={[styles.secondaryButton, busyItemId === 'all' && styles.buttonDisabled]}
            onPress={handleRetryAll}
            disabled={busyItemId === 'all'}
            accessibilityRole="button"
          >
            <Feather name="rotate-cw" size={16} color={colors.primaryDark} />
            <Text style={styles.secondaryButtonText}>Retry all failed items</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Automatic sync</Text>
        <Text style={styles.sectionDescription}>Runs every 10 seconds while IntegriScan is active.</Text>
        <View style={styles.infoList}>
          {[
            ['cloud', networkStatus === 'online' ? 'Network available' : networkStatus === 'offline' ? 'Waiting for network' : 'Network status unknown'],
            ['shield', queuedAlertCount > 0 ? `${queuedAlertCount} alert acknowledgement${queuedAlertCount === 1 ? '' : 's'} queued` : 'No queued alert actions'],
            ['clock', `Last attempt: ${formatTimestamp(lastAttemptAt)}`],
          ].map(([icon, label]) => (
            <View key={label} style={styles.infoRow}>
              <Feather name={icon as keyof typeof Feather.glyphMap} size={16} color={colors.primaryDark} />
              <Text style={styles.infoText}>{label}</Text>
            </View>
          ))}
        </View>
      </View>
    </>
  );

  const renderRecords = () => (
    <>
      {renderNotice()}
      {records.length === 0 ? (
        <EmptyState
          icon="check-circle"
          title="No record issues"
          detail="Pending records will appear here while they wait for upload."
        />
      ) : (
        <>
          {records.length > QUEUE_DISPLAY_LIMIT ? (
            <View style={[styles.notice, styles.noticeInfo]}>
              <Feather name="info" size={18} color={colors.primaryDark} />
              <Text style={styles.noticeText}>
                Showing the first {QUEUE_DISPLAY_LIMIT} queued records. All {records.length} remain safely stored on this phone.
              </Text>
            </View>
          ) : null}
          {records.slice(0, QUEUE_DISPLAY_LIMIT).map((record) => {
        const error = friendlyError(record.lastError);
        const failed = record.syncStatus === 'failed';
        return (
          <View key={record.id} style={[styles.queueCard, failed && styles.queueCardError]}>
            <View style={styles.queueHeader}>
              <View style={[styles.queueIcon, failed && styles.queueIconError]}>
                <Feather name={failed ? 'x-circle' : 'clock'} size={18} color={failed ? colors.errorText : colors.primaryDark} />
              </View>
              <View style={styles.queueText}>
                <Text style={styles.queueTitle}>Test {shortId(record.id)}</Text>
                <Text style={styles.queueMeta}>
                  {record.result.toUpperCase()} · {record.bacReading.toFixed(3)} g/100ml · {formatTimestamp(record.createdAt)}
                </Text>
                {record.receiptNumber ? (
                  <Text style={styles.queueMeta}>Local receipt {record.receiptNumber}</Text>
                ) : null}
              </View>
              <View style={[styles.statusPill, failed ? styles.statusPillError : styles.statusPillPending]}>
                <Text style={[styles.statusPillText, failed ? styles.statusPillTextError : styles.statusPillTextPending]}>
                  {failed ? 'FAILED' : 'PENDING'}
                </Text>
              </View>
            </View>
            <View style={styles.attemptRow}>
              <Text style={styles.attemptText}>{record.retryCount} attempt{record.retryCount === 1 ? '' : 's'}</Text>
              <Text style={styles.attemptText}>Last tried {formatTimestamp(record.lastAttemptAt)}</Text>
            </View>
            <View style={[styles.errorBox, failed ? styles.errorBoxError : styles.errorBoxInfo]}>
              <Text style={styles.errorTitle}>{error.title}</Text>
              <Text style={styles.errorDetail}>{error.guidance}</Text>
              {record.lastError ? <Text style={styles.serverMessage}>Reported: {record.lastError}</Text> : null}
            </View>
            {failed ? (
              <Pressable
                style={[styles.secondaryButton, busyItemId !== null && styles.buttonDisabled]}
                onPress={() => void handleRetryRecord(record)}
                disabled={busyItemId !== null}
                accessibilityRole="button"
                accessibilityLabel={`Retry test ${shortId(record.id)}`}
              >
                {busyItemId === record.id ? (
                  <ActivityIndicator size="small" color={colors.primaryDark} />
                ) : (
                  <Feather name="refresh-cw" size={16} color={colors.primaryDark} />
                )}
                <Text style={styles.secondaryButtonText}>Retry this record</Text>
              </Pressable>
            ) : null}
          </View>
        );
          })}
        </>
      )}
      <View style={styles.safetyNote}>
        <Feather name="shield" size={17} color={colors.primaryDark} />
        <Text style={styles.safetyText}>Test records are immutable. This screen never edits or deletes roadside evidence.</Text>
      </View>
    </>
  );

  const renderEvidence = () => (
    <>
      {renderNotice()}
      {evidence.length === 0 ? (
        <EmptyState
          icon="image"
          title="No evidence waiting"
          detail="Uploaded and failed evidence items will appear here."
        />
      ) : (
        <>
          {evidence.length > QUEUE_DISPLAY_LIMIT ? (
            <View style={[styles.notice, styles.noticeInfo]}>
              <Feather name="info" size={18} color={colors.primaryDark} />
              <Text style={styles.noticeText}>
                Showing the first {QUEUE_DISPLAY_LIMIT} queued evidence items. All {evidence.length} remain safely stored on this phone.
              </Text>
            </View>
          ) : null}
          {evidence.slice(0, QUEUE_DISPLAY_LIMIT).map((attachment) => {
        const error = friendlyError(attachment.lastError);
        const failed = attachment.syncStatus === 'failed';
        const parentReady = attachment.parentSyncStatus === 'synced';
        return (
          <View key={attachment.id} style={[styles.queueCard, failed && styles.queueCardError]}>
            <View style={styles.queueHeader}>
              <View style={[styles.queueIcon, failed && styles.queueIconError]}>
                <Feather name="image" size={18} color={failed ? colors.errorText : colors.primaryDark} />
              </View>
              <View style={styles.queueText}>
                <Text style={styles.queueTitle}>{evidenceCategoryLabel(attachment.category)}</Text>
                <Text style={styles.queueMeta}>Record {shortId(attachment.testId)} · {formatTimestamp(attachment.createdAt)}</Text>
              </View>
              <View style={[styles.statusPill, failed ? styles.statusPillError : styles.statusPillPending]}>
                <Text style={[styles.statusPillText, failed ? styles.statusPillTextError : styles.statusPillTextPending]}>
                  {failed ? 'FAILED' : 'PENDING'}
                </Text>
              </View>
            </View>
            <View style={styles.attemptRow}>
              <Text style={styles.attemptText}>{attachment.retryCount} attempt{attachment.retryCount === 1 ? '' : 's'}</Text>
              <Text style={styles.attemptText}>Parent: {attachment.parentSyncStatus.replace('_', ' ')}</Text>
            </View>
            <View style={[styles.errorBox, failed ? styles.errorBoxError : styles.errorBoxInfo]}>
              <Text style={styles.errorTitle}>{parentReady ? error.title : 'Waiting for parent record'}</Text>
              <Text style={styles.errorDetail}>
                {parentReady ? error.guidance : 'The evidence cannot upload until its test record is accepted by the server.'}
              </Text>
              {attachment.lastError ? <Text style={styles.serverMessage}>Reported: {attachment.lastError}</Text> : null}
            </View>
            {failed ? (
              <Pressable
                style={[styles.secondaryButton, (!parentReady || busyItemId !== null) && styles.buttonDisabled]}
                onPress={() => void handleRetryEvidence(attachment)}
                disabled={!parentReady || busyItemId !== null}
                accessibilityRole="button"
                accessibilityLabel={`Retry ${evidenceCategoryLabel(attachment.category)}`}
              >
                <Feather name="refresh-cw" size={16} color={colors.primaryDark} />
                <Text style={styles.secondaryButtonText}>{parentReady ? 'Retry this evidence' : 'Record must sync first'}</Text>
              </Pressable>
            ) : null}
          </View>
        );
          })}
        </>
      )}
    </>
  );

  const renderActivity = () => (
    <>
      <View style={styles.actionCard}>
        <View style={styles.actionCardHeader}>
          <View style={styles.actionCardIcon}>
            <Feather name="share" size={20} color={colors.primaryDark} />
          </View>
          <View style={styles.actionCardText}>
            <Text style={styles.actionCardTitle}>Share diagnostics</Text>
            <Text style={styles.actionCardDetail}>Creates a redacted support report without driver details, GPS, notes, tokens, or photos.</Text>
          </View>
        </View>
        <Pressable style={styles.secondaryButton} onPress={() => void handleShareDiagnostics()} accessibilityRole="button">
          <Feather name="share" size={16} color={colors.primaryDark} />
          <Text style={styles.secondaryButtonText}>Share sync report</Text>
        </Pressable>
        {onViewAudit ? (
          <Pressable style={styles.textButton} onPress={onViewAudit} accessibilityRole="button">
            <Text style={styles.textButtonText}>View full device audit</Text>
            <Feather name="chevron-right" size={16} color={colors.primaryDark} />
          </Pressable>
        ) : null}
      </View>
      {auditEvents.length === 0 ? (
        <EmptyState icon="clock" title="No sync activity yet" detail="Sync attempts and outcomes will appear here." />
      ) : auditEvents.map((event) => (
        <View key={event.id} style={styles.activityRow}>
          <View style={[styles.activityDot, event.outcome === 'failure' && styles.activityDotError]} />
          <View style={styles.activityText}>
            <Text style={styles.activityTitle}>{event.message}</Text>
            <Text style={styles.activityMeta}>{formatTimestamp(event.occurredAt)} · {event.severity}</Text>
          </View>
        </View>
      ))}
      <View style={styles.safetyNote}>
        <Feather name="info" size={17} color={colors.primaryDark} />
        <Text style={styles.safetyText}>This is the audit history stored on this device, not the central server audit log.</Text>
      </View>
    </>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <View style={styles.headerLeading}>
                <View style={styles.headerIcon}>
                  <Feather name="cloud" size={22} color={colors.background} />
                </View>
                <View style={styles.headerText}>
                  <Text style={styles.headerEyebrow}>RECORD TRANSFER</Text>
                  <Text style={styles.headerTitle}>Sync centre</Text>
                </View>
              </View>
              <Pressable
                style={styles.closeButton}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close sync centre"
              >
                <Feather name="x" size={22} color={colors.background} />
              </Pressable>
            </View>

            <View style={[styles.statusHero, { borderColor: status.color }]}>
              <View style={styles.statusHeroTop}>
                <View style={styles.statusHeroIcon}>
                  <Feather
                    name={isSyncing ? 'refresh-cw' : attentionCount > 0 ? 'alert-triangle' : 'cloud'}
                    size={22}
                    color={status.color}
                  />
                </View>
                <View style={styles.statusHeroText}>
                  <Text style={styles.statusHeroTitle}>{status.label}</Text>
                  <Text style={styles.statusHeroDetail}>{status.detail}</Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: status.background }]}>
                  <View style={[styles.statusDot, { backgroundColor: status.color }]} />
                  <Text style={[styles.statusPillText, { color: status.color }]}>{isSyncing ? 'BUSY' : status.label.toUpperCase()}</Text>
                </View>
              </View>
              <View style={styles.statusMetaRow}>
                <View style={styles.statusMetaItem}>
                  <Text style={styles.statusMetaLabel}>LAST SUCCESS</Text>
                  <Text style={styles.statusMetaValue}>{formatTimestamp(lastSyncedAt)}</Text>
                </View>
                <View style={styles.statusMetaItem}>
                  <Text style={styles.statusMetaLabel}>LAST ATTEMPT</Text>
                  <Text style={styles.statusMetaValue}>{formatTimestamp(lastAttemptAt)}</Text>
                </View>
                <View style={styles.statusMetaItem}>
                  <Text style={styles.statusMetaLabel}>NETWORK</Text>
                  <Text style={styles.statusMetaValue}>{networkStatus.toUpperCase()}</Text>
                </View>
              </View>
            </View>

            {lastRun && activeTab === 'overview' ? (
              <View style={styles.lastRunBanner}>
                <Feather
                  name={lastRun.status === 'success' ? 'check-circle' : 'info'}
                  size={17}
                  color={lastRun.status === 'success' ? colors.successText : colors.primaryDark}
                />
                <Text style={styles.lastRunText}>{lastRun.message}</Text>
              </View>
            ) : null}

            <View style={styles.tabBar}>
              {TABS.map((tab) => {
                const active = activeTab === tab.key;
                const count =
                  tab.key === 'records'
                    ? failedCount + pendingCount
                    : tab.key === 'evidence'
                      ? failedEvidenceCount + pendingEvidenceCount
                      : 0;
                return (
                  <Pressable
                    key={tab.key}
                    style={[styles.tabButton, active && styles.tabButtonActive]}
                    onPress={() => setActiveTab(tab.key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${tab.label} sync tab`}
                  >
                    <View style={styles.tabIconWrap}>
                      <Feather name={tab.icon} size={16} color={active ? colors.primaryDark : colors.textSecondary} />
                      {count > 0 ? (
                        <View style={styles.tabBadge}>
                          <Text style={styles.tabBadgeText}>{count > 99 ? '99+' : count}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {isLoadingDetails && records.length === 0 && evidence.length === 0 ? (
                <View style={styles.loadingState}>
                  <ActivityIndicator color={colors.primaryDark} />
                  <Text style={styles.loadingText}>Reading local sync queue…</Text>
                </View>
              ) : (
                <>
                  {activeTab === 'overview' ? renderOverview() : null}
                  {activeTab === 'records' ? renderRecords() : null}
                  {activeTab === 'evidence' ? renderEvidence() : null}
                  {activeTab === 'activity' ? renderActivity() : null}
                </>
              )}
            </ScrollView>

            {onViewReports && records.length > 0 ? (
              <View style={styles.footer}>
                <Pressable style={styles.textButton} onPress={onViewReports} accessibilityRole="button">
                  <Feather name="file-text" size={16} color={colors.primaryDark} />
                  <Text style={styles.textButtonText}>Open Reports</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

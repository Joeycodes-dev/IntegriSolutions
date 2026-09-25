import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { OperationalAlert, UserProfile } from '../types';

import { styles } from './OfficerHome.styles';
import { colors } from '../styles/colors';
import { formatApproxDistance } from '../lib/geoDistance';
import { alertPriorityStyle } from '../lib/alertPriorityStyle';
import type { ActiveTestDraftPayload } from '../lib/activeTestDraft';

interface Props {
  profile: UserProfile;
  pendingCount: number;
  pendingEvidenceCount: number;
  failedCount: number;
  failedEvidenceCount: number;
  syncedCount: number;
  todayCount: number;
  weekCount: number;
  recentStops: RecentStop[];
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  initialDuty?: DutyStatus;
  onDutyChange?: (next: DutyStatus) => void;
  onStartSession: () => void;
  onOpenRoadOffence: () => void;
  onForceSync: () => void;
  onOpenReports: () => void;
  onOpenAudit: () => void;
  /** Single most urgent alert to feature prominently, or null when nothing
   * currently needs attention. See lib/homeAlertsSummary.ts. */
  featuredAlert?: OperationalAlert | null;
  /** Count of other eligible (unacknowledged, active, unexpired) alerts not
   * shown as the banner — rendered as a compact summary only. */
  otherAlertsCount?: number;
  /** Whether the officer's last-known position falls inside featuredAlert's
   * trigger radius. See lib/homeAlertsSummary.ts. */
  featuredAlertIsNearby?: boolean;
  /** Approximate distance in metres to featuredAlert, or null if unavailable. */
  featuredAlertDistanceMeters?: number | null;
  onAcknowledgeAlert?: (alertId: string) => Promise<void> | void;
  onViewAlerts?: () => void;
  recoverableDraft?: ActiveTestDraftPayload | null;
  draftRecoveryIssue?: { message: string; updatedAt: string } | null;
  onResumeDraft?: () => void;
  onDiscardDraft?: () => void;
}

type DutyStatus = 'on' | 'off' | 'break';

const DUTY_CYCLE: Record<DutyStatus, DutyStatus> = { on: 'break', break: 'off', off: 'on' };

interface RecentStop {
  id: string;
  time: string;
  name: string;
  license: string;
  bac: string;
  result: 'PASS' | 'FAIL';
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Working late';
}

function formatLastSync(d: Date | null): string {
  if (!d) return 'Not synced yet';

  return d.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDraftUpdatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function alertProvenanceLabel(alert: OperationalAlert): string {
  if (alert.sourceType === 'external') {
    return `External — ${alert.sourceAuthority ?? 'Unknown authority'}`;
  }
  return 'Internal';
}

function formatAlertExpiry(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString([], {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function OfficerHome({
  profile,
  pendingCount,
  pendingEvidenceCount,
  failedCount,
  failedEvidenceCount,
  syncedCount,
  todayCount,
  weekCount,
  recentStops,
  isSyncing,
  lastSyncedAt,
  initialDuty = 'on',
  onDutyChange,
  onStartSession,
  onOpenRoadOffence,
  onForceSync,
  onOpenReports,
  onOpenAudit,
  featuredAlert = null,
  otherAlertsCount = 0,
  featuredAlertIsNearby = false,
  featuredAlertDistanceMeters = null,
  onAcknowledgeAlert,
  onViewAlerts,
  recoverableDraft = null,
  draftRecoveryIssue = null,
  onResumeDraft,
  onDiscardDraft
}: Props) {
  const [acknowledging, setAcknowledging] = useState(false);

  const handleAcknowledge = async () => {
    if (!featuredAlert || !onAcknowledgeAlert) return;
    setAcknowledging(true);
    try {
      await onAcknowledgeAlert(featuredAlert.id);
    } finally {
      setAcknowledging(false);
    }
  };
  const [duty, setDuty] = useState<DutyStatus>(initialDuty);

  const pendingSyncCount = pendingCount + pendingEvidenceCount;
  const failedSyncCount = failedCount + failedEvidenceCount;

  const todayStats = useMemo(() => {
    return {
      today: todayCount,
      week: weekCount,
      pending: pendingCount
    };
  }, [pendingCount, todayCount, weekCount]);

  const dutyMeta = {
    on: { label: 'On Duty', color: colors.successText, bg: colors.successBackground, dot: colors.success },
    off: { label: 'Off Duty', color: colors.textSecondary, bg: colors.surfaceHighlight, dot: colors.neutralGray },
    break: { label: 'On Break', color: colors.warning, bg: colors.errorBackground, dot: colors.warning }
  }[duty];

  const initials = `${profile.name?.[0] ?? ''}${profile.surname?.[0] ?? ''}`.toUpperCase() || 'OF';

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <View style={styles.heroOrbA} />
        <View style={styles.heroOrbB} />

        <View style={styles.heroTop}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Pressable
            style={[styles.dutyPill, { backgroundColor: dutyMeta.bg }]}
            onPress={() => {
              const next = DUTY_CYCLE[duty];
              setDuty(next);
              onDutyChange?.(next);
            }}
          >
            <View style={[styles.dutyDot, { backgroundColor: dutyMeta.dot }]} />
            <Text style={[styles.dutyText, { color: dutyMeta.color }]}>{dutyMeta.label}</Text>
            <Feather name="chevron-down" size={12} color={dutyMeta.color} />
          </Pressable>
        </View>

        <Text style={styles.greeting}>{greeting()},</Text>
        <Text style={styles.heroName}>{profile.name}</Text>
        <View style={styles.heroMetaRow}>
          <View style={styles.heroMetaItem}>
            <Feather name="shield" size={12} color="rgba(255,255,255,0.7)" />
            <Text style={styles.heroMetaText}>Badge {profile.badgeNumber}</Text>
          </View>
          <View style={styles.heroMetaItem}>
            <Feather name="map-pin" size={12} color="rgba(255,255,255,0.7)" />
            <Text style={styles.heroMetaText}>{profile.province || 'Unknown province'}</Text>
          </View>
        </View>
      </View>

      {(recoverableDraft || draftRecoveryIssue) && (
        <View style={styles.recoveryCard}>
          <View style={styles.recoveryIconWrap}>
            <Feather
              name={draftRecoveryIssue ? 'alert-triangle' : 'rotate-ccw'}
              size={19}
              color={draftRecoveryIssue ? colors.error : colors.primaryDark}
            />
          </View>
          <View style={styles.recoveryBody}>
            <Text style={styles.recoveryEyebrow}>UNFINISHED TEST</Text>
            <Text style={styles.recoveryTitle}>
              {draftRecoveryIssue ? 'Saved test needs attention' : 'Resume current test'}
            </Text>
            <Text style={styles.recoveryDescription} numberOfLines={2}>
              {draftRecoveryIssue
                ? draftRecoveryIssue.message
                : `${recoverableDraft?.scannedData
                    ? `${recoverableDraft.scannedData.name} ${recoverableDraft.scannedData.surname}`
                    : 'Identity not captured yet'} · ${recoverableDraft?.step === 'reading' ? 'Reading' : 'Licence scan'} · Updated ${formatDraftUpdatedAt(recoverableDraft?.updatedAt ?? '')}`}
            </Text>
            {recoverableDraft ? (
              <Text style={styles.recoveryMeta}>
                {recoverableDraft.officerNotes.trim() ? 'Notes saved' : 'No notes'} · {recoverableDraft.attachments.length} attachment{recoverableDraft.attachments.length === 1 ? '' : 's'} · {recoverableDraft.bacReading ? 'BAC saved' : 'Awaiting BAC'}
              </Text>
            ) : null}
            <View style={styles.recoveryActions}>
              {recoverableDraft && onResumeDraft ? (
                <Pressable
                  style={styles.recoveryPrimaryButton}
                  onPress={onResumeDraft}
                  accessibilityRole="button"
                  accessibilityLabel="Resume current test"
                >
                  <Feather name="play" size={13} color={colors.background} />
                  <Text style={styles.recoveryPrimaryText}>RESUME CURRENT TEST</Text>
                </Pressable>
              ) : null}
              {onDiscardDraft ? (
                <Pressable
                  style={styles.recoverySecondaryButton}
                  onPress={onDiscardDraft}
                  accessibilityRole="button"
                  accessibilityLabel="Discard unfinished test"
                >
                  <Text style={styles.recoverySecondaryText}>Discard</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      )}

      <View style={styles.syncCard}>
        <View style={styles.syncCardLeft}>
          <View style={[styles.syncIconWrap, isSyncing && styles.syncIconWrapActive]}>
            {isSyncing ? (
              <ActivityIndicator size="small" color="#4338ca" />
            ) : (
              <Feather
                name={failedSyncCount > 0 ? 'alert-circle' : pendingSyncCount > 0 ? 'cloud-off' : 'cloud'}
                size={18}
                color={failedSyncCount > 0 ? '#dc2626' : pendingSyncCount > 0 ? '#f59e0b' : '#22c55e'}
              />
            )}
          </View>
          <View style={styles.syncTextBlock}>
            <Text style={styles.syncTitle}>
              {isSyncing
                ? 'Syncing to ledger…'
                : failedSyncCount > 0
                ? `${failedSyncCount} sync failure${failedSyncCount === 1 ? '' : 's'}`
                : pendingSyncCount > 0
                ? `${pendingSyncCount} item${pendingSyncCount === 1 ? '' : 's'} pending`
                : 'All records and evidence synced'}
            </Text>
            <Text style={styles.syncSubtitle}>
              {failedSyncCount > 0
                ? `Needs attention · Last sync ${formatLastSync(lastSyncedAt)}`
                : `Last sync ${formatLastSync(lastSyncedAt)}`}
            </Text>
          </View>
        </View>
        <View style={styles.syncActions}>
          <Pressable
            style={[styles.syncButton, isSyncing && styles.syncButtonDisabled]}
            onPress={onForceSync}
            disabled={isSyncing}
            accessibilityRole="button"
            accessibilityLabel="Sync pending records and evidence"
          >
            <Feather name="refresh-cw" size={14} color="#4338ca" />
            <Text style={styles.syncButtonText}>Sync</Text>
          </Pressable>
        </View>
      </View>

      {featuredAlert && (() => {
        const priorityStyle = alertPriorityStyle(featuredAlert.priority);
        return (
          <View style={[styles.alertBanner, { backgroundColor: priorityStyle.background, borderColor: priorityStyle.border }]}>
            <View style={styles.alertBannerHeaderRow}>
              <View style={[styles.alertPriorityBadge, { backgroundColor: priorityStyle.accent }]}>
                <Text style={styles.alertPriorityBadgeText}>{featuredAlert.priority.toUpperCase()}</Text>
              </View>
              {featuredAlertIsNearby && (
                <View style={styles.alertNearbyBadge}>
                  <Feather name="map-pin" size={10} color={colors.background} />
                  <Text style={styles.alertNearbyBadgeText}>NEARBY</Text>
                </View>
              )}
              <Text style={[styles.alertBannerLabel, { color: priorityStyle.labelText }]}>Operational Alert</Text>
            </View>
            <Text style={styles.alertDescription}>{featuredAlert.description}</Text>
            <Text style={styles.alertMetaText}>{alertProvenanceLabel(featuredAlert)}</Text>
            {featuredAlertIsNearby && featuredAlertDistanceMeters != null && (
              <Text style={styles.alertMetaText}>Approx. {formatApproxDistance(featuredAlertDistanceMeters)} away</Text>
            )}
            {featuredAlert.expiresAt && (
              <Text style={styles.alertMetaText}>Expires {formatAlertExpiry(featuredAlert.expiresAt)}</Text>
            )}
            <View style={styles.alertActionsRow}>
              <Pressable
                style={[styles.alertAckButton, { backgroundColor: priorityStyle.accent }, acknowledging && styles.alertAckButtonDisabled]}
                onPress={() => void handleAcknowledge()}
                disabled={acknowledging}
              >
                {acknowledging ? (
                  <ActivityIndicator size="small" color={colors.background} />
                ) : (
                  <Text style={styles.alertAckButtonText}>Acknowledge</Text>
                )}
              </Pressable>
              <Pressable style={[styles.alertViewButton, { borderColor: priorityStyle.border }]} onPress={onViewAlerts}>
                <Text style={[styles.alertViewButtonText, { color: priorityStyle.labelText }]}>View Details</Text>
              </Pressable>
            </View>
          </View>
        );
      })()}

      {otherAlertsCount > 0 && (
        <Pressable style={styles.alertsSummaryRow} onPress={onViewAlerts}>
          <Text style={styles.alertsSummaryText}>
            {otherAlertsCount} active alert{otherAlertsCount === 1 ? '' : 's'}
          </Text>
          <Text style={styles.alertsSummaryLink}>View all</Text>
        </Pressable>
      )}

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{todayStats.today}</Text>
          <Text style={styles.statLabel}>Today</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{todayStats.week}</Text>
          <Text style={styles.statLabel}>This week</Text>
        </View>
        <View style={[styles.statCard, todayStats.pending > 0 && styles.statCardWarn]}>
          <Text style={[styles.statValue, todayStats.pending > 0 && styles.statValueWarn]}>
            {todayStats.pending}
          </Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
      </View>

      <Pressable style={styles.cta} onPress={onStartSession}>
        <View style={styles.ctaInner}>
          <View style={styles.ctaIconWrap}>
            <Feather name="camera" size={22} color="#4338ca" />
          </View>
          <View style={styles.ctaTextBlock}>
            <Text style={styles.ctaTitle}>Start New Session</Text>
            <Text style={styles.ctaSubtitle}>Scan a license to begin a verified record</Text>
          </View>
          <Feather name="arrow-right" size={20} color="#4338ca" />
        </View>
      </Pressable>

      <Pressable style={styles.cta} onPress={onOpenRoadOffence}>
        <View style={styles.ctaInner}>
          <View style={styles.ctaIconWrap}>
            <Feather name="alert-triangle" size={22} color="#4338ca" />
          </View>
          <View style={styles.ctaTextBlock}>
            <Text style={styles.ctaTitle}>Capture Road Offence</Text>
            <Text style={styles.ctaSubtitle}>Create a separate locked roadside record</Text>
          </View>
          <Feather name="arrow-right" size={20} color="#4338ca" />
        </View>
      </Pressable>

      <View style={styles.tipCard}>
        <View style={styles.tipIconWrap}>
          <Feather name="info" size={16} color="#4338ca" />
        </View>
        <View style={styles.tipTextBlock}>
          <Text style={styles.tipTitle}>Tip</Text>
          <Text style={styles.tipBody}>
            Hold the phone 15-20 cm from the license barcode and tilt slightly to avoid glare. PDF417 is read best in daylight.
          </Text>
        </View>
      </View>

      <View style={styles.recentHeader}>
        <Text style={styles.sectionLabel}>RECENT STOPS</Text>
        <Pressable onPress={onOpenReports}>
          <Text style={styles.linkText}>View all</Text>
        </Pressable>
      </View>
      <View style={styles.recentList}>
        {recentStops.length === 0 ? (
          <View style={styles.recentEmpty}>
            <Text style={styles.recentEmptyTitle}>No recent stops yet</Text>
            <Text style={styles.recentEmptyText}>Completed test records will appear here.</Text>
          </View>
        ) : (
          recentStops.map((stop) => (
            <View key={stop.id} style={styles.recentItem}>
              <View style={styles.recentAvatar}>
                <Text style={styles.recentAvatarText}>
                  {stop.name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()}
                </Text>
              </View>
              <View style={styles.recentBody}>
                <View style={styles.recentTopRow}>
                  <Text style={styles.recentName}>{stop.name}</Text>
                  <View
                    style={[
                      styles.recentResult,
                      stop.result === 'FAIL' ? styles.recentResultFail : styles.recentResultPass
                    ]}
                  >
                    <Text
                      style={[
                        styles.recentResultText
                      ]}
                    >
                      {stop.result === 'FAIL' ? 'BAC FAIL' : 'BAC PASS'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.recentMeta}>
                  {stop.license} · {stop.bac} g/100ml · {stop.time}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.footerRow}>
        <Pressable style={styles.footerLink} onPress={onOpenReports}>
          <Feather name="bar-chart-2" size={14} color="#64748b" />
          <Text style={styles.footerLinkText}>Reports</Text>
        </Pressable>
        <View style={styles.footerDivider} />
        <Pressable style={styles.footerLink} onPress={onOpenAudit}>
          <Feather name="shield" size={14} color="#64748b" />
          <Text style={styles.footerLinkText}>Audit trail</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { styles } from './SyncStatusBar.styles';
import { colors } from '../styles/colors';
import type { SyncRunSummary } from '../lib/SyncContext';

interface Props {
  isSyncing: boolean;
  /** Records + evidence + queued alert actions waiting to upload. */
  pendingCount: number;
  /** Records + evidence that failed and need an officer decision. */
  failedCount: number;
  lastSyncedAt: Date | null;
  /**
   * Outcome of the most recent completed run. The transient banner is driven
   * from this rather than from the in-flight flag — see shouldAnnounceRun.
   */
  lastRun?: SyncRunSummary | null;
  onSyncNow: () => void;
  onOpenSyncCentre: () => void;
}

type SyncTone = 'syncing' | 'attention' | 'queued' | 'clear';

interface SyncPresentation {
  tone: SyncTone;
  icon: keyof typeof Feather.glyphMap;
  title: string;
  /** Short label for the collapsed strip. */
  shortTitle: string;
  detail: string;
  accent: string;
  border: string;
  background: string;
  /** Screen-reader summary of the whole bar, including the queued/failed tally. */
  accessibilityLabel: string;
}

/** How long the expanded banner stays up after a sync event. */
export const SYNC_BANNER_AUTO_DISMISS_MS = 5_000;
/** Fade duration for expand/collapse so the bar never snaps. */
const ANIMATION_MS = 220;

/**
 * Whether a completed run is worth interrupting the officer for.
 *
 * Sync polls automatically every 10 seconds while the app is open, and most of
 * those polls do nothing. Announcing on the in-flight flag alone made the
 * banner fire twice per poll (once on start, once on settle) with no useful
 * content, which is far worse than never showing it.
 *
 * So the banner is gated on work that actually moved:
 *   - something was uploaded        → "3 records uploaded"
 *   - something failed              → "2 items need attention"
 *   - the session expired           → must be surfaced, sync cannot proceed
 *   - nothing happened             → stay silent, the strip already says so
 *
 * Transient, self-resolving states (deferred, rate-limited, offline) are
 * deliberately excluded: they retry on their own, and repeating them every poll
 * is precisely the noise this gate exists to remove. They remain visible in the
 * persistent strip and in the Sync Centre.
 */
export function shouldAnnounceRun(run: SyncRunSummary | null | undefined): boolean {
  if (!run) return false;
  if (run.status === 'auth_required') return true;
  if (run.uploaded > 0 || run.evidenceUploaded > 0 || run.alertsSynced > 0) return true;
  if (run.failed > 0 || run.evidenceFailed > 0) return true;
  return false;
}

function formatLastSync(value: Date | null): string {
  if (!value) return 'never on this device';
  const time = value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const day = value.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${day} at ${time}`;
}

function itemWord(count: number): string {
  return count === 1 ? 'item' : 'items';
}

export function syncStatusPresentation({
  isSyncing,
  pendingCount,
  failedCount,
  lastSyncedAt = null,
}: Pick<Props, 'isSyncing' | 'pendingCount' | 'failedCount'> & {
  lastSyncedAt?: Date | null;
}): SyncPresentation {
  const tallies =
    `${pendingCount} waiting to sync, ${failedCount} needing attention out of ` +
    `${pendingCount + failedCount} queued ${itemWord(pendingCount + failedCount)}`;

  if (isSyncing) {
    return {
      tone: 'syncing',
      icon: 'refresh-cw',
      title: 'Syncing to the ledger…',
      shortTitle: 'Syncing…',
      detail: 'Uploading records and evidence. Keep IntegriScan open.',
      accent: colors.warning,
      border: colors.warning,
      background: colors.syncQueuedBackground,
      accessibilityLabel: `Sync in progress. ${tallies}.`,
    };
  }

  if (failedCount > 0) {
    return {
      tone: 'attention',
      icon: 'alert-triangle',
      title: `${failedCount} ${itemWord(failedCount)} failed to sync`,
      shortTitle: `${failedCount} failed`,
      detail: 'Open Sync Centre to see what went wrong and retry.',
      accent: colors.error,
      border: colors.errorBorder,
      background: colors.errorBackground,
      accessibilityLabel: `Sync needs attention. ${tallies}. Open Sync Centre for details.`,
    };
  }

  if (pendingCount > 0) {
    return {
      tone: 'queued',
      icon: 'upload-cloud',
      title: `${pendingCount} ${itemWord(pendingCount)} waiting to sync`,
      shortTitle: `${pendingCount} pending`,
      detail: 'Safe on this phone — uploads automatically when online.',
      accent: colors.warning,
      border: colors.syncQueuedBorder,
      background: colors.syncQueuedBackground,
      accessibilityLabel: `${pendingCount} ${itemWord(pendingCount)} waiting to sync. Safe on this phone and uploading automatically.`,
    };
  }

  return {
    tone: 'clear',
    icon: 'check-circle',
    title: 'All records and evidence synced',
    shortTitle: 'Synced',
    detail: `Last sync ${formatLastSync(lastSyncedAt)}`,
    accent: colors.successText,
    border: colors.successBorder,
    background: colors.successBackground,
    accessibilityLabel: 'All records and evidence are synced up to date.',
  };
}

/**
 * Sync status for the officer dashboard, on every capture step (Home, scanning,
 * reading, saved).
 *
 * Two layers, because the two jobs pull in opposite directions:
 *
 *  - A permanently visible, single-line collapsed strip. Earlier feedback was
 *    that sync was impossible to find (it lived only behind an unlabelled
 *    header icon), so it must never be able to disappear entirely.
 *  - An expanded banner that auto-dismisses. Feedback was also that a
 *    permanently expanded banner pushed the content the officer actually needs
 *    below the fold, so the detailed copy and actions only occupy space for a
 *    few seconds around a real sync event.
 *
 * The banner is event-driven, not render-driven: it expands when the sync
 * signature (in-flight / queued / failed / last-synced timestamp) actually
 * changes, and never merely because the component re-rendered. A manual expand
 * pins it open until the officer collapses it, so a timer can never yank a
 * panel away while it is being read or tapped.
 */
export function SyncStatusBar({
  isSyncing,
  pendingCount,
  failedCount,
  lastSyncedAt,
  lastRun,
  onSyncNow,
  onOpenSyncCentre,
}: Props) {
  const presentation = syncStatusPresentation({
    isSyncing,
    pendingCount,
    failedCount,
    lastSyncedAt,
  });

  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);
  // Manual interaction outranks the auto-dismiss timer.
  const pinnedRef = useRef(false);
  // Identifies the last run we considered, so each run is announced at most
  // once. `finishedAt` is unique per run, which is what makes this reliable.
  const announcedRunRef = useRef<string | null>(null);
  // False until the first effect pass, so mount never announces a banner.
  const primedRef = useRef(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const progress = useRef(new Animated.Value(0)).current;

  const announceable = shouldAnnounceRun(lastRun);
  const runKey = lastRun?.finishedAt ?? null;

  const clearDismissTimer = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  /** Drops any in-flight collapse so a re-expand is not undone a moment later. */
  const clearCollapseTimer = useCallback(() => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
  }, []);

  const animateTo = useCallback(
    (toValue: number, onComplete?: () => void) => {
      animationRef.current?.stop();
      animationRef.current = Animated.timing(progress, {
        toValue,
        duration: ANIMATION_MS,
        useNativeDriver: true,
      });
      animationRef.current.start(({ finished }) => {
        if (finished) onComplete?.();
      });
    },
    [progress],
  );

  const expand = useCallback(() => {
    clearCollapseTimer();
    setMounted(true);
    setExpanded(true);
    clearDismissTimer();
    animateTo(1);
  }, [animateTo, clearCollapseTimer, clearDismissTimer]);

  const collapse = useCallback(() => {
    clearDismissTimer();
    animateTo(0);
    // Unmount on a timer rather than the animation's completion callback: if the
    // fade is interrupted (a new event arriving mid-collapse) the callback may
    // never fire, and the panel would be stuck on screen with zero opacity.
    collapseTimerRef.current = setTimeout(() => {
      collapseTimerRef.current = null;
      setExpanded(false);
      setMounted(false);
    }, ANIMATION_MS);
  }, [animateTo, clearDismissTimer]);

  const scheduleDismiss = useCallback(() => {
    clearDismissTimer();
    dismissTimerRef.current = setTimeout(() => {
      dismissTimerRef.current = null;
      if (!pinnedRef.current) collapse();
    }, SYNC_BANNER_AUTO_DISMISS_MS);
  }, [clearDismissTimer, collapse]);

  // Expand only when a completed run actually moved work, and never more than
  // once for the same run. Deliberately keyed on the run outcome, NOT on
  // isSyncing / lastSyncedAt: the 10-second background poll flips those on
  // every cycle, which made the banner fire constantly with nothing to say.
  useEffect(() => {
    // Adopt whatever run is already in flight at mount without announcing it:
    // that happened before this screen was watching, so popping a banner for it
    // on first paint would be noise, not news.
    if (!primedRef.current) {
      primedRef.current = true;
      announcedRunRef.current = runKey;
      return;
    }
    if (!runKey) return;
    if (announcedRunRef.current === runKey) return;
    announcedRunRef.current = runKey;
    if (!announceable) return;
    if (pinnedRef.current) return;

    expand();
    scheduleDismiss();
  }, [announceable, runKey, expand, scheduleDismiss]);

  useEffect(
    () => () => {
      clearDismissTimer();
      clearCollapseTimer();
      animationRef.current?.stop();
    },
    [clearCollapseTimer, clearDismissTimer],
  );

  const handleManualExpand = () => {
    // Manual interaction pins the panel: an auto-dismiss timer must never
    // yank it away while the officer is reading or tapping it.
    pinnedRef.current = true;
    clearDismissTimer();
    expand();
  };

  const handleManualCollapse = () => {
    pinnedRef.current = false;
    clearDismissTimer();
    collapse();
  };

  const handleSyncNow = () => {
    clearDismissTimer();
    onSyncNow();
    // An explicit tap is feedback-worthy, so open the panel and pin it. It will
    // report the outcome of the run that officer asked for.
    pinnedRef.current = true;
    expand();
  };

  const canSyncNow = pendingCount > 0 || failedCount > 0;
  const showPinnedHint = expanded && pinnedRef.current;

  return (
    <View
      style={[styles.bar, { backgroundColor: presentation.background, borderColor: presentation.border }]}
      accessible={false}
    >
      {/* Collapsed strip: always present, one line, low footprint. */}
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          {isSyncing ? (
            <ActivityIndicator size="small" color={presentation.accent} />
          ) : (
            <Feather name={presentation.icon} size={16} color={presentation.accent} />
          )}
        </View>

        <Pressable
          style={styles.statusBlock}
          onPress={expanded ? undefined : handleManualExpand}
          disabled={expanded}
          accessibilityRole="button"
          accessibilityLabel={presentation.accessibilityLabel}
          accessibilityHint="Expands sync status and actions"
          accessibilityState={{ expanded, busy: isSyncing }}
        >
          <Text style={[styles.shortTitle, { color: presentation.accent }]} numberOfLines={1}>
            {presentation.shortTitle}
          </Text>
        </Pressable>

        <Pressable
          style={styles.syncButton}
          onPress={handleSyncNow}
          disabled={isSyncing}
          accessibilityRole="button"
          accessibilityLabel="Sync now — upload pending records and evidence"
          accessibilityState={{ busy: isSyncing, disabled: isSyncing }}
        >
          {isSyncing ? (
            <ActivityIndicator size="small" color={presentation.accent} />
          ) : (
            <Feather name="refresh-cw" size={14} color={presentation.accent} />
          )}
        </Pressable>

        <Pressable
          style={styles.chevronButton}
          onPress={expanded ? handleManualCollapse : handleManualExpand}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Collapse sync status' : 'Expand sync status'}
        >
          <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={presentation.accent} />
        </Pressable>
      </View>

      {/* Expanded banner: event-driven, auto-dismisses unless pinned open. */}
      {mounted ? (
        <Animated.View
          style={[
            styles.detailPanel,
            {
              opacity: progress,
              transform: [
                {
                  translateY: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-6, 0],
                  }),
                },
              ],
            },
          ]}
          pointerEvents={expanded ? 'auto' : 'none'}
        >
          <Text style={[styles.title, { color: presentation.accent }]}>{presentation.title}</Text>
          <Text style={styles.detailBody}>{presentation.detail}</Text>
          {showPinnedHint ? (
            <Text style={styles.pinnedHint}>Pinned open — tap the arrow to collapse</Text>
          ) : null}
          <View style={styles.actions}>
            <Pressable
              style={[styles.syncNowButton, !canSyncNow && styles.syncNowButtonIdle]}
              onPress={handleSyncNow}
              disabled={isSyncing}
              accessibilityRole="button"
              accessibilityLabel="Sync pending work now"
              accessibilityState={{ busy: isSyncing, disabled: isSyncing }}
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color={colors.background} />
              ) : (
                <Feather name="refresh-cw" size={15} color={colors.background} />
              )}
              <Text style={styles.syncNowButtonText}>SYNC NOW</Text>
            </Pressable>
            <Pressable
              style={styles.centreButton}
              onPress={onOpenSyncCentre}
              accessibilityRole="button"
              accessibilityLabel="Open Sync Centre"
            >
              <Text style={styles.centreButtonText}>Sync Centre</Text>
              <Feather name="chevron-right" size={14} color={colors.accentBlue} />
            </Pressable>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { UserProfile } from '../types';

import { styles } from './OfficerHome.styles';
import { colors } from '../styles/colors';

interface Props {
  profile: UserProfile;
  pendingCount: number;
  failedCount: number;
  syncedCount: number;
  todayCount: number;
  weekCount: number;
  recentStops: RecentStop[];
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  onStartSession: () => void;
  onForceSync: () => void;
  onOpenReports: () => void;
  onOpenAudit: () => void;
}

type DutyStatus = 'on' | 'off' | 'break';

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
  if (!d) return 'Never synced';
  const minutes = Math.floor((Date.now() - d.getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes === 1) return '1 min ago';
  if (minutes < 60) return `${minutes} min ago`;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function OfficerHome({
  profile,
  pendingCount,
  failedCount,
  syncedCount,
  todayCount,
  weekCount,
  recentStops,
  isSyncing,
  lastSyncedAt,
  onStartSession,
  onForceSync,
  onOpenReports,
  onOpenAudit
}: Props) {
  const [duty, setDuty] = useState<DutyStatus>('on');

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
              const next: Record<DutyStatus, DutyStatus> = { on: 'break', break: 'off', off: 'on' };
              setDuty(next[duty]);
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

      <View style={styles.syncCard}>
        <View style={styles.syncCardLeft}>
          <View style={[styles.syncIconWrap, isSyncing && styles.syncIconWrapActive]}>
            {isSyncing ? (
              <ActivityIndicator size="small" color="#4338ca" />
            ) : (
              <Feather
                name={pendingCount > 0 ? 'cloud-off' : 'cloud'}
                size={18}
                color={pendingCount > 0 ? '#f59e0b' : '#22c55e'}
              />
            )}
          </View>
          <View style={styles.syncTextBlock}>
            <Text style={styles.syncTitle}>
              {isSyncing
                ? 'Syncing to ledger…'
                : pendingCount > 0
                ? `${pendingCount} record${pendingCount === 1 ? '' : 's'} pending`
                : 'All records synced'}
            </Text>
            <Text style={styles.syncSubtitle}>
              {failedCount > 0
                ? `${failedCount} failed · ${formatLastSync(lastSyncedAt)}`
                : `Last sync ${formatLastSync(lastSyncedAt)}`}
            </Text>
          </View>
        </View>
        <Pressable
          style={[styles.syncButton, isSyncing && styles.syncButtonDisabled]}
          onPress={onForceSync}
          disabled={isSyncing}
        >
          <Feather name="refresh-cw" size={14} color="#4338ca" />
          <Text style={styles.syncButtonText}>Sync</Text>
        </Pressable>
      </View>

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
                      {stop.result}
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

      <View style={styles.tipCard}>
        <View style={styles.tipIconWrap}>
          <Feather name="info" size={16} color="#4338ca" />
        </View>
        <View style={styles.tipTextBlock}>
          <Text style={styles.tipTitle}>Tip</Text>
          <Text style={styles.tipBody}>
            Hold the phone 15–20 cm from the license barcode and tilt slightly to avoid glare. PDF417 is read best in daylight.
          </Text>
        </View>
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

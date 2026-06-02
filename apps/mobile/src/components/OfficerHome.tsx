import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { UserProfile } from '../types';

interface Props {
  profile: UserProfile;
  pendingCount: number;
  failedCount: number;
  syncedCount: number;
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  onStartSession: () => void;
  onForceSync: () => void;
  onOpenReports: () => void;
  onOpenAudit: () => void;
}

type DutyStatus = 'on' | 'off' | 'break';

interface QuickAction {
  key: string;
  label: string;
  iconLib: 'feather' | 'ionicons' | 'material';
  iconName: string;
  tint: string;
  bg: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { key: 'scan', label: 'Scan License', iconLib: 'feather', iconName: 'camera', tint: '#4338ca', bg: '#eef2ff' },
  { key: 'manual', label: 'Manual Entry', iconLib: 'feather', iconName: 'edit-3', tint: '#0ea5e9', bg: '#e0f2fe' },
  { key: 'photo', label: 'Quick Photo', iconLib: 'feather', iconName: 'image', tint: '#16a34a', bg: '#dcfce7' },
  { key: 'retest', label: 'Retest', iconLib: 'feather', iconName: 'refresh-cw', tint: '#f59e0b', bg: '#fef3c7' }
];

interface RecentStop {
  id: string;
  time: string;
  name: string;
  license: string;
  bac: string;
  result: 'PASS' | 'FAIL';
}

const RECENT_STOPS: RecentStop[] = [
  { id: '1', time: '08:42', name: 'J. Naidoo', license: 'DL882104', bac: '0.000', result: 'PASS' },
  { id: '2', time: '07:15', name: 'S. van Wyk', license: 'DL661203', bac: '0.071', result: 'FAIL' },
  { id: '3', time: 'Yesterday 22:08', name: 'M. Dlamini', license: 'DL445091', bac: '0.000', result: 'PASS' }
];

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

function ActionIcon({ lib, name, color, size = 22 }: { lib: QuickAction['iconLib']; name: string; color: string; size?: number }) {
  if (lib === 'ionicons') return <Ionicons name={name as any} size={size} color={color} />;
  if (lib === 'material') return <MaterialCommunityIcons name={name as any} size={size} color={color} />;
  return <Feather name={name as any} size={size} color={color} />;
}

export function OfficerHome({
  profile,
  pendingCount,
  failedCount,
  syncedCount,
  isSyncing,
  lastSyncedAt,
  onStartSession,
  onForceSync,
  onOpenReports,
  onOpenAudit
}: Props) {
  const [duty, setDuty] = useState<DutyStatus>('on');

  const todayStats = useMemo(() => {
    const total = syncedCount + pendingCount + failedCount;
    return {
      today: 12,
      week: 47,
      pending: pendingCount
    };
  }, [pendingCount, syncedCount, failedCount]);

  const dutyMeta = {
    on: { label: 'On Duty', color: '#16a34a', bg: '#dcfce7', dot: '#22c55e' },
    off: { label: 'Off Duty', color: '#64748b', bg: '#f1f5f9', dot: '#94a3b8' },
    break: { label: 'On Break', color: '#f59e0b', bg: '#fef3c7', dot: '#f59e0b' }
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

      <Text style={styles.sectionLabel}>QUICK ACTIONS</Text>
      <View style={styles.actionsGrid}>
        {QUICK_ACTIONS.map((action) => (
          <Pressable key={action.key} style={styles.actionCard}>
            <View style={[styles.actionIconWrap, { backgroundColor: action.bg }]}>
              <ActionIcon lib={action.iconLib} name={action.iconName} color={action.tint} />
            </View>
            <Text style={styles.actionLabel}>{action.label}</Text>
          </Pressable>
        ))}
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
        {RECENT_STOPS.map((stop) => (
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
                      styles.recentResultText,
                      stop.result === 'FAIL' ? styles.recentResultTextFail : styles.recentResultTextPass
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
        ))}
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

const styles = StyleSheet.create({
  scroll: {
    flex: 1
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 100
  },
  hero: {
    backgroundColor: '#4338ca',
    borderRadius: 24,
    padding: 20,
    paddingTop: 22,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 14
  },
  heroOrbA: {
    position: 'absolute',
    top: -60,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.08)'
  },
  heroOrbB: {
    position: 'absolute',
    bottom: -50,
    left: -30,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.05)'
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)'
  },
  avatarText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5
  },
  dutyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    gap: 6
  },
  dutyDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  dutyText: {
    fontSize: 12,
    fontWeight: '600'
  },
  greeting: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    fontWeight: '500'
  },
  heroName: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: -0.4
  },
  heroMetaRow: {
    flexDirection: 'row',
    marginTop: 14,
    gap: 14
  },
  heroMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  heroMetaText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '500'
  },
  syncCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 14
  },
  syncCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1
  },
  syncIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center'
  },
  syncIconWrapActive: {
    backgroundColor: '#eef2ff'
  },
  syncTextBlock: {
    flex: 1
  },
  syncTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a'
  },
  syncSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#eef2ff'
  },
  syncButtonDisabled: {
    opacity: 0.6
  },
  syncButtonText: {
    color: '#4338ca',
    fontSize: 13,
    fontWeight: '600'
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  statCardWarn: {
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb'
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
    letterSpacing: -0.4
  },
  statValueWarn: {
    color: '#b45309'
  },
  statLabel: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600'
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 1.2,
    marginBottom: 10
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 18
  },
  actionCard: {
    width: '48.4%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  actionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
    flex: 1
  },
  cta: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 4,
    borderWidth: 1,
    borderColor: '#c7d2fe',
    marginBottom: 22,
    shadowColor: '#4338ca',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 6
  },
  ctaInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14
  },
  ctaIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center'
  },
  ctaTextBlock: {
    flex: 1
  },
  ctaTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a'
  },
  ctaSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  linkText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4338ca'
  },
  recentList: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 4,
    marginBottom: 18
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12
  },
  recentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center'
  },
  recentAvatarText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569'
  },
  recentBody: {
    flex: 1
  },
  recentTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  recentName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a'
  },
  recentResult: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6
  },
  recentResultPass: {
    backgroundColor: '#dcfce7'
  },
  recentResultFail: {
    backgroundColor: '#fee2e2'
  },
  recentResultText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5
  },
  recentResultTextPass: {
    color: '#15803d'
  },
  recentResultTextFail: {
    color: '#b91c1c'
  },
  recentMeta: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2
  },
  tipCard: {
    flexDirection: 'row',
    backgroundColor: '#eef2ff',
    borderRadius: 16,
    padding: 14,
    gap: 12,
    marginBottom: 18
  },
  tipIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center'
  },
  tipTextBlock: {
    flex: 1
  },
  tipTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4338ca',
    letterSpacing: 0.5,
    marginBottom: 2
  },
  tipBody: {
    fontSize: 12,
    color: '#312e81',
    lineHeight: 17
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6
  },
  footerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8
  },
  footerLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569'
  },
  footerDivider: {
    width: 1,
    height: 18,
    backgroundColor: '#e2e8f0'
  }
});

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../lib/AuthContext';
import { loadAuditEventCounts, loadAuditEvents } from '../services/audit';
import type { AuditEvent } from '../db/repository';
import { OfficerBottomNav } from '../components/OfficerBottomNav';

type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  OfficerDashboard: undefined;
  OfficerReports: undefined;
  Audit: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, 'Audit'>;

type FilterKey = 'all' | 'auth' | 'test' | 'sync';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'auth', label: 'Auth' },
  { key: 'test', label: 'Tests' },
  { key: 'sync', label: 'Sync' }
];

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

interface ActionVisual {
  icon: string;
  color: string;
  label: string;
}

function actionVisual(action: string): ActionVisual {
  if (action.startsWith('auth.login')) return { icon: 'log-in', color: '#16a34a', label: 'Login' };
  if (action === 'auth.logout') return { icon: 'log-out', color: '#64748b', label: 'Logout' };
  if (action === 'test.saved') return { icon: 'save', color: '#4338ca', label: 'Test saved' };
  if (action === 'test.invalidated') return { icon: 'alert-triangle', color: '#dc2626', label: 'Test invalidated' };
  if (action === 'test.invalidation.failed') return { icon: 'alert-circle', color: '#dc2626', label: 'Invalidation failed' };
  if (action === 'sync.batch.completed') return { icon: 'cloud-upload', color: '#0ea5e9', label: 'Sync batch' };
  if (action === 'sync.batch.failed') return { icon: 'cloud-off', color: '#dc2626', label: 'Sync failed' };
  return { icon: 'activity', color: '#475569', label: action };
}

function severityColor(severity: string, outcome: string): string {
  if (outcome === 'failure') return '#dc2626';
  if (severity === 'warning') return '#f59e0b';
  if (severity === 'critical') return '#7c2d12';
  return '#16a34a';
}

export function AuditScreen({ navigation }: Props) {
  const { profile, signOut } = useAuth();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [counts, setCounts] = useState({
    total: 0,
    auth: 0,
    tests: 0,
    sync: 0,
    failures: 0
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [data, c] = await Promise.all([
        loadAuditEvents(filter),
        loadAuditEventCounts()
      ]);
      setEvents(data);
      setCounts(c);
    } catch (error) {
      console.error('Failed to load audit events:', error);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filterCounts = useMemo(
    () => ({
      all: counts.total,
      auth: counts.auth,
      test: counts.tests,
      sync: counts.sync
    }),
    [counts]
  );

  const renderEvent = ({ item }: { item: AuditEvent }) => {
    const visual = actionVisual(item.action);
    const dot = severityColor(item.severity, item.outcome);
    let parsedMetadata: Record<string, unknown> | null = null;
    if (item.metadata) {
      try {
        parsedMetadata = JSON.parse(item.metadata);
      } catch {
        parsedMetadata = null;
      }
    }

    return (
      <View style={styles.eventCard}>
        <View style={styles.eventHeader}>
          <View style={[styles.actionIcon, { backgroundColor: `${visual.color}1a` }]}>
            <Feather name={visual.icon as any} size={16} color={visual.color} />
          </View>
          <View style={styles.eventHeaderText}>
            <Text style={styles.actionLabel}>{visual.label}</Text>
            <Text style={styles.actionRaw}>{item.action}</Text>
          </View>
          <View style={[styles.outcomeDot, { backgroundColor: dot }]} />
        </View>

        <Text style={styles.message}>{item.message}</Text>

        <View style={styles.metaRow}>
          <Feather name="user" size={12} color="#94a3b8" />
          <Text style={styles.metaText}>
            {item.officerName ? `${item.officerName}${item.badgeNumber ? ` · ${item.badgeNumber}` : ''}` : 'Device'}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Feather name="clock" size={12} color="#94a3b8" />
          <Text style={styles.metaText}>{formatTimestamp(item.occurredAt)}</Text>
        </View>
        {item.entityId && (
          <View style={styles.metaRow}>
            <Feather name="hash" size={12} color="#94a3b8" />
            <Text style={styles.metaText}>
              {item.entityType ? `${item.entityType}:` : ''}
              {item.entityId}
            </Text>
          </View>
        )}

        {parsedMetadata && Object.keys(parsedMetadata).length > 0 && (
          <View style={styles.metadataBlock}>
            <Text style={styles.metadataTitle}>DETAILS</Text>
            {Object.entries(parsedMetadata).map(([key, value]) => (
              <View key={key} style={styles.metadataRow}>
                <Text style={styles.metadataKey}>{key}</Text>
                <Text style={styles.metadataValue} numberOfLines={3}>
                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <View style={styles.headerTitle}>
          <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
            <Feather name="arrow-left" size={20} color="#475569" />
          </Pressable>
          <View>
            <Text style={styles.headerLabel}>DEVICE AUDIT TRAIL</Text>
            <Text style={styles.headerSubtitle}>
              {profile?.name ? `${profile.name} · ${profile.badgeNumber}` : 'Local device log'}
            </Text>
          </View>
        </View>
        <Pressable
          style={styles.signOutButton}
          onPress={async () => {
            await signOut();
            navigation.replace('Login');
          }}
        >
          <Feather name="log-out" size={20} color="#475569" />
        </Pressable>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{counts.total}</Text>
          <Text style={styles.summaryLabel}>Events</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryValue, { color: '#4338ca' }]}>{counts.tests}</Text>
          <Text style={styles.summaryLabel}>Test actions</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryValue, { color: '#0ea5e9' }]}>{counts.sync}</Text>
          <Text style={styles.summaryLabel}>Sync events</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryValue, { color: counts.failures > 0 ? '#dc2626' : '#16a34a' }]}>
            {counts.failures}
          </Text>
          <Text style={styles.summaryLabel}>Failures</Text>
        </View>
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((f) => {
          const active = f.key === filter;
          const count = filterCounts[f.key];
          return (
            <Pressable
              key={f.key}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.filterLabel, active && styles.filterLabelActive]}>
                {f.label}
              </Text>
              <View style={[styles.filterBadge, active && styles.filterBadgeActive]}>
                <Text style={[styles.filterBadgeText, active && styles.filterBadgeTextActive]}>
                  {count}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.appendOnlyBanner}>
        <MaterialCommunityIcons name="shield-lock" size={14} color="#475569" />
        <Text style={styles.appendOnlyText}>
          Append-only log — entries cannot be edited or deleted from this device.
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4338ca" />
        </View>
      ) : events.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Feather name="file-text" size={48} color="#cbd5e1" />
          <Text style={styles.emptyTitle}>No Audit Events</Text>
          <Text style={styles.emptySubtitle}>
            Activity from this device will appear here. Actions like saving a test, syncing, and login attempts are recorded automatically.
          </Text>
        </View>
      ) : (
        <FlatList
          data={events}
          renderItem={renderEvent}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onRefresh={refresh}
          refreshing={loading}
        />
      )}

      <OfficerBottomNav active="Audit" />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  header: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingTop: Platform.OS === 'android' ? 50 : 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4338ca',
    letterSpacing: 1
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2
  },
  signOutButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center'
  },
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 8
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a'
  },
  summaryLabel: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6
  },
  filterChipActive: {
    backgroundColor: '#4338ca',
    borderColor: '#4338ca'
  },
  filterLabel: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500'
  },
  filterLabelActive: {
    color: '#ffffff'
  },
  filterBadge: {
    minWidth: 22,
    paddingHorizontal: 6,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center'
  },
  filterBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.25)'
  },
  filterBadgeText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600'
  },
  filterBadgeTextActive: {
    color: '#ffffff'
  },
  appendOnlyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#f1f5f9',
    borderRadius: 8
  },
  appendOnlyText: {
    flex: 1,
    fontSize: 11,
    color: '#475569'
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 8
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    marginTop: 8
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18
  },
  listContent: {
    padding: 16,
    paddingBottom: 100
  },
  eventCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  actionIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  eventHeaderText: {
    flex: 1
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a'
  },
  actionRaw: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2
  },
  outcomeDot: {
    width: 10,
    height: 10,
    borderRadius: 5
  },
  message: {
    fontSize: 13,
    color: '#334155',
    marginTop: 10,
    lineHeight: 18
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6
  },
  metaText: {
    fontSize: 12,
    color: '#64748b',
    flex: 1
  },
  metadataBlock: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9'
  },
  metadataTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 1,
    marginBottom: 6
  },
  metadataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 2
  },
  metadataKey: {
    fontSize: 12,
    color: '#64748b',
    flex: 0.4
  },
  metadataValue: {
    fontSize: 12,
    color: '#0f172a',
    flex: 0.6,
    textAlign: 'right'
  }
});

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
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

import { styles } from './AuditScreen.styles';

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

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.warn('Sign out warning:', error);
    }
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
          onPress={() => { void handleLogout(); }}
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



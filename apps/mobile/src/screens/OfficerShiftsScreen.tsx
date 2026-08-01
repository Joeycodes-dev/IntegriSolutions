import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OfficerBottomNav } from '../components/OfficerBottomNav';
import { useAuth } from '../lib/AuthContext';
import { useSync } from '../lib/SyncContext';
import {
  clearSelectedRoadblockShift,
  getActiveRoadblockShifts,
  getSelectedRoadblockShift,
  isRoadblockShiftActive,
  saveSelectedRoadblockShift,
  type RoadblockShift
} from '../services/shifts';
import { colors } from '../styles/colors';

type RootStackParamList = {
  OfficerDashboard: undefined;
  OfficerReports: undefined;
  OfficerShifts: undefined;
  Audit: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, 'OfficerShifts'>;

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatBounds(shift: RoadblockShift): string {
  if (shift.centerLat == null || shift.centerLng == null || shift.radiusMeters == null) {
    return 'No location boundary set';
  }
  return `${shift.centerLat.toFixed(4)}, ${shift.centerLng.toFixed(4)} within ${shift.radiusMeters}m`;
}

export function OfficerShiftsScreen({ navigation }: Props) {
  const { profile, signOut } = useAuth();
  const { pendingCount, failedCount, todayCount, weekCount, forceSync, isSyncing } = useSync();
  const [shifts, setShifts] = useState<RoadblockShift[]>([]);
  const [selectedShift, setSelectedShift] = useState<RoadblockShift | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingSelection, setSavingSelection] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [active, stored] = await Promise.all([
        getActiveRoadblockShifts(),
        getSelectedRoadblockShift()
      ]);
      setShifts(active);
      if (isRoadblockShiftActive(stored)) {
        setSelectedShift(stored);
      } else {
        await clearSelectedRoadblockShift();
        setSelectedShift(null);
      }
      setError(null);
    } catch (err) {
      const stored = await getSelectedRoadblockShift();
      setSelectedShift(isRoadblockShiftActive(stored) ? stored : null);
      setError(err instanceof Error ? err.message : 'Failed to load active roadblocks');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const handleSelect = async (shift: RoadblockShift) => {
    setSavingSelection(true);
    try {
      await saveSelectedRoadblockShift(shift);
      setSelectedShift(shift);
      Alert.alert('Roadblock selected', `${shift.roadblockName} is now attached to new test captures.`);
    } catch (err) {
      Alert.alert('Selection failed', err instanceof Error ? err.message : 'Could not save roadblock selection.');
    } finally {
      setSavingSelection(false);
    }
  };

  const handleClear = async () => {
    await clearSelectedRoadblockShift();
    setSelectedShift(null);
  };

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (err) {
      console.warn('Sign out warning:', err);
    }
  };

  const renderShift = ({ item }: { item: RoadblockShift }) => {
    const selected = selectedShift?.id === item.id;
    return (
      <View style={[styles.shiftCard, selected && styles.shiftCardSelected]}>
        <View style={styles.shiftHeader}>
          <View style={styles.shiftTitleBlock}>
            <Text style={styles.shiftTitle}>{item.roadblockName}</Text>
            <Text style={styles.shiftSubtitle}>{item.station}</Text>
          </View>
          <View style={[styles.statusBadge, selected && styles.statusBadgeSelected]}>
            <Text style={[styles.statusText, selected && styles.statusTextSelected]}>
              {selected ? 'SELECTED' : 'ACTIVE'}
            </Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <Feather name="clock" size={13} color="#64748b" />
          <Text style={styles.infoText}>{formatDateTime(item.startsAt)} - {formatDateTime(item.endsAt)}</Text>
        </View>
        <View style={styles.infoRow}>
          <Feather name="map-pin" size={13} color="#64748b" />
          <Text style={styles.infoText}>{formatBounds(item)}</Text>
        </View>
        <View style={styles.infoRow}>
          <Feather name="user-check" size={13} color="#64748b" />
          <Text style={styles.infoText}>Supervisor {item.supervisorName || item.supervisorEmail}</Text>
        </View>
        {item.notes && (
          <View style={styles.notesBlock}>
            <Text style={styles.notesText}>{item.notes}</Text>
          </View>
        )}

        <Pressable
          style={[styles.selectButton, selected && styles.selectButtonSelected]}
          onPress={() => selected ? navigation.navigate('OfficerDashboard') : void handleSelect(item)}
          disabled={savingSelection}
        >
          <Text style={[styles.selectButtonText, selected && styles.selectButtonTextSelected]}>
            {selected ? 'Start Capturing Tests' : 'Select Roadblock'}
          </Text>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <View style={styles.headerTitle}>
          <View style={styles.iconBadge}>
            <MaterialCommunityIcons name="map-marker-path" size={22} color={colors.background} />
          </View>
          <View>
            <Text style={styles.headerLabel}>SHIFT OPERATIONS</Text>
            <Text style={styles.headerSubtitle}>{profile?.name} - {profile?.badgeNumber}</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.iconButton} onPress={() => void refresh()}>
            <Feather name="refresh-cw" size={19} color="#475569" />
          </Pressable>
          <Pressable style={styles.iconButton} onPress={() => { void handleLogout(); }}>
            <Feather name="log-out" size={20} color="#475569" />
          </Pressable>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.currentCard}>
          <View style={styles.currentHeader}>
            <View>
              <Text style={styles.sectionLabel}>CURRENT ROADBLOCK</Text>
              <Text style={styles.currentTitle}>{selectedShift?.roadblockName ?? 'No roadblock selected'}</Text>
            </View>
            <Ionicons
              name={selectedShift ? 'checkmark-circle' : 'alert-circle-outline'}
              size={28}
              color={selectedShift ? colors.success : colors.warning}
            />
          </View>
          <Text style={styles.currentText}>
            {selectedShift
              ? `${selectedShift.station} - ${formatDateTime(selectedShift.startsAt)} to ${formatDateTime(selectedShift.endsAt)}`
              : 'Select an active roadblock before capturing a roadside test.'}
          </Text>
          {selectedShift && (
            <Pressable style={styles.clearButton} onPress={() => void handleClear()}>
              <Text style={styles.clearButtonText}>Clear Selection</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.workflowGrid}>
          <View style={styles.workflowCard}>
            <Text style={styles.workflowValue}>{todayCount}</Text>
            <Text style={styles.workflowLabel}>Today</Text>
          </View>
          <View style={styles.workflowCard}>
            <Text style={styles.workflowValue}>{weekCount}</Text>
            <Text style={styles.workflowLabel}>This week</Text>
          </View>
          <View style={styles.workflowCard}>
            <Text style={[styles.workflowValue, pendingCount > 0 && styles.workflowWarning]}>{pendingCount}</Text>
            <Text style={styles.workflowLabel}>Pending sync</Text>
          </View>
          <View style={styles.workflowCard}>
            <Text style={[styles.workflowValue, failedCount > 0 && styles.workflowError]}>{failedCount}</Text>
            <Text style={styles.workflowLabel}>Failed sync</Text>
          </View>
        </View>

        <Pressable
          style={[styles.syncButton, isSyncing && styles.buttonDisabled]}
          onPress={() => void forceSync()}
          disabled={isSyncing}
        >
          {isSyncing ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="cloud" size={16} color="#fff" />}
          <Text style={styles.syncButtonText}>{isSyncing ? 'Syncing...' : 'Force Sync Pending Records'}</Text>
        </Pressable>

        {error && (
          <View style={styles.errorCard}>
            <Feather name="alert-triangle" size={15} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Text style={styles.listTitle}>Assigned active roadblocks</Text>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primaryDark} />
          </View>
        ) : shifts.length === 0 ? (
          <View style={styles.emptyCard}>
            <Feather name="map" size={42} color="#cbd5e1" />
            <Text style={styles.emptyTitle}>No Active Assignments</Text>
            <Text style={styles.emptyText}>Ask your supervisor to assign you to a current roadblock shift.</Text>
          </View>
        ) : (
          <FlatList
            data={shifts}
            renderItem={renderShift}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      <OfficerBottomNav active="OfficerShifts" />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.pageBackground
  },
  header: {
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
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
  iconBadge: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerLabel: {
    fontSize: 12,
    color: colors.textPrimary,
    fontWeight: '700',
    letterSpacing: 1.5
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  iconButton: {
    padding: 8
  },
  content: {
    flex: 1,
    padding: 20,
    paddingBottom: 0
  },
  currentCard: {
    backgroundColor: colors.background,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: 14
  },
  currentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  sectionLabel: {
    fontSize: 10,
    color: colors.neutralGray,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 4
  },
  currentTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.textPrimary
  },
  currentText: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary
  },
  clearButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surfaceHighlight
  },
  clearButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary
  },
  workflowGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12
  },
  workflowCard: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight
  },
  workflowValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary
  },
  workflowWarning: {
    color: colors.warning
  },
  workflowError: {
    color: colors.error
  },
  workflowLabel: {
    marginTop: 4,
    fontSize: 10,
    color: colors.neutralGray,
    fontWeight: '700',
    textAlign: 'center'
  },
  syncButton: {
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.primaryDark,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12
  },
  syncButtonText: {
    color: colors.background,
    fontWeight: '800',
    fontSize: 13
  },
  buttonDisabled: {
    opacity: 0.65
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.errorBackground,
    borderWidth: 1,
    borderColor: colors.errorBorder,
    marginBottom: 12
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: colors.errorText,
    lineHeight: 17
  },
  listTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 0.8,
    marginBottom: 10
  },
  loadingContainer: {
    paddingVertical: 48,
    alignItems: 'center'
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    borderRadius: 20,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderLight
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary
  },
  emptyText: {
    marginTop: 6,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary
  },
  listContent: {
    paddingBottom: 110
  },
  shiftCard: {
    backgroundColor: colors.background,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: 12
  },
  shiftCardSelected: {
    borderColor: colors.successBorder,
    backgroundColor: colors.successBackground
  },
  shiftHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12
  },
  shiftTitleBlock: {
    flex: 1
  },
  shiftTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary
  },
  shiftSubtitle: {
    marginTop: 3,
    fontSize: 12,
    color: colors.textSecondary
  },
  statusBadge: {
    borderRadius: 999,
    backgroundColor: colors.surfaceHighlight,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  statusBadgeSelected: {
    backgroundColor: colors.successBorder
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textSecondary
  },
  statusTextSelected: {
    color: colors.successText
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 6
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17
  },
  notesBlock: {
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: colors.surfaceHighlight,
    padding: 10
  },
  notesText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17
  },
  selectButton: {
    marginTop: 14,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryDark
  },
  selectButtonSelected: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.successBorder
  },
  selectButtonText: {
    color: colors.background,
    fontSize: 13,
    fontWeight: '800'
  },
  selectButtonTextSelected: {
    color: colors.successText
  }
});
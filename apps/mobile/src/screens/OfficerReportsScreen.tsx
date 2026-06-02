import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../lib/AuthContext';
import { useSync } from '../lib/SyncContext';
import { getAllTests, type LocalTestRecord } from '../db/repository';
import { invalidateTest } from '../services/api';
import { OfficerBottomNav } from '../components/OfficerBottomNav';

type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  OfficerDashboard: undefined;
  OfficerReports: undefined;
  Audit: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, 'OfficerReports'>;

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function syncStatusLabel(status: string): { label: string; color: string; icon: string } {
  if (status === 'synced') return { label: 'Synced', color: '#16a34a', icon: 'check-circle' };
  if (status === 'pending_sync') return { label: 'Pending', color: '#f59e0b', icon: 'cloud-off' };
  if (status === 'failed') return { label: 'Failed', color: '#dc2626', icon: 'alert-circle' };
  return { label: 'Unknown', color: '#64748b', icon: 'help-circle' };
}

export function OfficerReportsScreen({ navigation }: Props) {
  const { profile, signOut } = useAuth();
  const { pendingCount, failedCount, syncedCount } = useSync();
  const [tests, setTests] = useState<LocalTestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [invalidateModalVisible, setInvalidateModalVisible] = useState(false);
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);
  const [invalidationReason, setInvalidationReason] = useState('');
  const [isInvalidating, setIsInvalidating] = useState(false);

  useEffect(() => {
    loadTests();
  }, []);

  const loadTests = async () => {
    setLoading(true);
    try {
      const data = await getAllTests(profile?.officerId ?? null);
      setTests(data);
    } catch (error) {
      console.error('Failed to load tests:', error);
    } finally {
      setLoading(false);
    }
  };

  const openInvalidateModal = (testId: string) => {
    setSelectedTestId(testId);
    setInvalidationReason('');
    setInvalidateModalVisible(true);
  };

  const handleInvalidate = async () => {
    if (!selectedTestId || !invalidationReason.trim()) {
      Alert.alert('Reason required', 'Please provide a reason for invalidating this test.');
      return;
    }

    setIsInvalidating(true);
    try {
      await invalidateTest(
        selectedTestId,
        invalidationReason.trim(),
        profile
          ? {
              officerId: profile.officerId ?? null,
              officerName: `${profile.name} ${profile.surname}`.trim(),
              badgeNumber: profile.badgeNumber
            }
          : undefined
      );
      Alert.alert('Success', 'Test has been marked as invalid.');
      setInvalidateModalVisible(false);
      setSelectedTestId(null);
      setInvalidationReason('');
      await loadTests();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to invalidate test';
      Alert.alert('Invalidation failed', message);
    } finally {
      setIsInvalidating(false);
    }
  };

  const renderTest = ({ item }: { item: LocalTestRecord }) => {
    const syncInfo = syncStatusLabel(item.syncStatus);
    const isFailed = item.result === 'fail';

    return (
      <View style={styles.testCard}>
        <View style={styles.testHeader}>
          <View style={styles.testDriver}>
            <Text style={styles.driverName}>{item.driverName}</Text>
            <Text style={styles.driverId}>ID: {item.driverId}</Text>
          </View>
          <View style={[styles.resultBadge, isFailed ? styles.resultFail : styles.resultPass]}>
            <Text style={[styles.resultText, isFailed ? styles.resultTextFail : styles.resultTextPass]}>
              {isFailed ? 'FAILED' : 'PASSED'}
            </Text>
          </View>
        </View>

        <View style={styles.testDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>BAC Reading</Text>
            <Text style={styles.detailValue}>{item.bacReading.toFixed(3)} g/100ml</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Timestamp</Text>
            <Text style={styles.detailValue}>{formatTimestamp(item.createdAt)}</Text>
          </View>
          {item.originalTestId && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Retest</Text>
              <Text style={styles.detailValue}>Yes</Text>
            </View>
          )}
        </View>

        <View style={styles.syncRow}>
          <Feather name={syncInfo.icon as any} size={14} color={syncInfo.color} />
          <Text style={[styles.syncText, { color: syncInfo.color }]}>{syncInfo.label}</Text>
          {item.syncedAt && (
            <Text style={styles.syncedAt}>· {formatTimestamp(item.syncedAt)}</Text>
          )}
        </View>

        {item.syncStatus === 'synced' && (
          <Pressable
            style={styles.invalidateButton}
            onPress={() => openInvalidateModal(item.id)}
          >
            <Feather name="alert-triangle" size={14} color="#dc2626" />
            <Text style={styles.invalidateText}>Mark as Invalid</Text>
          </Pressable>
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
            <Text style={styles.headerLabel}>MY REPORTS</Text>
            <Text style={styles.headerSubtitle}>{profile?.name} • {profile?.badgeNumber}</Text>
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

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <View style={[styles.statDot, { backgroundColor: '#22c55e' }]} />
          <Text style={styles.statLabel}>Synced</Text>
          <Text style={styles.statValue}>{syncedCount}</Text>
        </View>
        <View style={styles.statCard}>
          <View style={[styles.statDot, { backgroundColor: '#f59e0b' }]} />
          <Text style={styles.statLabel}>Pending</Text>
          <Text style={styles.statValue}>{pendingCount}</Text>
        </View>
        <View style={styles.statCard}>
          <View style={[styles.statDot, { backgroundColor: '#ef4444' }]} />
          <Text style={styles.statLabel}>Failed</Text>
          <Text style={styles.statValue}>{failedCount}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4338ca" />
        </View>
      ) : tests.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Feather name="file-text" size={48} color="#cbd5e1" />
          <Text style={styles.emptyTitle}>No Test Records</Text>
          <Text style={styles.emptySubtitle}>
            Your test history will appear here after you complete roadside stops.
          </Text>
        </View>
      ) : (
        <FlatList
          data={tests}
          renderItem={renderTest}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      <OfficerBottomNav active="OfficerReports" />

      <Modal
        visible={invalidateModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setInvalidateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Feather name="alert-triangle" size={20} color="#dc2626" />
              <Text style={styles.modalTitle}>Invalidate Test Record</Text>
            </View>

            <Text style={styles.modalDescription}>
              This will mark the test record as invalid. This action cannot be undone and will be logged in the audit trail.
            </Text>

            <Text style={styles.inputLabel}>Reason for invalidation</Text>
            <TextInput
              value={invalidationReason}
              onChangeText={setInvalidationReason}
              placeholder="e.g., Equipment malfunction, procedural error..."
              placeholderTextColor="#94a3b8"
              multiline
              numberOfLines={4}
              style={styles.reasonInput}
              textAlignVertical="top"
            />

            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelButton}
                onPress={() => setInvalidateModalVisible(false)}
                disabled={isInvalidating}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalConfirmButton, isInvalidating && styles.buttonDisabled]}
                onPress={handleInvalidate}
                disabled={isInvalidating}
              >
                {isInvalidating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalConfirmText}>Invalidate</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    padding: 8
  },
  headerLabel: {
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '700',
    letterSpacing: 1.5
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2
  },
  signOutButton: {
    padding: 8
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    padding: 20
  },
  statCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  statDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginBottom: 8
  },
  statLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 4
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a'
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
    paddingHorizontal: 40
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 16,
    marginBottom: 8
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20
  },
  listContent: {
    padding: 20,
    paddingBottom: 100
  },
  testCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  testHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16
  },
  testDriver: {
    flex: 1
  },
  driverName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4
  },
  driverId: {
    fontSize: 13,
    color: '#64748b'
  },
  resultBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12
  },
  resultPass: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0'
  },
  resultFail: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca'
  },
  resultText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5
  },
  resultTextPass: {
    color: '#16a34a'
  },
  resultTextFail: {
    color: '#dc2626'
  },
  testDetails: {
    marginBottom: 16
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  detailLabel: {
    fontSize: 13,
    color: '#64748b'
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a'
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9'
  },
  syncText: {
    fontSize: 12,
    fontWeight: '600'
  },
  syncedAt: {
    fontSize: 11,
    color: '#94a3b8'
  },
  invalidateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca'
  },
  invalidateText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#dc2626'
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    width: '100%',
    maxWidth: 400,
    padding: 24,
    shadowColor: '#0f172a',
    shadowOpacity: 0.15,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a'
  },
  modalDescription: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 19,
    marginBottom: 20
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 0.5,
    marginBottom: 8
  },
  reasonInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 14,
    fontSize: 14,
    color: '#0f172a',
    minHeight: 100,
    marginBottom: 20
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569'
  },
  modalConfirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalConfirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff'
  },
  buttonDisabled: {
    opacity: 0.6
  }
});

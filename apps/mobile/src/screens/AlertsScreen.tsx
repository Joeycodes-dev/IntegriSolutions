import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, Text, TextInput, View } from 'react-native';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OfficerBottomNav } from '../components/OfficerBottomNav';
import { useAuth } from '../lib/AuthContext';
import { useAlertsContext } from '../lib/AlertsContext';
import { reportAlertMatchWithEscalation } from '../services/api';
import type { OperationalAlert } from '../types';
import { colors } from '../styles/colors';
import { alertPriorityStyle } from '../lib/alertPriorityStyle';
import { LocationInput, EMPTY_LOCATION_VALUE, type LocationInputValue } from '../components/LocationInput';
import { isValidLatitude, isValidLongitude } from '../lib/geo';
import { styles } from './AlertsScreen.styles';

type RootStackParamList = {
  OfficerDashboard: undefined;
  Alerts: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, 'Alerts'>;

/**
 * This is an escalation signal only — it does not confirm that the person or vehicle
 * is wanted, stolen, arrested, or otherwise legally determined. Follow your unit's
 * operational procedure and escalate to the appropriate authority. This system does
 * not determine what action, if any, is lawful.
 */
export const MATCH_ESCALATION_DISCLAIMER =
  "This is an escalation signal only — it does not confirm that the person or vehicle is wanted, stolen, arrested, or otherwise legally determined. Follow your unit's operational procedure and escalate to the appropriate authority. This system does not determine what action, if any, is lawful.";

const ALERT_TYPE_LABELS: Record<string, string> = {
  bolo_person: 'BOLO — Person',
  bolo_vehicle: 'BOLO — Vehicle',
  hazard: 'Hazard',
  general: 'General'
};

function provenanceLabel(alert: OperationalAlert): string {
  if (alert.sourceType === 'external') {
    return `External — ${alert.sourceAuthority ?? 'Unknown authority'} (Ref: ${alert.sourceReference ?? 'n/a'})`;
  }
  return 'Internal Operational Alert';
}

export function AlertsScreen({ navigation: _navigation }: Props) {
  const { profile } = useAuth();
  const { alerts, loading, error, refresh, acknowledge } = useAlertsContext();
  const [ackingId, setAckingId] = useState<string | null>(null);
  const [matchFormAlertId, setMatchFormAlertId] = useState<string | null>(null);
  const [matchNotes, setMatchNotes] = useState('');
  const [matchLocation, setMatchLocation] = useState<LocationInputValue>(EMPTY_LOCATION_VALUE);
  const [submittingMatch, setSubmittingMatch] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const handleAcknowledge = async (alert: OperationalAlert) => {
    setAckingId(alert.id);
    try {
      await acknowledge(alert.id);
    } catch (err) {
      Alert.alert('Acknowledge failed', err instanceof Error ? err.message : 'Could not acknowledge this alert.');
    } finally {
      setAckingId(null);
    }
  };

  const openMatchForm = (alertId: string) => {
    setMatchFormAlertId(alertId);
    setMatchNotes('');
    setMatchLocation(EMPTY_LOCATION_VALUE);
  };

  const closeMatchForm = () => {
    setMatchFormAlertId(null);
    setMatchNotes('');
    setMatchLocation(EMPTY_LOCATION_VALUE);
  };

  const submitMatch = async (alert: OperationalAlert) => {
    if (!matchNotes.trim()) {
      Alert.alert('Notes required', 'Describe what you observed before reporting a possible match.');
      return;
    }

    const lat = matchLocation.lat.trim() ? Number(matchLocation.lat) : undefined;
    const lng = matchLocation.lng.trim() ? Number(matchLocation.lng) : undefined;
    if (lat !== undefined && !isValidLatitude(lat)) {
      Alert.alert('Invalid location', 'Latitude must be a number between -90 and 90.');
      return;
    }
    if (lng !== undefined && !isValidLongitude(lng)) {
      Alert.alert('Invalid location', 'Longitude must be a number between -180 and 180.');
      return;
    }
    const location = lat !== undefined && lng !== undefined ? { lat, lng } : undefined;

    setSubmittingMatch(true);
    try {
      const result = await reportAlertMatchWithEscalation(
        { id: alert.id, description: alert.description, alertType: alert.alertType, priority: alert.priority },
        matchNotes.trim(),
        profile ? { name: profile.name, surname: profile.surname } : undefined,
        location
      );
      closeMatchForm();
      if (result.escalated) {
        Alert.alert('Reported', 'Your possible match report has been sent for escalation.');
      } else {
        Alert.alert(
          'Report saved — escalation not sent',
          `Your possible match report was recorded, but the emergency chat notification could not be sent (${result.escalationError ?? 'unknown error'}). Notify your supervisor directly.`
        );
      }
    } catch (err) {
      Alert.alert('Report failed', err instanceof Error ? err.message : 'Could not report this possible match.');
    } finally {
      setSubmittingMatch(false);
    }
  };

  const renderAlert = ({ item }: { item: OperationalAlert }) => {
    const acknowledged = Boolean(item.acknowledgedAt);
    const formOpen = matchFormAlertId === item.id;
    const priorityStyle = alertPriorityStyle(item.priority);

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <View style={styles.badgeRow}>
              <View style={styles.typeBadge}>
                <Text style={styles.typeBadgeText}>{ALERT_TYPE_LABELS[item.alertType] ?? item.alertType}</Text>
              </View>
              <View style={[styles.typeBadge, { backgroundColor: priorityStyle.background, borderWidth: 1, borderColor: priorityStyle.border }]}>
                <Text style={[styles.typeBadgeText, { color: priorityStyle.labelText }]}>{item.priority.toUpperCase()}</Text>
              </View>
              <View style={[styles.provenanceBadge, item.sourceType === 'external' && styles.provenanceBadgeExternal]}>
                <Text style={[styles.provenanceBadgeText, item.sourceType === 'external' && styles.provenanceBadgeTextExternal]}>
                  {provenanceLabel(item)}
                </Text>
              </View>
            </View>
            <Text style={styles.description}>{item.description}</Text>
          </View>
          {acknowledged && (
            <View style={styles.ackBadge}>
              <Text style={styles.ackBadgeText}>ACKNOWLEDGED</Text>
            </View>
          )}
        </View>

        {item.vehicleRegistration && <Text style={styles.detailRow}>Vehicle: {item.vehicleRegistration} — {item.vehicleDescription ?? 'no description'}</Text>}
        {item.personName && <Text style={styles.detailRow}>Person: {item.personName} — {item.personDescription ?? 'no description'}</Text>}
        {item.personReference && <Text style={styles.detailRow}>Reference: {item.personReference}</Text>}
        {item.locationLabel && <Text style={styles.detailRow}>Location: {item.locationLabel}</Text>}
        <Text style={styles.detailRow}>Issued by {item.issuedByName}</Text>

        {item.photoUrl && <Image source={{ uri: item.photoUrl }} style={styles.photo} resizeMode="cover" />}

        <View style={styles.actionsRow}>
          <Pressable
            style={[styles.ackButton, (acknowledged || ackingId === item.id) && styles.ackButtonDisabled]}
            onPress={() => void handleAcknowledge(item)}
            disabled={acknowledged || ackingId === item.id}
          >
            {ackingId === item.id ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.ackButtonText}>{acknowledged ? 'Acknowledged' : 'Acknowledge'}</Text>
            )}
          </Pressable>
          <Pressable style={styles.matchButton} onPress={() => openMatchForm(item.id)}>
            <Text style={styles.matchButtonText}>Report Possible Match</Text>
          </Pressable>
        </View>

        {formOpen && (
          <View style={styles.matchForm}>
            <Text style={styles.disclaimerText}>{MATCH_ESCALATION_DISCLAIMER}</Text>
            <TextInput
              style={styles.matchInput}
              placeholder="What did you observe? (required)"
              placeholderTextColor="#94a3b8"
              multiline
              value={matchNotes}
              onChangeText={setMatchNotes}
            />
            <View style={{ marginTop: 10 }}>
              <LocationInput value={matchLocation} onChange={setMatchLocation} />
            </View>
            <Pressable
              style={styles.matchSubmitButton}
              onPress={() => void submitMatch(item)}
              disabled={submittingMatch}
            >
              {submittingMatch ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.matchSubmitButtonText}>Send Report</Text>}
            </Pressable>
            <Pressable style={styles.matchCancelButton} onPress={closeMatchForm}>
              <Text style={styles.matchCancelButtonText}>Cancel</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <View style={styles.headerTitle}>
          <View style={styles.iconBadge}>
            <MaterialCommunityIcons name="bullhorn-outline" size={22} color={colors.background} />
          </View>
          <View>
            <Text style={styles.headerLabel}>OPERATIONAL ALERTS</Text>
            <Text style={styles.headerSubtitle}>{profile?.name} — {profile?.badgeNumber}</Text>
          </View>
        </View>
        <Pressable style={styles.iconButton} onPress={() => void refresh()}>
          <Feather name="refresh-cw" size={19} color="#475569" />
        </Pressable>
      </View>

      <View style={styles.content}>
        {error && (
          <View style={styles.errorCard}>
            <Feather name="alert-triangle" size={15} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primaryDark} />
          </View>
        ) : alerts.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="shield-checkmark-outline" size={42} color="#cbd5e1" />
            <Text style={styles.emptyTitle}>No Active Alerts</Text>
            <Text style={styles.emptyText}>You'll see BOLO, hazard, and general operational alerts here as they're issued.</Text>
          </View>
        ) : (
          <FlatList
            data={alerts}
            renderItem={renderAlert}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      <OfficerBottomNav active="Alerts" />
    </View>
  );
}

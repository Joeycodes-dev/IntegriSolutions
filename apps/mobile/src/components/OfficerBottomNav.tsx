import React from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { styles } from './OfficerBottomNav.styles';
import { colors } from '../styles/colors';
import { useChatUnreadCount } from '../lib/useChatUnreadCount';
import { useAlertsContext } from '../lib/AlertsContext';
import { summarizeAlertsForHome } from '../lib/homeAlertsSummary';
import { formatAlertBadgeCount } from '../lib/alertBadge';
import { OFFICER_BOTTOM_NAV_TABS, type OfficerTab } from '../lib/officerBottomNavTabs';

export type { OfficerTab };

interface Props {
  active: OfficerTab;
}

export function OfficerBottomNav({ active }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const unreadCount = useChatUnreadCount(active !== 'EmergencyChat');
  // Reuses the same shared alert state (and the same active/unacknowledged/
  // unexpired eligibility rule) as the Home summary — no separate fetch.
  const { alerts } = useAlertsContext();
  const unacknowledgedAlertCount = summarizeAlertsForHome(alerts).totalUnacknowledged;

  return (
    <View style={styles.bottomNav}>
      {OFFICER_BOTTOM_NAV_TABS.map((tab) => {
        const isActive = tab.key === active;
        const color = isActive ? colors.primaryDark : colors.neutralGray;
        const iconName = isActive ? tab.iconNameActive : tab.iconName;

        return (
          <Pressable
            key={tab.key}
            style={styles.navItem}
            hitSlop={8}
            onPress={() => {
              Keyboard.dismiss();
              if (!isActive) {
                navigation.navigate(tab.route);
              }
            }}
          >
            {tab.iconLib === 'feather' ? (
              <Feather name={iconName as any} size={24} color={color} />
            ) : (
              <Ionicons name={iconName as any} size={24} color={color} />
            )}
            {tab.key === 'EmergencyChat' && unreadCount > 0 && (
              <View pointerEvents="none" style={styles.unreadPill}>
                <Text style={styles.unreadPillText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
              </View>
            )}
            {tab.key === 'Alerts' && unacknowledgedAlertCount > 0 && (
              <View pointerEvents="none" style={styles.unreadPill}>
                <Text style={styles.unreadPillText}>{formatAlertBadgeCount(unacknowledgedAlertCount)}</Text>
              </View>
            )}
            <Text style={[isActive ? styles.navLabel : styles.navLabelInactive]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

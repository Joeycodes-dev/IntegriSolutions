import React from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { styles } from './OfficerBottomNav.styles';
import { colors } from '../styles/colors';
import { useChatUnreadCount } from '../lib/useChatUnreadCount';

export type OfficerTab = 'OfficerDashboard' | 'OfficerReports' | 'OfficerShifts' | 'EmergencyChat' | 'Audit';

interface TabConfig {
  key: OfficerTab;
  label: string;
  iconLib: 'feather' | 'ionicons';
  iconName: string;
  iconNameActive: string;
  route: 'OfficerDashboard' | 'OfficerReports' | 'OfficerShifts' | 'EmergencyChat' | 'Audit';
}

const TABS: TabConfig[] = [
  {
    key: 'EmergencyChat',
    label: 'Chat',
    iconLib: 'ionicons',
    iconName: 'chatbubble-ellipses-outline',
    iconNameActive: 'chatbubble-ellipses',
    route: 'EmergencyChat'
  },
  {
    key: 'OfficerDashboard',
    label: 'Home',
    iconLib: 'ionicons',
    iconName: 'home-outline',
    iconNameActive: 'home',
    route: 'OfficerDashboard'
  },
  {
    key: 'OfficerReports',
    label: 'Reports',
    iconLib: 'ionicons',
    iconName: 'bar-chart-outline',
    iconNameActive: 'bar-chart',
    route: 'OfficerReports'
  },
  {
    key: 'OfficerShifts',
    label: 'Shifts',
    iconLib: 'ionicons',
    iconName: 'briefcase-outline',
    iconNameActive: 'briefcase',
    route: 'OfficerShifts'
  },
  {
    key: 'Audit',
    label: 'Audit',
    iconLib: 'ionicons',
    iconName: 'shield-outline',
    iconNameActive: 'shield',
    route: 'Audit'
  }
];

interface Props {
  active: OfficerTab;
}

export function OfficerBottomNav({ active }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const unreadCount = useChatUnreadCount(active !== 'EmergencyChat');

  return (
    <View style={styles.bottomNav}>
      {TABS.map((tab) => {
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
            <Text style={[isActive ? styles.navLabel : styles.navLabelInactive]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

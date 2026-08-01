import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { styles } from './OfficerBottomNav.styles';
import { colors } from '../styles/colors';

export type OfficerTab = 'OfficerDashboard' | 'OfficerReports' | 'OfficerShifts' | 'Audit';

interface TabConfig {
  key: OfficerTab;
  label: string;
  iconLib: 'feather' | 'ionicons';
  iconName: string;
  iconNameActive: string;
  route: 'OfficerDashboard' | 'OfficerReports' | 'OfficerShifts' | 'Audit';
}

const TABS: TabConfig[] = [
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
    iconLib: 'feather',
    iconName: 'shield',
    iconNameActive: 'shield',
    route: 'Audit'
  }
];

interface Props {
  active: OfficerTab;
}

export function OfficerBottomNav({ active }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();

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
            onPress={() => {
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
            <Text style={[isActive ? styles.navLabel : styles.navLabelInactive]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

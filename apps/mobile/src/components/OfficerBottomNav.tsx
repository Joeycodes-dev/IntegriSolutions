import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export type OfficerTab = 'OfficerDashboard' | 'OfficerReports' | 'Audit';

interface TabConfig {
  key: OfficerTab;
  label: string;
  iconLib: 'feather' | 'ionicons';
  iconName: string;
  iconNameActive: string;
  route: 'OfficerDashboard' | 'OfficerReports' | 'Audit';
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
        const color = isActive ? '#4338ca' : '#94a3b8';
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

const styles = StyleSheet.create({
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingVertical: 8
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6
  },
  navLabel: {
    fontSize: 11,
    color: '#4338ca',
    marginTop: 4,
    fontWeight: '600'
  },
  navLabelInactive: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 4
  }
});

export type OfficerTab = 'OfficerDashboard' | 'OfficerReports' | 'OfficerShifts' | 'Alerts' | 'EmergencyChat' | 'Audit';

export interface OfficerTabConfig {
  key: OfficerTab;
  label: string;
  iconLib: 'feather' | 'ionicons';
  iconName: string;
  iconNameActive: string;
  route: OfficerTab;
}

/** Order: Home | Alerts | Chat | Reports | Shifts | Audit. */
export const OFFICER_BOTTOM_NAV_TABS: OfficerTabConfig[] = [
  {
    key: 'OfficerDashboard',
    label: 'Home',
    iconLib: 'ionicons',
    iconName: 'home-outline',
    iconNameActive: 'home',
    route: 'OfficerDashboard'
  },
  {
    key: 'Alerts',
    label: 'Alerts',
    iconLib: 'ionicons',
    iconName: 'megaphone-outline',
    iconNameActive: 'megaphone',
    route: 'Alerts'
  },
  {
    key: 'EmergencyChat',
    label: 'Chat',
    iconLib: 'ionicons',
    iconName: 'chatbubble-ellipses-outline',
    iconNameActive: 'chatbubble-ellipses',
    route: 'EmergencyChat'
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

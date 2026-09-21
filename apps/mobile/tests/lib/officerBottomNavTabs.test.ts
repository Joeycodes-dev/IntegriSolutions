import { OFFICER_BOTTOM_NAV_TABS } from '../../src/lib/officerBottomNavTabs';

describe('officer bottom nav order', () => {
  it('orders tabs as Home | Alerts | Chat | Reports | Shifts | Audit', () => {
    expect(OFFICER_BOTTOM_NAV_TABS.map((tab) => tab.label)).toEqual([
      'Home',
      'Alerts',
      'Chat',
      'Reports',
      'Shifts',
      'Audit'
    ]);
  });

  it('keeps Home as the first tab', () => {
    expect(OFFICER_BOTTOM_NAV_TABS[0].key).toBe('OfficerDashboard');
    expect(OFFICER_BOTTOM_NAV_TABS[0].route).toBe('OfficerDashboard');
  });

  it('keeps Alerts second', () => {
    expect(OFFICER_BOTTOM_NAV_TABS[1].key).toBe('Alerts');
    expect(OFFICER_BOTTOM_NAV_TABS[1].route).toBe('Alerts');
  });

  it('keeps Chat third', () => {
    expect(OFFICER_BOTTOM_NAV_TABS[2].key).toBe('EmergencyChat');
    expect(OFFICER_BOTTOM_NAV_TABS[2].route).toBe('EmergencyChat');
  });

  it('preserves the same routes and icons — only order changed', () => {
    const byKey = Object.fromEntries(OFFICER_BOTTOM_NAV_TABS.map((tab) => [tab.key, tab]));
    expect(byKey.OfficerDashboard).toMatchObject({ iconName: 'home-outline', iconNameActive: 'home', route: 'OfficerDashboard' });
    expect(byKey.Alerts).toMatchObject({ iconName: 'megaphone-outline', iconNameActive: 'megaphone', route: 'Alerts' });
    expect(byKey.EmergencyChat).toMatchObject({ iconName: 'chatbubble-ellipses-outline', iconNameActive: 'chatbubble-ellipses', route: 'EmergencyChat' });
    expect(byKey.OfficerReports).toMatchObject({ iconName: 'bar-chart-outline', iconNameActive: 'bar-chart', route: 'OfficerReports' });
    expect(byKey.OfficerShifts).toMatchObject({ iconName: 'briefcase-outline', iconNameActive: 'briefcase', route: 'OfficerShifts' });
    expect(byKey.Audit).toMatchObject({ iconName: 'shield-outline', iconNameActive: 'shield', route: 'Audit' });
  });
});

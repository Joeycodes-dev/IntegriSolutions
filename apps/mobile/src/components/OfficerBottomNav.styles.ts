import { StyleSheet } from 'react-native';
import { colors } from '../styles/colors';

export const styles = StyleSheet.create({
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    minHeight: 66,
    paddingTop: 8,
    paddingBottom: 10
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    position: 'relative'
  },
  navLabel: {
    fontSize: 11,
    color: colors.primaryDark,
    marginTop: 4,
    fontWeight: '600'
  },
  navLabelInactive: {
    fontSize: 11,
    color: colors.neutralGray,
    marginTop: 4
  },
  unreadPill: {
    position: 'absolute',
    top: 4,
    right: 14,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4
  },
  unreadPillText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700'
  }
});
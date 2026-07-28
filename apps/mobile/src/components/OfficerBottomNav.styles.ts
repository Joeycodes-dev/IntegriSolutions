import { StyleSheet } from 'react-native';
import { colors } from '../styles/colors';

export const styles = StyleSheet.create({
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingVertical: 8
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6
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
  }
});
import { StyleSheet } from 'react-native';
import { colors } from '../styles/colors';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.pageBackground,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.primaryDark,
    marginBottom: 12,
    textAlign: 'center'
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 24,
    textAlign: 'center'
  }
});
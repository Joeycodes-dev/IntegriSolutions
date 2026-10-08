import { StyleSheet } from 'react-native';
import { colors } from '../styles/colors';

export const styles = StyleSheet.create({
  bar: {
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    minHeight: 38,
  },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBlock: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 34,
  },
  shortTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  syncButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronButton: {
    width: 28,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailPanel: {
    paddingTop: 10,
    paddingBottom: 12,
    gap: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  detailBody: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  pinnedHint: {
    fontSize: 11,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  syncNowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 11,
    backgroundColor: colors.primaryDark,
  },
  /**
   * Nothing is queued, so the primary slot is de-emphasised: the officer should
   * see that no action is needed rather than a big call-to-action that does
   * nothing. The Sync Centre link beside it stays fully prominent.
   */
  syncNowButtonIdle: {
    backgroundColor: colors.borderLight,
  },
  syncNowButtonText: {
    color: colors.background,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  centreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 11,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderHighlight,
  },
  centreButtonText: {
    color: colors.accentBlue,
    fontSize: 12,
    fontWeight: '700',
  },
});

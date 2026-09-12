import { Platform, StyleSheet } from 'react-native';
import { colors } from '../styles/colors';

export const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.pageBackground
  },
  header: {
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingTop: Platform.OS === 'android' ? 50 : 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  iconBadge: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerLabel: {
    fontSize: 12,
    color: colors.textPrimary,
    fontWeight: '700',
    letterSpacing: 1.5
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2
  },
  iconButton: {
    padding: 8
  },
  content: {
    flex: 1,
    padding: 20,
    paddingBottom: 0
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.errorBackground,
    borderWidth: 1,
    borderColor: colors.errorBorder,
    marginBottom: 12
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: colors.errorText,
    lineHeight: 17
  },
  loadingContainer: {
    paddingVertical: 48,
    alignItems: 'center'
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    borderRadius: 20,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderLight
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary
  },
  emptyText: {
    marginTop: 6,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary
  },
  listContent: {
    paddingBottom: 110
  },
  card: {
    backgroundColor: colors.background,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: 12
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8
  },
  typeBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.surfaceHighlight
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 0.4
  },
  priorityBadgeHigh: {
    backgroundColor: colors.errorBackground,
    borderWidth: 1,
    borderColor: colors.errorBorder
  },
  priorityBadgeHighText: {
    color: colors.errorText
  },
  priorityBadgeMedium: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A'
  },
  priorityBadgeMediumText: {
    color: colors.warning
  },
  priorityBadgeLow: {
    backgroundColor: colors.surfaceHighlight
  },
  provenanceBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.successBackground,
    borderWidth: 1,
    borderColor: colors.successBorder
  },
  provenanceBadgeExternal: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE'
  },
  provenanceBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.successText
  },
  provenanceBadgeTextExternal: {
    color: '#1D4ED8'
  },
  description: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 20,
    marginTop: 2
  },
  detailRow: {
    marginTop: 8,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17
  },
  photo: {
    marginTop: 10,
    width: '100%',
    height: 160,
    borderRadius: 14,
    backgroundColor: colors.surfaceHighlight
  },
  ackBadge: {
    borderRadius: 999,
    backgroundColor: colors.successBorder,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  ackBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.successText
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14
  },
  ackButton: {
    flex: 1,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryDark
  },
  ackButtonDisabled: {
    opacity: 0.6
  },
  ackButtonText: {
    color: colors.background,
    fontSize: 13,
    fontWeight: '800'
  },
  matchButton: {
    flex: 1,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.errorBorder
  },
  matchButtonText: {
    color: colors.errorText,
    fontSize: 13,
    fontWeight: '800'
  },
  matchForm: {
    marginTop: 14,
    borderRadius: 14,
    backgroundColor: colors.surfaceHighlight,
    padding: 12
  },
  disclaimerText: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSecondary,
    marginBottom: 10
  },
  matchInput: {
    minHeight: 64,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.background,
    padding: 10,
    fontSize: 13,
    color: colors.textPrimary,
    textAlignVertical: 'top'
  },
  matchSubmitButton: {
    marginTop: 10,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.error
  },
  matchSubmitButtonText: {
    color: colors.background,
    fontSize: 13,
    fontWeight: '800'
  },
  matchCancelButton: {
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
    height: 32
  },
  matchCancelButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary
  }
});

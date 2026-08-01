import { StyleSheet, Platform } from 'react-native';
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
    fontSize: 11,
    fontWeight: '700',
    color: colors.primaryDark,
    letterSpacing: 1
  },
  headerSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2
  },
  signOutButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center'
  },
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 8
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary
  },
  summaryLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: 6
  },
  filterChipActive: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primaryDark
  },
  filterLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500'
  },
  filterLabelActive: {
    color: colors.background
  },
  filterBadge: {
    minWidth: 22,
    paddingHorizontal: 6,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center'
  },
  filterBadgeActive: {
    backgroundColor: colors.whiteOverlay
  },
  filterBadgeText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600'
  },
  filterBadgeTextActive: {
    color: colors.background
  },
  appendOnlyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: colors.surfaceHighlight,
    borderRadius: 8
  },
  appendOnlyText: {
    flex: 1,
    fontSize: 11,
    color: colors.textSecondary
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 8
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: 8
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18
  },
  listContent: {
    padding: 16,
    paddingBottom: 100
  },
  eventCard: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: 10
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  actionIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  eventHeaderText: {
    flex: 1
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary
  },
  actionRaw: {
    fontSize: 11,
    color: colors.neutralGray,
    marginTop: 2
  },
  outcomeDot: {
    width: 10,
    height: 10,
    borderRadius: 5
  },
  message: {
    fontSize: 13,
    color: colors.textPrimary,
    marginTop: 10,
    lineHeight: 18
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6
  },
  metaText: {
    fontSize: 12,
    color: colors.textSecondary,
    flex: 1
  },
  metadataBlock: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceHighlight
  },
  metadataTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.neutralGray,
    letterSpacing: 1,
    marginBottom: 6
  },
  metadataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 2
  },
  metadataKey: {
    fontSize: 12,
    color: colors.textSecondary,
    flex: 0.4
  },
  metadataValue: {
    fontSize: 12,
    color: colors.textPrimary,
    flex: 0.6,
    textAlign: 'right'
  }
});
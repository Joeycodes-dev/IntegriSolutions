import { StyleSheet } from 'react-native';
import { colors } from '../styles/colors';

export const styles = StyleSheet.create({
  safeArea: {
    flex: 1
  },
  overlay: {
    flex: 1,
    backgroundColor: colors.modalOverlay,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12
  },
  sheet: {
    width: '100%',
    height: '94%',
    maxWidth: 720,
    backgroundColor: colors.background,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: colors.primaryDark,
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 14
  },
  header: {
    backgroundColor: colors.primaryDark,
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  headerLeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerText: {
    flex: 1,
    minWidth: 0
  },
  headerEyebrow: {
    color: 'rgba(255, 255, 255, 0.62)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4
  },
  headerTitle: {
    color: colors.background,
    fontSize: 20,
    fontWeight: '800',
    marginTop: 2,
    letterSpacing: -0.2
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center'
  },
  statusHero: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
    borderRadius: 22,
    backgroundColor: colors.instrumentPanel,
    borderWidth: 1,
    padding: 18,
    gap: 16
  },
  statusHeroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  statusHeroIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  statusHeroText: {
    flex: 1,
    minWidth: 0
  },
  statusHeroTitle: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '800'
  },
  statusHeroDetail: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3
  },
  statusMetaRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
    paddingTop: 12,
    gap: 10
  },
  statusMetaItem: {
    flex: 1,
    minWidth: 0
  },
  statusMetaLabel: {
    color: 'rgba(255, 255, 255, 0.48)',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.7
  },
  statusMetaValue: {
    color: colors.background,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    marginTop: 4
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.45
  },
  statusPillPending: {
    backgroundColor: 'rgba(245, 158, 11, 0.14)'
  },
  statusPillError: {
    backgroundColor: 'rgba(220, 38, 38, 0.14)'
  },
  statusPillTextPending: {
    color: colors.warning
  },
  statusPillTextError: {
    color: colors.errorText
  },
  lastRunBanner: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderHighlight,
    backgroundColor: colors.surfaceHighlight,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8
  },
  lastRunText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600'
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.pageBackground
  },
  tabButton: {
    flex: 1,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingTop: 8,
    paddingBottom: 9,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent'
  },
  tabButtonActive: {
    borderBottomColor: colors.primaryDark,
    backgroundColor: colors.background
  },
  tabIconWrap: {
    minWidth: 26,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center'
  },
  tabBadge: {
    position: 'absolute',
    top: -5,
    right: -9,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryDark
  },
  tabBadgeText: {
    color: colors.background,
    fontSize: 8,
    fontWeight: '800'
  },
  tabLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700'
  },
  tabLabelActive: {
    color: colors.primaryDark
  },
  body: {
    flex: 1,
    backgroundColor: colors.pageBackground
  },
  bodyContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 32
  },
  section: {
    backgroundColor: colors.background,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: 16
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800'
  },
  sectionDescription: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4
  },
  metricGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14
  },
  metricCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 15,
    backgroundColor: colors.pageBackground,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: 8,
    paddingVertical: 11,
    alignItems: 'center'
  },
  metricSuccess: {
    backgroundColor: colors.successBackground,
    borderColor: colors.successBorder
  },
  metricWarning: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FCD34D'
  },
  metricError: {
    backgroundColor: colors.errorBackground,
    borderColor: colors.errorBorder
  },
  metricIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  metricValue: {
    color: colors.textPrimary,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '800',
    marginTop: 7
  },
  metricLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
    textAlign: 'center'
  },
  actionCard: {
    backgroundColor: colors.background,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: 16,
    gap: 12
  },
  actionCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12
  },
  actionCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center'
  },
  actionCardText: {
    flex: 1,
    minWidth: 0
  },
  actionCardTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800'
  },
  actionCardDetail: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 3
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 15,
    backgroundColor: colors.primaryDark,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16
  },
  primaryButtonText: {
    color: colors.background,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center'
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderHighlight,
    backgroundColor: colors.pageBackground,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14
  },
  secondaryButtonText: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center'
  },
  buttonDisabled: {
    opacity: 0.6
  },
  textButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8
  },
  textButtonText: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '800'
  },
  infoList: {
    marginTop: 12,
    borderRadius: 15,
    backgroundColor: colors.pageBackground,
    padding: 12,
    gap: 10
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9
  },
  infoText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600'
  },
  notice: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8
  },
  noticeSuccess: {
    backgroundColor: colors.successBackground,
    borderColor: colors.successBorder
  },
  noticeError: {
    backgroundColor: colors.errorBackground,
    borderColor: colors.errorBorder
  },
  noticeInfo: {
    backgroundColor: colors.surfaceHighlight,
    borderColor: colors.borderHighlight
  },
  noticeText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600'
  },
  queueCard: {
    backgroundColor: colors.background,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: 14,
    gap: 12
  },
  queueCardError: {
    borderColor: colors.errorBorder
  },
  queueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  queueIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: colors.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center'
  },
  queueIconError: {
    backgroundColor: colors.errorBackground
  },
  queueText: {
    flex: 1,
    minWidth: 0
  },
  queueTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800'
  },
  queueMeta: {
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3
  },
  attemptRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 5
  },
  attemptText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600'
  },
  errorBox: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 4
  },
  errorBoxError: {
    backgroundColor: colors.errorBackground,
    borderColor: colors.errorBorder
  },
  errorBoxInfo: {
    backgroundColor: colors.surfaceHighlight,
    borderColor: colors.borderHighlight
  },
  errorTitle: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '800'
  },
  errorDetail: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18
  },
  serverMessage: {
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4
  },
  safetyNote: {
    borderRadius: 14,
    backgroundColor: colors.surfaceHighlight,
    borderWidth: 1,
    borderColor: colors.borderHighlight,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9
  },
  safetyText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600'
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    backgroundColor: colors.background,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: 13
  },
  activityDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginTop: 4,
    backgroundColor: colors.success
  },
  activityDotError: {
    backgroundColor: colors.error
  },
  activityText: {
    flex: 1,
    minWidth: 0
  },
  activityTitle: {
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700'
  },
  activityMeta: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 5
  },
  emptyState: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },
  emptyIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: colors.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 14
  },
  emptyDetail: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 5
  },
  loadingState: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600'
  },
  footer: {
    minHeight: 48,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center'
  }
});

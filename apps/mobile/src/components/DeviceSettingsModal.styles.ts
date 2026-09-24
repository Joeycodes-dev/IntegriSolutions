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
  handleZone: {
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryDark
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.35)'
  },
  header: {
    backgroundColor: colors.primaryDark,
    paddingHorizontal: 22,
    paddingTop: 12,
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
  deviceHero: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
    borderRadius: 22,
    backgroundColor: colors.instrumentPanel,
    borderWidth: 1,
    padding: 18,
    gap: 14
  },
  deviceHeroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  deviceHeroIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  deviceHeroText: {
    flex: 1
  },
  deviceHeroTitle: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '800'
  },
  deviceHeroDetail: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3
  },
  deviceHeroBadge: {
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
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6
  },
  statusChipText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  statusChipWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.14)'
  },
  statusChipSuccess: {
    backgroundColor: 'rgba(34, 197, 94, 0.14)'
  },
  statusChipError: {
    backgroundColor: 'rgba(220, 38, 38, 0.14)'
  },
  statusChipTextWarning: {
    color: colors.warning
  },
  statusChipTextSuccess: {
    color: colors.successText
  },
  statusChipTextError: {
    color: colors.errorText
  },
  signalRailHero: {
    height: 42,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4
  },
  signalRailHeroEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  signalRailHeroEmptyText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 11,
    fontWeight: '600'
  },
  signalBarHero: {
    flex: 1,
    minWidth: 3,
    borderRadius: 999
  },
  deviceHeroStats: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
    paddingTop: 12,
    gap: 10
  },
  deviceHeroStat: {
    flex: 1
  },
  deviceHeroStatLabel: {
    color: 'rgba(255, 255, 255, 0.52)',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8
  },
  deviceHeroStatValue: {
    color: colors.background,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4
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
  sectionCard: {
    backgroundColor: colors.background,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: 18,
    gap: 14
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10
  },
  sectionHeaderText: {
    flex: 1
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
  connectionSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.pageBackground,
    borderWidth: 1,
    borderColor: colors.borderLight
  },
  connectionIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center'
  },
  connectionText: {
    flex: 1
  },
  connectionTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800'
  },
  connectionDetail: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 3
  },
  connectionMeta: {
    color: colors.neutralGray,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4
  },
  inlineMessage: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12
  },
  inlineMessageSuccess: {
    backgroundColor: colors.successBackground,
    borderColor: colors.successBorder
  },
  inlineMessageError: {
    backgroundColor: colors.errorBackground,
    borderColor: colors.errorBorder
  },
  inlineMessageInfo: {
    backgroundColor: colors.surfaceHighlight,
    borderColor: colors.borderHighlight
  },
  inlineMessageText: {
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600'
  },
  actionGrid: {
    gap: 10
  },
  primaryButton: {
    minHeight: 54,
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
    minHeight: 52,
    borderRadius: 15,
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
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center'
  },
  buttonDisabled: {
    opacity: 0.65
  },
  loadingState: {
    minHeight: 76,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600'
  },
  iconActionButton: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHighlight
  },
  deviceRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.pageBackground
  },
  deviceIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHighlight
  },
  deviceIconPreferred: {
    backgroundColor: colors.primaryDark
  },
  deviceRowText: {
    flex: 1
  },
  deviceRowTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  deviceName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    flexShrink: 1
  },
  savedBadge: {
    color: colors.successText,
    backgroundColor: colors.successBackground,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    overflow: 'hidden'
  },
  deviceAddress: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3
  },
  deviceMeta: {
    color: colors.neutralGray,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3
  },
  rowAction: {
    minHeight: 48,
    minWidth: 88,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: colors.surfaceHighlight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5
  },
  rowActionDisabled: {
    opacity: 0.65
  },
  rowActionText: {
    color: colors.primaryDark,
    fontSize: 11,
    fontWeight: '800'
  },
  emptyState: {
    minHeight: 124,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  emptyStateTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 3,
    textAlign: 'center'
  },
  emptyStateText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center'
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4
  },
  toggleText: {
    flex: 1
  },
  toggleLabel: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800'
  },
  toggleDetail: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3
  },
  noteCard: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.surfaceHighlight,
    borderWidth: 1,
    borderColor: colors.borderHighlight
  },
  noteText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18
  },
  stepList: {
    gap: 14
  },
  stepRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12
  },
  stepNumber: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryDark
  },
  stepNumberText: {
    color: colors.background,
    fontSize: 14,
    fontWeight: '800'
  },
  stepText: {
    flex: 1,
    paddingTop: 1
  },
  stepTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800'
  },
  stepDetail: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3
  },
  calibrationHero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.primaryDark
  },
  calibrationHeroLabel: {
    color: 'rgba(255, 255, 255, 0.58)',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8
  },
  calibrationHeroValue: {
    color: colors.background,
    fontSize: 22,
    fontWeight: '800',
    marginTop: 4
  },
  calibrationVersionPill: {
    maxWidth: 170,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.12)'
  },
  calibrationVersionText: {
    color: colors.background,
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'right'
  },
  readinessList: {
    gap: 8
  },
  readinessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 32
  },
  readinessText: {
    flex: 1
  },
  readinessLabel: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700'
  },
  readinessDetail: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2
  },
  readinessStatus: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  readinessStatusOk: {
    color: colors.successText
  },
  readinessStatusWaiting: {
    color: colors.warning
  },
  helperText: {
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 16
  },
  profileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  metricTile: {
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 74,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.pageBackground,
    padding: 10
  },
  metricTileSuccess: {
    borderColor: colors.successBorder,
    backgroundColor: colors.successBackground
  },
  metricTileWarning: {
    borderColor: colors.alertHighBorder,
    backgroundColor: colors.alertHighBackground
  },
  metricTileError: {
    borderColor: colors.errorBorder,
    backgroundColor: colors.errorBackground
  },
  metricLabel: {
    color: colors.textSecondary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6
  },
  metricValue: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    marginTop: 5
  },
  metricDetail: {
    color: colors.textSecondary,
    fontSize: 10,
    marginTop: 3
  },
  inputGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  inputField: {
    flexGrow: 1,
    flexBasis: '46%'
  },
  inputLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginBottom: 6
  },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.pageBackground,
    paddingHorizontal: 12,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600'
  },
  errorText: {
    color: colors.errorText,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600'
  },
  previewRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-end'
  },
  previewField: {
    flex: 1
  },
  previewOutput: {
    flex: 1,
    minHeight: 74,
    borderRadius: 14,
    backgroundColor: colors.primaryDark,
    padding: 10,
    justifyContent: 'center'
  },
  previewOutputLabel: {
    color: 'rgba(255, 255, 255, 0.58)',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6
  },
  previewOutputValue: {
    color: colors.background,
    fontSize: 19,
    fontWeight: '800',
    marginTop: 3
  },
  previewOutputDetail: {
    color: 'rgba(255, 255, 255, 0.68)',
    fontSize: 10,
    marginTop: 2
  },
  targetGrid: {
    flexDirection: 'row',
    gap: 8
  },
  targetChip: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: colors.surfaceHighlight,
    padding: 9
  },
  targetLabel: {
    color: colors.textPrimary,
    fontSize: 10,
    fontWeight: '800'
  },
  targetValue: {
    color: colors.textSecondary,
    fontSize: 10,
    marginTop: 3
  },
  livePreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingTop: 4
  },
  currentSampleValue: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 3
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48
  },
  historyIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: colors.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center'
  },
  historyText: {
    flex: 1
  },
  historyTitle: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '800'
  },
  historyDetail: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2
  },
  historySource: {
    color: colors.neutralGray,
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'right'
  },
  textButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  textButtonDanger: {
    color: colors.errorText,
    fontSize: 12,
    fontWeight: '800'
  },
  statusChipRow: {
    flexDirection: 'row',
    gap: 8
  },
  signalRail: {
    height: 84,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    borderRadius: 14,
    backgroundColor: colors.pageBackground,
    padding: 10
  },
  signalRailEmpty: {
    flex: 1,
    textAlign: 'center',
    color: colors.neutralGray,
    fontSize: 11,
    fontWeight: '600'
  },
  signalBar: {
    flex: 1,
    minWidth: 3,
    borderRadius: 999
  },
  diagnosticResult: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1
  },
  diagnosticResultOk: {
    backgroundColor: colors.successBackground,
    borderColor: colors.successBorder
  },
  diagnosticResultError: {
    backgroundColor: colors.errorBackground,
    borderColor: colors.errorBorder
  },
  diagnosticResultText: {
    flex: 1
  },
  diagnosticResultTitle: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '800'
  },
  diagnosticResultDetail: {
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2
  },
  policyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 32
  },
  policyLabel: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '700'
  },
  policyValue: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '800'
  },
  linkText: {
    color: colors.accentBlue,
    fontSize: 12,
    fontWeight: '800'
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    backgroundColor: colors.background
  },
  footerText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 10,
    lineHeight: 14
  },
  footerButton: {
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center'
  },
  footerButtonText: {
    color: colors.background,
    fontSize: 12,
    fontWeight: '800'
  }
});


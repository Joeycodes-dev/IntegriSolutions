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
    paddingBottom: 16,
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
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2
  },
  headerTitle: {
    color: colors.background,
    fontSize: 19,
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

  // ---- Status hero (always visible under the header) ----
  statusHero: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 10,
    borderRadius: 20,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: 16,
    gap: 10
  },
  statusHeroPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  statusHeroTitleBlock: {
    flex: 1,
    gap: 2
  },
  statusHeroTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '800'
  },
  statusHeroMeta: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2
  },
  statusHeroDetail: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3
  },

  // ---- Setup stepper ----
  setupStepper: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8
  },
  stepperCaption: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700'
  },
  stepperCaptionSuccess: {
    color: colors.successText
  },
  stepperItems: {
    flexDirection: 'row',
    gap: 8
  },
  stepperItem: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    minHeight: 44
  },
  stepperCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.borderLight
  },
  stepperCircleDone: {
    backgroundColor: colors.success,
    borderColor: colors.success
  },
  stepperCircleCurrent: {
    borderColor: colors.accentBlue
  },
  stepperCircleAttention: {
    backgroundColor: colors.error,
    borderColor: colors.error
  },
  stepperCircleOptional: {
    borderStyle: 'dashed',
    borderColor: colors.borderHighlight
  },
  stepperDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.accentBlue
  },
  stepperLabel: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center'
  },
  stepperLabelMuted: {
    color: colors.textSecondary
  },
  stepperOptionalText: {
    color: colors.neutralGray,
    fontSize: 12,
    fontWeight: '600'
  },
  stepperDetail: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17
  },

  // ---- Tabs ----
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.pageBackground
  },
  tabButton: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingTop: 6,
    paddingBottom: 7,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent'
  },
  tabButtonActive: {
    borderBottomColor: colors.primaryDark,
    backgroundColor: colors.background
  },
  tabLabel: {
    color: colors.textSecondary,
    fontSize: 12,
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

  // ---- Inline banner ----
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  inlineMessage: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 8
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
    flex: 1,
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600'
  },
  bannerDismiss: {
    minHeight: 44,
    alignItems: 'flex-end',
    justifyContent: 'center'
  },
  bannerDismissText: {
    color: colors.accentBlue,
    fontSize: 12,
    fontWeight: '800'
  },

  // ---- Section cards ----
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
    flex: 1,
    minWidth: 0
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
  subSectionTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2
  },

  // ---- Buttons ----
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
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center'
  },
  secondaryButton: {
    minHeight: 50,
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
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center'
  },
  buttonDisabled: {
    opacity: 0.65
  },
  actionGrid: {
    gap: 10
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
  textButtonLabel: {
    color: colors.primaryDark,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center'
  },

  // ---- Connected row ----
  connectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.successBackground,
    borderWidth: 1,
    borderColor: colors.successBorder
  },
  connectedDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.success
  },
  connectedText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700'
  },

  // ---- Device rows ----
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
    flex: 1,
    minWidth: 0
  },
  deviceRowTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap'
  },
  deviceName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    flexShrink: 1
  },
  deviceAddress: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3
  },
  deviceMeta: {
    color: colors.neutralGray,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3
  },
  rowAction: {
    minHeight: 48,
    minWidth: 88,
    paddingHorizontal: 12,
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
    fontSize: 12,
    fontWeight: '800'
  },
  deviceTag: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1
  },
  deviceTagConnected: {
    backgroundColor: colors.successBackground,
    borderColor: colors.successBorder
  },
  deviceTagSaved: {
    backgroundColor: colors.surfaceHighlight,
    borderColor: colors.borderHighlight
  },
  deviceTagText: {
    fontSize: 12,
    fontWeight: '800'
  },
  deviceTagConnectedText: {
    color: colors.successText
  },
  deviceTagSavedText: {
    color: colors.textSecondary
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

  // ---- Numbered steps (plain text) ----
  numberedStep: {
    gap: 4
  },
  numberedStepText: {
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 20
  },

  // ---- Toggle rows ----
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
    minHeight: 48
  },
  toggleText: {
    flex: 1,
    minWidth: 0
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

  // ---- Notes ----
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
  warningNote: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.alertHighBackground,
    borderWidth: 1,
    borderColor: colors.alertHighBorder
  },
  warningNoteText: {
    flex: 1,
    color: colors.alertHighAccent,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600'
  },
  footnote: {
    paddingHorizontal: 4
  },
  footnoteText: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17
  },

  // ---- Disclosure ----
  disclosureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minHeight: 44
  },
  disclosureTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '800'
  },
  disclosureInlineToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
    paddingHorizontal: 4
  },
  disclosureContent: {
    gap: 14,
    paddingTop: 4
  },

  // ---- Chips ----
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  chip: {
    flexGrow: 1,
    flexBasis: '30%',
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    gap: 3
  },
  chipSuccess: {
    backgroundColor: colors.successBackground,
    borderColor: colors.successBorder
  },
  chipWarning: {
    backgroundColor: colors.alertHighBackground,
    borderColor: colors.alertHighBorder
  },
  chipDanger: {
    backgroundColor: colors.errorBackground,
    borderColor: colors.errorBorder
  },
  chipNeutral: {
    backgroundColor: colors.surfaceHighlight,
    borderColor: colors.borderHighlight
  },
  chipLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700'
  },
  chipValue: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800'
  },

  // ---- Read-only summary rows ----
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minHeight: 36,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingVertical: 6
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1
  },
  summaryValue: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800'
  },

  // ---- Input fields ----
  inputGrid: {
    gap: 12
  },
  fieldBlock: {
    gap: 4
  },
  fieldLabel: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700'
  },
  fieldHint: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17
  },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.pageBackground,
    paddingHorizontal: 12,
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600'
  },
  inputLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6
  },
  errorText: {
    color: colors.errorText,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600'
  },

  // ---- Calibration hero ----
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
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4
  },
  calibrationHeroValue: {
    color: colors.background,
    fontSize: 24,
    fontWeight: '800',
    marginTop: 4
  },
  calibrationHeroMeta: {
    color: 'rgba(255, 255, 255, 0.68)',
    fontSize: 12,
    marginTop: 2
  },
  calibrationVersionPill: {
    maxWidth: 170,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.12)'
  },
  calibrationVersionText: {
    color: colors.background,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right'
  },

  // ---- Raw-value target chips ----
  targetGrid: {
    flexDirection: 'row',
    gap: 8
  },
  targetChip: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: colors.surfaceHighlight,
    padding: 10
  },
  targetLabel: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '800'
  },
  targetValue: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 3
  },
  previewOutput: {
    backgroundColor: colors.primaryDark,
    borderRadius: 14,
    padding: 12,
    gap: 3
  },
  previewOutputLabel: {
    color: 'rgba(255, 255, 255, 0.62)',
    fontSize: 12,
    fontWeight: '800'
  },
  previewOutputValue: {
    color: colors.background,
    fontSize: 20,
    fontWeight: '800'
  },
  previewOutputDetail: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontSize: 12
  },
  previewField: {
    gap: 6
  },

  // ---- Live stat blocks ----
  statRow: {
    flexDirection: 'row',
    gap: 10
  },
  statBlock: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.pageBackground,
    padding: 12,
    gap: 4
  },
  statBlockSuccess: {
    backgroundColor: colors.successBackground,
    borderColor: colors.successBorder
  },
  statBlockWarning: {
    backgroundColor: colors.alertHighBackground,
    borderColor: colors.alertHighBorder
  },
  statBlockLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700'
  },
  statBlockValue: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '800'
  },
  statBlockValueWarning: {
    color: colors.alertHighAccent
  },

  // ---- Trend chip ----
  trendChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1
  },
  trendChipUp: {
    backgroundColor: colors.alertLowBackground,
    borderColor: colors.alertLowBorder
  },
  trendChipNeutral: {
    backgroundColor: colors.surfaceHighlight,
    borderColor: colors.borderHighlight
  },
  trendChipText: {
    fontSize: 12,
    fontWeight: '800'
  },
  trendChipTextUp: {
    color: colors.accentBlue
  },
  trendChipTextNeutral: {
    color: colors.textSecondary
  },

  // ---- Blow-state guidance box ----
  guidanceBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 4
  },
  guidanceBoxSuccess: {
    backgroundColor: colors.successBackground,
    borderColor: colors.successBorder
  },
  guidanceBoxWarning: {
    backgroundColor: colors.alertHighBackground,
    borderColor: colors.alertHighBorder
  },
  guidanceBoxDanger: {
    backgroundColor: colors.errorBackground,
    borderColor: colors.errorBorder
  },
  guidanceBoxNeutral: {
    backgroundColor: colors.surfaceHighlight,
    borderColor: colors.borderHighlight
  },
  guidanceTitle: {
    fontSize: 15,
    fontWeight: '800'
  },
  guidanceTitleSuccess: {
    color: colors.successText
  },
  guidanceTitleWarning: {
    color: colors.alertHighAccent
  },
  guidanceTitleDanger: {
    color: colors.errorText
  },
  guidanceTitleNeutral: {
    color: colors.textPrimary
  },
  guidanceDetail: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19
  },

  chartCaption: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2
  },

  // ---- Readiness checks ----
  readinessList: {
    gap: 8
  },
  readinessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44
  },
  readinessText: {
    flex: 1,
    minWidth: 0
  },
  readinessLabel: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700'
  },
  readinessDetail: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2
  },
  readinessStatus: {
    fontSize: 12,
    fontWeight: '800'
  },
  readinessStatusOk: {
    color: colors.successText
  },
  readinessStatusWaiting: {
    color: colors.warning
  },
  readinessSummary: {
    fontSize: 14,
    fontWeight: '800'
  },
  readinessSummaryOk: {
    color: colors.successText
  },
  readinessSummaryWarn: {
    color: colors.textSecondary
  },

  // ---- Metric grid ----
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  metricTile: {
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 78,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.pageBackground,
    padding: 12,
    gap: 4
  },
  metricTileFull: {
    flexBasis: '100%'
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
    fontSize: 12,
    fontWeight: '700'
  },
  metricValue: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800'
  },
  metricDetail: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2
  },

  // ---- Diagnostic result ----
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
    flex: 1,
    minWidth: 0
  },
  diagnosticResultTitle: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '800'
  },
  diagnosticResultDetail: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2
  },

  // ---- History rows ----
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
    flex: 1,
    minWidth: 0
  },
  historyTitle: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '800'
  },
  historyDetail: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2
  },
  historySource: {
    color: colors.neutralGray,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right'
  },

  // ---- Policy rows ----
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

  // ---- Footer ----
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.surfaceHighlight,
    borderWidth: 1,
    borderColor: colors.borderHighlight
  },
  footerText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17
  }
});

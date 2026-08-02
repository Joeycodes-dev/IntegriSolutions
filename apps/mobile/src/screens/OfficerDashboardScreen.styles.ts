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
    justifyContent: 'space-between',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.pageBackground,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  syncBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.warning
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
  signOutButton: {
    padding: 8
  },
  contentScroll: {
    flex: 1
  },
  content: {
    flexGrow: 1,
    padding: 20
  },
  card: {
    backgroundColor: colors.background,
    borderRadius: 24,
    padding: 24,
    shadowColor: colors.primaryDark,
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 7
  },
  cardIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 8
  },
  cardText: {
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: 24
  },
  primaryButton: {
    backgroundColor: colors.primaryDark,
    borderRadius: 16,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10
  },
  primaryButtonText: {
    color: colors.background,
    fontSize: 15,
    fontWeight: '700'
  },
  cameraContainer: {
    flex: 1,
    minHeight: 360,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: colors.black
  },
  camera: {
    flex: 1
  },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderColor: colors.primaryDark,
    borderRadius: 24,
    margin: 20
  },
  scanInstructions: {
    position: 'absolute',
    top: 30,
    left: 20,
    right: 20,
    backgroundColor: colors.overlay,
    borderRadius: 16,
    padding: 12
  },
  scanHint: {
    color: colors.background,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20
  },
  scanActions: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    flexDirection: 'column',
    justifyContent: 'space-between',
    gap: 12
  },
  rawPayloadCard: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: colors.surfaceHighlight,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderHighlight
  },
  rawPayloadText: {
    marginTop: 8,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18
  },
  decryptedCard: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: colors.pageBackground,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderHighlight
  },
  decryptedRow: {
    marginTop: 6,
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 20
  },
  decryptedPreviewCard: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: colors.surfaceHighlight,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderHighlight
  },
  decryptedPreviewText: {
    marginTop: 8,
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 20
  },
  decryptedPreviewHint: {
    marginTop: 10,
    color: colors.textSecondary,
    fontSize: 12
  },
  decryptErrorCard: {
    marginBottom: 20,
    padding: 14,
    backgroundColor: colors.errorBackground,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.errorBorder
  },
  decryptErrorLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.errorText
  },
  decryptErrorText: {
    marginTop: 6,
    color: colors.errorText,
    fontSize: 12,
    lineHeight: 18
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: colors.whiteOverlay,
    alignItems: 'center',
    justifyContent: 'center'
  },
  secondaryButtonText: {
    color: colors.background,
    fontWeight: '700'
  },
  captureButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center'
  },
  captureButtonText: {
    color: colors.background,
    fontWeight: '700'
  },
  profileSummary: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    marginBottom: 20,
    padding: 16,
    backgroundColor: colors.pageBackground,
    borderRadius: 20
  },
  confirmationCard: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: colors.background,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderLight
  },
  confirmationHint: {
    marginBottom: 14,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19
  },
  licenseField: {
    marginBottom: 12
  },
  licenseFieldLabel: {
    marginBottom: 5,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700'
  },
  licenseFieldInput: {
    minHeight: 44,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.neutralGray,
    backgroundColor: colors.pageBackground,
  },
  licenseFieldValue: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700'
  },
  profileIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight
  },
  overline: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.textSecondary,
    marginBottom: 4
  },
  subjectName: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary
  },
  subjectLicense: {
    color: colors.neutralGray,
    fontSize: 12,
    marginTop: 2
  },
  bacSection: {
    marginBottom: 20
  },
  bacInput: {
    marginTop: 12,
    backgroundColor: colors.pageBackground,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 20,
    paddingVertical: 22,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center'
  },
  bacValueText: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center'
  },
  readOnlyHint: {
    marginTop: 8,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center'
  },
  bacSuffix: {
    position: 'absolute',
    right: 26,
    top: 56,
    color: colors.neutralGray,
    fontWeight: '700'
  },
  statusRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20
  },
  statusCard: {
    flex: 1,
    padding: 16,
    backgroundColor: colors.background,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center'
  },
  statusCardAlt: {
    flex: 1,
    padding: 16,
    backgroundColor: colors.surfaceHighlight,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderHighlight,
    alignItems: 'center'
  },
  statusLabel: {
    fontSize: 10,
    color: colors.neutralGray,
    fontWeight: '800',
    letterSpacing: 1
  },
  statusLabelAlt: {
    fontSize: 10,
    color: colors.primaryDark,
    fontWeight: '800',
    letterSpacing: 1
  },
  statusValue: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 6
  },
  statusValueAlt: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.primaryDark,
    marginTop: 6
  },
  courtSection: {
    marginBottom: 20,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.pageBackground,
    borderWidth: 1,
    borderColor: colors.borderLight
  },
  courtFieldLabel: {
    marginTop: 10,
    marginBottom: 6,
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.4
  },
  courtInput: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 10,
    backgroundColor: colors.background,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary
  },
  courtNotesInput: {
    minHeight: 72,
    textAlignVertical: 'top'
  },
  courtReadonly: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 10,
    backgroundColor: colors.surfaceHighlight,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  courtReadonlyText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.background
  },
  categoryChipSelected: {
    borderColor: colors.accentBlue,
    backgroundColor: colors.surfaceHighlight
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary
  },
  categoryChipTextSelected: {
    color: colors.primaryDark
  },
  autoBanner: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderHighlight,
    backgroundColor: colors.surfaceHighlight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  autoBannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    fontWeight: '600'
  },
  ocrDebugCard: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.successBorder,
    backgroundColor: colors.successBackground
  },
  ocrDebugText: {
    marginTop: 4,
    color: colors.textPrimary,
    fontSize: 12,
    lineHeight: 16
  },
  evidenceSection: {
    marginBottom: 20
  },
  evidenceHint: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary
  },
  attachmentGrid: {
    marginTop: 12,
    gap: 10
  },
  attachmentTile: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.background,
    padding: 10
  },
  attachmentLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8
  },
  attachmentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderHighlight,
    backgroundColor: colors.surfaceHighlight,
    borderStyle: 'dashed'
  },
  attachmentButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryDark,
    letterSpacing: 0.5
  },
  attachmentPreview: {
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative'
  },
  attachmentImage: {
    width: '100%',
    height: 140,
    borderRadius: 14
  },
  attachmentRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center'
  },
  photoButton: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderHighlight,
    backgroundColor: colors.surfaceHighlight,
    borderStyle: 'dashed'
  },
  photoButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primaryDark
  },
  photoPreview: {
    marginTop: 12,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative'
  },
  photoImage: {
    width: '100%',
    height: 180,
    borderRadius: 20
  },
  photoRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center'
  },
  actionRow: {
    gap: 12
  },
  abortText: {
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontSize: 12,
    color: colors.textSecondary
  },
  buttonDisabled: {
    opacity: 0.7
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.modalOverlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: colors.background,
    borderRadius: 24,
    width: '100%',
    maxWidth: 340,
    padding: 24,
    shadowColor: colors.primaryDark,
    shadowOpacity: 0.15,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  modalBody: {
    gap: 12,
    marginBottom: 16,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: colors.pageBackground,
    borderRadius: 14,
  },
  modalDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  modalLabel: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  modalValue: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  modalFooterText: {
    fontSize: 12,
    color: colors.neutralGray,
  },
  modalSyncButton: {
    backgroundColor: colors.primaryDark,
    borderRadius: 14,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  modalSyncButtonText: {
    color: colors.background,
    fontSize: 14,
    fontWeight: '700',
  },
  savedIcon: {
    alignItems: 'center',
    marginBottom: 16
  },
  savedTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8
  },
  savedSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20
  },
  savedDriverCard: {
    backgroundColor: colors.pageBackground,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24
  },
  savedDriverName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 4
  },
  savedDriverId: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4
  },
  secondaryActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: colors.surfaceHighlight,
    borderWidth: 1,
    borderColor: colors.borderHighlight
  },
  secondaryActionText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primaryDark
  },
});
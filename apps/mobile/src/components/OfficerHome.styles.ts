import { StyleSheet } from 'react-native';
import { colors } from '../styles/colors';

export const styles = StyleSheet.create({
  scroll: {
    flex: 1
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 100
  },
  hero: {
    backgroundColor: colors.primaryDark, 
    borderRadius: 24,
    padding: 20,
    paddingTop: 22,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 14
  },
  heroOrbA: {
    position: 'absolute',
    top: -60,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.05)'
  },
  heroOrbB: {
    position: 'absolute',
    bottom: -50,
    left: -30,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.03)'
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.whiteOverlay,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)'
  },
  avatarText: {
    color: colors.background,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5
  },
  dutyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    gap: 6
  },
  dutyDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  dutyText: {
    fontSize: 12,
    fontWeight: '600'
  },
  greeting: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '500'
  },
  heroName: {
    color: colors.background,
    fontSize: 26,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: -0.4
  },
  heroMetaRow: {
    flexDirection: 'row',
    marginTop: 14,
    gap: 14
  },
  heroMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  heroMetaText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '500'
  },
  syncCard: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: 14
  },
  syncCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1
  },
  syncIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center'
  },
  syncIconWrapActive: {
    backgroundColor: colors.borderHighlight
  },
  syncTextBlock: {
    flex: 1
  },
  syncTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary
  },
  syncSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.surfaceHighlight
  },
  syncButtonDisabled: {
    opacity: 0.6
  },
  syncButtonText: {
    color: colors.accentBlue,
    fontSize: 13,
    fontWeight: '600'
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.borderLight
  },
  statCardWarn: {
    borderColor: colors.warning,
    backgroundColor: '#fffbeb'
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.4
  },
  statValueWarn: {
    color: '#b45309'
  },
  statLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600'
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.neutralGray,
    letterSpacing: 1.2,
    marginBottom: 10
  },
  cta: {
    backgroundColor: colors.background,
    borderRadius: 20,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.borderHighlight,
    marginBottom: 22,
    shadowColor: colors.primaryDark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 6
  },
  ctaInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14
  },
  ctaIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center'
  },
  ctaTextBlock: {
    flex: 1
  },
  ctaTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary
  },
  ctaSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  linkText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accentBlue
  },
  recentList: {
    backgroundColor: colors.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: 4,
    marginBottom: 18
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12
  },
  recentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center'
  },
  recentAvatarText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary
  },
  recentBody: {
    flex: 1
  },
  recentTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  recentName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary
  },
  recentResult: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  recentResultPass: {
    backgroundColor: colors.success 
  },
  recentResultFail: {
    backgroundColor: colors.error
  },
  recentResultText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: colors.background
  },
  recentMeta: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2
  },
  recentEmpty: {
    padding: 16
  },
  recentEmptyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary
  },
  recentEmptyText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 3
  },
  tipCard: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceHighlight,
    borderRadius: 16,
    padding: 14,
    gap: 12,
    marginBottom: 18
  },
  tipIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center'
  },
  tipTextBlock: {
    flex: 1
  },
  tipTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accentBlue,
    letterSpacing: 0.5,
    marginBottom: 2
  },
  tipBody: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: 6
  },
  footerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8
  },
  footerLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary
  },
  footerDivider: {
    width: 1,
    height: 18,
    backgroundColor: colors.borderLight
  }
});
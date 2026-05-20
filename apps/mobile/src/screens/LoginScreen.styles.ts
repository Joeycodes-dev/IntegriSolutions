import { StyleSheet } from 'react-native';
import { colors } from '../styles/colors';

export const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },

    page: {
        flex: 1,
    },

    container: {
        flexGrow: 1,
        justifyContent: 'center',
        padding: 24,
    },

    card: {
        backgroundColor: colors.background,
        borderRadius: 24,
        paddingHorizontal: 28,
        paddingVertical: 36,
        shadowColor: colors.primaryDark,
        shadowOpacity: 0.08,
        shadowRadius: 28,
        shadowOffset: { width: 0, height: 14 },
        elevation: 8,
    },

    tabHeader: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 40,
        marginBottom: 35,
    },
    
    tabButton: {
        alignItems: 'center',
        minWidth: 80,
    },

    tabLabel: {
        fontSize: 18,
        fontWeight: '700',
        color: colors.textPrimary,
        opacity: 0.5,
    },

    activeTabLabel: {
        opacity: 1,
    },

    activeIndicator: {
        height: 3,
        width: 30,
        backgroundColor: colors.primaryDark,
        marginTop: 8,
        borderRadius: 2,
    },

    subtitle: {
        textAlign: 'center',
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 40,
    },

    form: {
        marginBottom: 10,
    },

    inputGroup: {
        marginBottom: 20,
    },

    label: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.textPrimary,
        marginBottom: 8,
    },

    input: {
        height: 55,
        borderWidth: 1.5,
        borderColor: colors.inputBorder,
        borderRadius: 12,
        paddingHorizontal: 15,
        fontSize: 16,
        color: colors.textSecondary,
        backgroundColor: colors.background,
    },

    passwordContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 55,
        borderWidth: 1.5,
        borderColor: colors.inputBorder,
        borderRadius: 12,
        paddingHorizontal: 15,
        backgroundColor: colors.background,
    },

    passwordInput: {
        flex: 1,
        fontSize: 16,
        color: colors.textSecondary,
    },

    forgotPassword: {
        alignSelf: 'flex-end',
        marginTop: -10,
        marginBottom: 10,
    },

    linkText: {
        color: colors.accentBlue,
        fontWeight: '600',
        fontSize: 14,
    },

    primaryButton: {
        backgroundColor: colors.primaryDark,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 15,
    },

    buttonDisabled: {
        opacity: 0.7,
    },

    primaryButtonText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '700',
    },

    footerContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 30,
    },

    footerText: {
        color: colors.textSecondary,
        fontSize: 14,
    },

    switchText: {
        color: colors.accentBlue,
        fontWeight: '600',
        fontSize: 14,
    },

    error: {
        color: '#b91c1c',
        textAlign: 'center',
        marginVertical: 10,
        fontWeight: '600',
    },

    dropdownContainer: {
        gap: 6,
        marginBottom: 20,
    },

    dropdownLabel: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.textPrimary,
        marginBottom: 4,
    },

    dropdownRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },

    dropdownButton: {
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 12,
        backgroundColor: colors.background,
        borderWidth: 1.5,
        borderColor: colors.neutralGray,
    },

    dropdownButtonActive: {
        borderColor: colors.primaryDark,
        backgroundColor: 'rgba(13, 37, 63, 0.05)',
    },

    dropdownButtonText: {
        fontSize: 14,
        color: colors.textSecondary,
        fontWeight: '600',
    },

    dropdownButtonTextActive: {
        color: colors.primaryDark,
    },

    devRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginVertical: 15,
        justifyContent: 'center',
    },

    devToggle: {
        width: 44,
        height: 24,
        borderRadius: 999,
        backgroundColor: colors.neutralGray,
        justifyContent: 'center',
        padding: 3,
    },

    devToggleActive: {
        backgroundColor: colors.primaryDark,
    },

    devDot: {
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: '#ffffff',
        alignSelf: 'flex-start',
    },

    devDotActive: {
        alignSelf: 'flex-end',
    },

    devLabel: {
        color: colors.textSecondary,
        fontSize: 14,
        fontWeight: '600',
    },
});
import { StyleSheet } from 'react-native';

import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';

export const applicationReviewStyles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#FFFFFF' },
  safeArea: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: Spacing.four, paddingVertical: Spacing.six, rowGap: Spacing.three },
  content: { alignItems: 'center', rowGap: Spacing.three },
  icon: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BrandColors.navy,
    borderRadius: 36,
  },
  iconRejected: { backgroundColor: '#C0392B' },
  title: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 24,
    lineHeight: 30,
    textAlign: 'center',
  },
  message: {
    color: 'rgba(0, 0, 0, 0.9)',
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  reasonCard: {
    width: '100%',
    backgroundColor: BrandColors.lightGray,
    borderRadius: BorderRadius.lg,
    padding: Spacing.three,
    rowGap: Spacing.one,
  },
  reasonLabel: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  reasonText: {
    color: 'rgba(0, 0, 0, 0.9)',
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  resubmitButton: {
    width: '100%',
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BrandColors.green,
    borderColor: 'rgba(151, 151, 151, 0.5)',
    borderWidth: 1,
    borderRadius: 20,
    marginTop: Spacing.two,
  },
  resubmitButtonDisabled: { opacity: 0.7 },
  resubmitButtonText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
  },
  formSectionTitle: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
    marginTop: Spacing.two,
  },
});

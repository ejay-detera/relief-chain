import { FontAwesome } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';

/**
 * Shown when the Beneficiary's `verification_status` is not "Verified", per
 * Requirement 3.2: directs them to complete identity verification before
 * applying to any Program.
 */
export function VerificationRequiredBanner() {
  return (
    <View style={styles.container}>
      <FontAwesome color={BrandColors.navy} name="info-circle" size={18} style={styles.icon} />
      <ThemedText style={styles.text}>
        Complete identity verification to apply for assistance programs.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BrandColors.lightGray,
    borderRadius: BorderRadius.md,
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.three,
    padding: Spacing.three,
  },
  icon: {
    marginRight: Spacing.two,
  },
  text: {
    flex: 1,
    fontSize: 12,
    color: BrandColors.navy,
    lineHeight: 17,
  },
});

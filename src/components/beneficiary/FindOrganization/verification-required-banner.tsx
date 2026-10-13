import { FontAwesome } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';

/**
 * Informational notice shown when the Beneficiary's `verification_status` is
 * not "Verified". It does not block applying: the database accepts applications
 * from unverified beneficiaries, and the organization reviews the beneficiary's
 * details and documents together with the application.
 */
export function VerificationRequiredBanner() {
  return (
    <View style={styles.container}>
      <FontAwesome color={BrandColors.navy} name="info-circle" size={18} style={styles.icon} />
      <ThemedText style={styles.text}>
        Your identity isn&apos;t verified yet. You can still apply. The organization reviews your details and documents with your application.
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

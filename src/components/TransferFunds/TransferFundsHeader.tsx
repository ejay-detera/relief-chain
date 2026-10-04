import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';

interface TransferFundsHeaderProps {
  availableRcphpFormatted: string;
}

export function TransferFundsHeader({ availableRcphpFormatted }: TransferFundsHeaderProps) {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <FontAwesome color={BrandColors.navy} name="arrow-left" size={16} />
        </Pressable>
        <ThemedText style={styles.title}>Transfer Funds</ThemedText>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.balanceBadge}>
        <View style={styles.balanceDot} />
        <ThemedText style={styles.balanceLabel}>Available Treasury Balance:</ThemedText>
        <ThemedText style={styles.balanceValue}>{availableRcphpFormatted}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.three,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: BrandColors.lightGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 20,
    color: BrandColors.navy,
  },
  placeholder: {
    width: 40,
  },
  balanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: BorderRadius.md,
    gap: Spacing.two,
    alignSelf: 'flex-start',
  },
  balanceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: BrandColors.green,
  },
  balanceLabel: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: BrandColors.navy,
  },
  balanceValue: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: BrandColors.green,
  },
});

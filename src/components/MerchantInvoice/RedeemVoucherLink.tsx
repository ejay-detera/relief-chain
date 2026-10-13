import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';

type Props = Readonly<{ onPress: () => void }>;

/** Secondary action that opens the beneficiary-QR scanner and voucher redemption screen. */
export const RedeemVoucherLink = ({ onPress }: Props) => (
  <View style={styles.block}>
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.button}>
      <MaterialCommunityIcons color={BrandColors.navy} name="qrcode-scan" size={20} />
      <ThemedText style={styles.label}>Scan a beneficiary QR to redeem a voucher</ThemedText>
    </Pressable>
    <ThemedText style={styles.helper}>For vouchers a beneficiary presents in person.</ThemedText>
  </View>
);

const styles = StyleSheet.create({
  block: { gap: Spacing.two },
  button: {
    alignItems: 'center',
    borderColor: BrandColors.navy,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'center',
    padding: Spacing.three,
  },
  label: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, flexShrink: 1, textAlign: 'center' },
  helper: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, textAlign: 'center' },
});

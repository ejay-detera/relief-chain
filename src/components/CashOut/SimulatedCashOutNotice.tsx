import { FontAwesome } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PILOT_NETWORK_LABEL, PILOT_NO_VALUE_LABEL } from '@/constants/pilot-disclosure';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';

/**
 * Mandatory disclosure shown wherever a cash-out is offered. The pilot cash-out is
 * SIMULATED through a partner adapter and is never a real bank or e-wallet
 * transfer; it never moves the confirmed on-chain RCPHP balance (Requirements
 * 6.7, 12.5, 12.7).
 */
export const SimulatedCashOutNotice = () => (
  <View style={styles.container}>
    <FontAwesome color={BrandColors.navy} name="info-circle" size={13} />
    <View style={styles.body}>
      <ThemedText style={styles.title}>Simulated cash-out · {PILOT_NETWORK_LABEL}</ThemedText>
      <ThemedText style={styles.description}>
        This is a simulated partner cash-out for the pilot. It is not a real bank or e-wallet
        transfer and does not move your confirmed on-chain balance. {PILOT_NO_VALUE_LABEL}.
      </ThemedText>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F4F7FC',
    borderColor: BrandColors.lightGray,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.two,
  },
  body: { flex: 1, gap: 2 },
  title: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12 },
  description: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 11,
    lineHeight: 15,
  },
});

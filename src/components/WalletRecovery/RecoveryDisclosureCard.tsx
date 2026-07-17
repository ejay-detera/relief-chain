import { FontAwesome } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { RecoveryDisclosure } from '@/types/wallet-recovery';

type Props = {
  disclosure: RecoveryDisclosure;
};

const WARNING_TINT = '#C0392B';
const WARNING_BACKGROUND = '#FBEAEA';

/**
 * Renders one fixed recovery disclosure. `warning` tone is reserved for the
 * non-recoverable external-cash case so a beneficiary cannot mistake it for a
 * recoverable situation (Requirements 16.6, 16.5).
 */
export const RecoveryDisclosureCard = ({ disclosure }: Props) => {
  const isWarning = disclosure.tone === 'warning';
  return (
    <View style={[styles.card, isWarning ? styles.cardWarning : styles.cardInfo]}>
      <View style={styles.headerRow}>
        <FontAwesome
          color={isWarning ? WARNING_TINT : BrandColors.navy}
          name={isWarning ? 'exclamation-triangle' : 'info-circle'}
          size={16}
        />
        <ThemedText style={[styles.title, isWarning && styles.titleWarning]}>
          {disclosure.title}
        </ThemedText>
      </View>
      <ThemedText style={[styles.body, isWarning && styles.bodyWarning]}>{disclosure.body}</ThemedText>
    </View>
  );
};

const styles = StyleSheet.create({
  card: { borderRadius: BorderRadius.lg, gap: Spacing.two, padding: Spacing.three },
  cardInfo: { backgroundColor: '#FFFFFF', borderColor: BrandColors.lightGray, borderWidth: 1 },
  cardWarning: { backgroundColor: WARNING_BACKGROUND },
  headerRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  title: { color: BrandColors.navy, flex: 1, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14 },
  titleWarning: { color: WARNING_TINT },
  body: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, lineHeight: 19 },
  bodyWarning: { color: WARNING_TINT },
});

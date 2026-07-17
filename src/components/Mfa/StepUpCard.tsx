import { FontAwesome } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { StepUpEvaluation } from '@/types/mfa';
import { formatStepUpRemaining } from '@/utils/step-up';

type Props = {
  evaluation: StepUpEvaluation;
  onReVerify: () => void;
};

/**
 * Shows whether the session holds a fresh recent step-up (Requirement 20.2).
 * Sensitive financial actions — program activation, disbursement authorization,
 * wallet rotation, refunds, cash-out — require a step-up within the last ten
 * minutes. When fresh, it shows the remaining window; otherwise it offers to
 * re-verify. The server still enforces this on submission.
 */
export const StepUpCard = ({ evaluation, onReVerify }: Props) => {
  const fresh = evaluation.isFresh;
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={[styles.iconCircle, fresh ? styles.iconOk : styles.iconWarn]}>
          <FontAwesome color="#FFFFFF" name={fresh ? 'check' : 'clock-o'} size={16} />
        </View>
        <View style={styles.headerText}>
          <ThemedText style={styles.title}>Step-up for financial actions</ThemedText>
          <ThemedText style={styles.subtitle}>
            {fresh
              ? `Verified recently · valid for ${formatStepUpRemaining(evaluation.secondsRemaining)}`
              : 'Re-verify to authorize program activation, disbursements, rotation, refunds, or cash-out.'}
          </ThemedText>
        </View>
      </View>

      {!fresh ? (
        <Pressable accessibilityRole="button" onPress={onReVerify} style={styles.action}>
          <ThemedText style={styles.actionLabel}>Re-verify now</ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    gap: Spacing.three,
    padding: Spacing.four,
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
  },
  headerRow: { alignItems: 'flex-start', flexDirection: 'row', gap: Spacing.three },
  iconCircle: { alignItems: 'center', borderRadius: 999, height: 36, justifyContent: 'center', width: 36 },
  iconOk: { backgroundColor: BrandColors.green },
  iconWarn: { backgroundColor: BrandColors.yellow },
  headerText: { flex: 1, gap: 2 },
  title: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15 },
  subtitle: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, lineHeight: 18 },
  action: {
    alignItems: 'center',
    borderColor: BrandColors.navy,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    paddingVertical: Spacing.two,
  },
  actionLabel: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14 },
});

import { FontAwesome } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { AssuranceSnapshot } from '@/types/mfa';

type Props = {
  isEnabled: boolean;
  assurance: AssuranceSnapshot | null;
  /** Copy tuned to the account kind, e.g. "organization" or "merchant". */
  accountLabel: string;
  onEnroll: () => void;
};

/**
 * Summarizes the account's multi-factor status and current assurance level, and
 * prompts enrollment when MFA is not yet enabled. Organization and merchant
 * accounts must enable MFA before financial operations (Requirement 20.1).
 */
export const MfaStatusCard = ({ isEnabled, assurance, accountLabel, onEnroll }: Props) => {
  const atAal2 = assurance?.currentLevel === 'aal2';

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={[styles.iconCircle, isEnabled ? styles.iconOk : styles.iconWarn]}>
          <FontAwesome color="#FFFFFF" name={isEnabled ? 'shield' : 'exclamation'} size={18} />
        </View>
        <View style={styles.headerText}>
          <ThemedText style={styles.title}>Multi-factor authentication</ThemedText>
          <ThemedText style={styles.subtitle}>
            {isEnabled
              ? `Your ${accountLabel} account is protected with an authenticator app.`
              : `Enable MFA to unlock financial actions for your ${accountLabel} account.`}
          </ThemedText>
        </View>
      </View>

      <View style={styles.statusRow}>
        <ThemedText style={styles.statusLabel}>Current level</ThemedText>
        <View style={[styles.pill, atAal2 ? styles.pillOk : styles.pillNeutral]}>
          <ThemedText style={[styles.pillText, atAal2 ? styles.pillTextOk : styles.pillTextNeutral]}>
            {atAal2 ? 'AAL2 · multi-factor' : 'AAL1 · single-factor'}
          </ThemedText>
        </View>
      </View>

      {!isEnabled ? (
        <Pressable accessibilityRole="button" onPress={onEnroll} style={styles.action}>
          <FontAwesome color="#FFFFFF" name="plus" size={13} />
          <ThemedText style={styles.actionLabel}>Set up authenticator app</ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    gap: Spacing.three,
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
  },
  headerRow: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
  iconCircle: { alignItems: 'center', borderRadius: 999, height: 40, justifyContent: 'center', width: 40 },
  iconOk: { backgroundColor: BrandColors.green },
  iconWarn: { backgroundColor: BrandColors.yellow },
  headerText: { flex: 1, gap: 2 },
  title: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16 },
  subtitle: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, lineHeight: 18 },
  statusRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  statusLabel: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13 },
  pill: { borderRadius: BorderRadius.full, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  pillOk: { backgroundColor: 'rgba(111,202,75,0.18)' },
  pillNeutral: { backgroundColor: BrandColors.lightGray },
  pillText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11 },
  pillTextOk: { color: '#3F7A28' },
  pillTextNeutral: { color: BrandColors.grey },
  action: {
    alignItems: 'center',
    backgroundColor: BrandColors.navy,
    borderRadius: BorderRadius.full,
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'center',
    paddingVertical: Spacing.three,
  },
  actionLabel: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14 },
});

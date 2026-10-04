import { FontAwesome } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PILOT_ASSET_CODE } from '@/constants/pilot-disclosure';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { BeneficiaryProgramEntitlement, ProjectionState } from '@/types/projection';
import type { EnrolledProgram } from '@/types/wallet';
import { formatStroops } from '@/utils/format-stroops';
import { computeVoucherBreakdownAndTotal, isNonCashVoucher } from '@/utils/voucher-balance-calculator';

export { isNonCashVoucher, computeVoucherBreakdownAndTotal };

type Props = {
  /** Reconciled voucher entitlements; the total is only ever derived from these. */
  state: ProjectionState<BeneficiaryProgramEntitlement[]>;
  activeProgramCount: number;
  programs?: readonly EnrolledProgram[];
  onReconcile?: () => void;
  isReconciling?: boolean;
};

const populatedRows = (
  state: ProjectionState<BeneficiaryProgramEntitlement[]>
): readonly BeneficiaryProgramEntitlement[] | null => {
  switch (state.status) {
    case 'current':
    case 'stale':
      return state.data;
    case 'quarantined':
      return state.data ?? null;
    default:
      return null;
  }
};

const placeholderLabel = (status: ProjectionState<unknown>['status']): string => {
  switch (status) {
    case 'loading':
      return 'Loading…';
    case 'unavailable':
      return 'Unavailable';
    case 'quarantined':
      return 'Under review';
    default:
      return 'No voucher balance';
  }
};

export function TotalBalanceCard({
  state,
  activeProgramCount,
  programs,
  onReconcile,
  isReconciling = false,
}: Props) {
  const rows = populatedRows(state);
  const { totalStroops, breakdown, voucherCount } = computeVoucherBreakdownAndTotal(rows, programs);

  const hasProgramsOrRows = (programs && programs.length > 0) || rows !== null;
  const balanceLabel = hasProgramsOrRows
    ? `${formatStroops(totalStroops)} ${PILOT_ASSET_CODE}`
    : placeholderLabel(state.status);

  const displayVoucherCount = voucherCount > 0 ? voucherCount : activeProgramCount;

  return (
    <LinearGradient
      colors={[BrandColors.green, '#4A90D9']}
      style={styles.card}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <View style={styles.topHeader}>
        <ThemedText style={styles.title}>Total Voucher</ThemedText>
        {onReconcile && (
          <Pressable
            accessibilityLabel="Reconcile voucher ledger"
            accessibilityRole="button"
            disabled={isReconciling}
            onPress={onReconcile}
            style={[styles.reconcileButton, isReconciling && styles.reconcileButtonDisabled]}
          >
            {isReconciling ? (
              <ActivityIndicator color="#FFFFFF" size={9} />
            ) : (
              <FontAwesome color="#FFFFFF" name="refresh" size={10} />
            )}
            <ThemedText style={styles.reconcileText}>
              {isReconciling ? 'Syncing…' : 'Reconcile'}
            </ThemedText>
          </Pressable>
        )}
      </View>

      <ThemedText style={styles.balance}>{balanceLabel}</ThemedText>

      {/* Per non-cash voucher breakdown (Food, Gas, Medicine, etc.) */}
      {breakdown.length > 0 && (
        <View style={styles.breakdownContainer}>
          <ThemedText style={styles.breakdownHeader}>Balance by Voucher Type</ThemedText>
          <View style={styles.breakdownGrid}>
            {breakdown.map((item, idx) => (
              <View key={idx} style={styles.breakdownChip}>
                <ThemedText style={styles.breakdownChipLabel} numberOfLines={1}>
                  {item.label}
                </ThemedText>
                <ThemedText style={styles.breakdownChipAmount}>
                  {formatStroops(item.amountStroops)} {PILOT_ASSET_CODE}
                </ThemedText>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={styles.subtitleRow}>
        <ThemedText style={styles.subtitle}>
          Across {displayVoucherCount} active voucher program{displayVoucherCount === 1 ? '' : 's'}
        </ThemedText>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.four,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.one,
  },
  title: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '600',
  },
  reconcileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  reconcileButtonDisabled: {
    opacity: 0.7,
  },
  reconcileText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  balance: {
    color: 'white',
    fontSize: 30,
    fontWeight: 'bold',
    marginBottom: Spacing.one,
  },
  breakdownContainer: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: BorderRadius.md,
    padding: Spacing.two,
    marginVertical: Spacing.two,
  },
  breakdownHeader: {
    color: 'white',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  breakdownGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  breakdownChip: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 6,
  },
  breakdownChipLabel: {
    color: 'white',
    fontSize: 11,
    fontWeight: '600',
    maxWidth: 110,
  },
  breakdownChipAmount: {
    color: 'white',
    fontSize: 11,
    fontWeight: '700',
  },
  subtitleRow: {
    flexDirection: 'row',
    marginTop: Spacing.one,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
  },
});

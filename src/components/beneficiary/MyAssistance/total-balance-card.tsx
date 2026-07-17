import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { ReconciliationBadge } from '@/components/shared/reconciliation-badge';
import { ThemedText } from '@/components/themed-text';
import { PILOT_ASSET_CODE, PILOT_NETWORK_LABEL, PILOT_NO_VALUE_LABEL } from '@/constants/pilot-disclosure';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { type StroopAmount } from '@/types/blockchain';
import type { BeneficiaryProgramEntitlement, ProjectionState } from '@/types/projection';
import { addStroops, formatStroops, ZERO_STROOPS } from '@/utils/format-stroops';

type Props = {
  /** Reconciled voucher entitlements; the total is only ever derived from these. */
  state: ProjectionState<BeneficiaryProgramEntitlement[]>;
  activeProgramCount: number;
};

/** Sums the reconciled available voucher balance across every entitlement row. */
const sumVoucherAvailable = (entitlements: readonly BeneficiaryProgramEntitlement[]): StroopAmount =>
  entitlements
    .filter((entitlement) => entitlement.aidType === 'voucher')
    .reduce<StroopAmount>((acc, entitlement) => addStroops(acc, entitlement.availableStroops), ZERO_STROOPS);

/**
 * Returns the reconciled entitlement rows when the projection is populated, or
 * `null` when there is nothing trustworthy to total. A failed, loading, or empty
 * projection is never converted into a fabricated peso balance (Requirements
 * 18.1, 21.1, 21.2, 21.3).
 */
const populatedRows = (
  state: ProjectionState<BeneficiaryProgramEntitlement[]>,
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
      return 'No reconciled balance';
  }
};

export function TotalBalanceCard({ state, activeProgramCount }: Props) {
  const rows = populatedRows(state);
  const balanceLabel = rows
    ? `${formatStroops(sumVoucherAvailable(rows))} ${PILOT_ASSET_CODE}`
    : placeholderLabel(state.status);

  return (
    <LinearGradient
      colors={[BrandColors.green, '#4A90D9']}
      style={styles.card}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <ThemedText style={styles.title}>Total Voucher Balance</ThemedText>
      <ThemedText style={styles.balance}>{balanceLabel}</ThemedText>
      <View style={styles.subtitleRow}>
        <ThemedText style={styles.subtitle}>
          Across {activeProgramCount} active program{activeProgramCount === 1 ? '' : 's'}
        </ThemedText>
      </View>
      <ReconciliationBadge state={state} tone="light" />
      <ThemedText style={styles.disclosure}>
        {PILOT_NETWORK_LABEL} · {PILOT_NO_VALUE_LABEL}
      </ThemedText>
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
  title: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    marginBottom: Spacing.two,
  },
  balance: {
    color: 'white',
    fontSize: 30,
    fontWeight: 'bold',
    marginBottom: Spacing.one,
  },
  subtitleRow: {
    flexDirection: 'row',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
  },
  disclosure: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 10,
    marginTop: Spacing.two,
    fontWeight: '600',
  },
});

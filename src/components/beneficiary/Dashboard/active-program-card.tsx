import { FontAwesome } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ReconciliationBadge } from '@/components/shared/reconciliation-badge';
import { ThemedText } from '@/components/themed-text';
import { PILOT_ASSET_CODE } from '@/constants/pilot-disclosure';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { BeneficiaryProgramEntitlement, ProjectionState } from '@/types/projection';
import { EnrolledProgram } from '@/types/wallet';
import { formatStroops } from '@/utils/format-stroops';

type Props = {
  program: EnrolledProgram;
  /** Reconciled entitlement for the active program, or null if none is reconciled yet. */
  entitlement: BeneficiaryProgramEntitlement | null;
  /** The parent projection state, used to explain why a balance is not shown. */
  balanceState: ProjectionState<BeneficiaryProgramEntitlement[]>;
  onPress?: () => void;
};

const balancePlaceholder = (status: ProjectionState<unknown>['status']): string => {
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

export function ActiveProgramCard({ program, entitlement, balanceState, onPress }: Props) {
  const balanceLabel = entitlement
    ? `${formatStroops(entitlement.availableStroops)} ${PILOT_ASSET_CODE}`
    : balancePlaceholder(balanceState.status);

  return (
    <View style={styles.container}>
      <ThemedText style={styles.sectionTitle}>Active Program</ThemedText>

      <View style={styles.card}>
        <View style={styles.headerRow}>
          <ThemedText style={styles.name} numberOfLines={1}>{program.name}</ThemedText>
          <Pressable accessibilityLabel="View program details" onPress={onPress}>
            <FontAwesome name="external-link" size={16} color={BrandColors.navy} />
          </Pressable>
        </View>

        <ThemedText style={styles.balanceLabel}>Reconciled Balance</ThemedText>
        <ThemedText style={styles.balanceValue}>{balanceLabel}</ThemedText>
        <ReconciliationBadge state={balanceState} transactionHash={entitlement?.latestTransactionHash} />

        <View style={styles.expiryPill}>
          <FontAwesome name="calendar" size={12} color={BrandColors.navy} />
          <ThemedText style={styles.expiryText}>Expires: {program.expiresAt}</ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.four,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BrandColors.navy,
    marginBottom: Spacing.two,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: BrandColors.navy,
    flex: 1,
    marginRight: Spacing.two,
  },
  balanceLabel: {
    fontSize: 11,
    color: BrandColors.grey,
    marginBottom: 2,
  },
  balanceValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: BrandColors.navy,
    marginBottom: 2,
  },
  expiryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: Spacing.two,
    backgroundColor: 'rgba(17, 46, 88, 0.08)',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    alignSelf: 'flex-start',
    marginTop: Spacing.three,
  },
  expiryText: {
    fontSize: 12,
    fontWeight: '600',
    color: BrandColors.navy,
  },
});

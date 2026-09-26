import { FlatList, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PILOT_ASSET_CODE } from '@/constants/pilot-disclosure';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { BeneficiaryProgramEntitlement } from '@/types/projection';
import { formatStroops } from '@/utils/format-stroops';

type Props = {
  abandoned: readonly BeneficiaryProgramEntitlement[];
};

const keyExtractor = (item: BeneficiaryProgramEntitlement): string => item.programId;

const renderItem = ({ item }: { item: BeneficiaryProgramEntitlement }) => (
  <View style={styles.row}>
    <ThemedText style={styles.programName}>{item.programName}</ThemedText>
    <ThemedText style={styles.history}>
      Distributed {formatStroops(item.distributedStroops)} {PILOT_ASSET_CODE} · Redeemed{' '}
      {formatStroops(item.redeemedStroops)} {PILOT_ASSET_CODE} · Available{' '}
      {formatStroops(item.availableStroops)} {PILOT_ASSET_CODE}
    </ThemedText>
    <ThemedText style={styles.note}>{item.abandonmentNote ?? 'Marked abandoned by an operator.'}</ThemedText>
    {item.abandonmentEvidenceRef ? (
      <ThemedText style={styles.evidence}>Evidence: {item.abandonmentEvidenceRef}</ThemedText>
    ) : null}
  </View>
);

/**
 * Greyed abandoned history section. Abandoned rows are excluded from every
 * spendable sum and rendered here with their preserved distributed/redeemed
 * history plus the operator note, so stranded value is visible but never
 * spendable. Testnet RCPHP has no monetary value.
 */
export const AbandonedBalanceSection = ({ abandoned }: Props) => {
  if (abandoned.length === 0) return null;
  return (
    <View style={styles.container}>
      <ThemedText style={styles.title}>Unavailable balances under operator review</ThemedText>
      <ThemedText style={styles.subtitle}>
        These balances are stranded and excluded from your spendable total. History is preserved for
        audit.
      </ThemedText>
      <FlatList
        data={[...abandoned]}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        scrollEnabled={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: BrandColors.lightGray,
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.three,
    padding: Spacing.four,
  },
  title: {
    color: BrandColors.navy,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: Spacing.one,
  },
  subtitle: {
    color: BrandColors.grey,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: Spacing.two,
  },
  row: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.md,
    marginTop: Spacing.two,
    opacity: 0.85,
    padding: Spacing.three,
  },
  programName: {
    color: BrandColors.grey,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: Spacing.one,
  },
  history: {
    color: BrandColors.grey,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: Spacing.one,
  },
  note: {
    color: BrandColors.grey,
    fontSize: 12,
    fontStyle: 'italic',
    lineHeight: 17,
  },
  evidence: {
    color: BrandColors.grey,
    fontSize: 11,
    marginTop: Spacing.one,
  },
});

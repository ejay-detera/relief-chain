import { FontAwesome } from '@expo/vector-icons';
import { useCallback, type ComponentProps, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { DistributionRecipientsState } from '@/hooks/use-distribution-job';
import type { DistributionRecipientOutcome, DistributionRecipientStatus } from '@/types/distribution';
import { formatStroops } from '@/utils/format-stroops';

type Props = {
  state: DistributionRecipientsState;
  onRetry?: () => void;
  /** Optional header (e.g. progress + failure summary) rendered above the list in every state. */
  header?: ReactElement | null;
};

const STATUS_META: Record<
  DistributionRecipientStatus,
  { label: string; icon: ComponentProps<typeof FontAwesome>['name']; color: string }
> = {
  pending: { label: 'Pending', icon: 'clock-o', color: BrandColors.grey },
  prepared: { label: 'Prepared', icon: 'clock-o', color: BrandColors.grey },
  submitted: { label: 'Submitted', icon: 'paper-plane-o', color: BrandColors.navy },
  confirmed: { label: 'Confirmed', icon: 'check-circle', color: BrandColors.green },
  failed: { label: 'Failed', icon: 'times-circle', color: '#B91C1C' },
  cancelled: { label: 'Cancelled', icon: 'ban', color: BrandColors.grey },
};

/**
 * Virtualized, PII-safe list of per-recipient outcomes. Recipients are shown by
 * pseudonymous reference only, and confirmed rows expose a verifiable ledger
 * hash rather than a client-fabricated one (Requirements 8.8, 19.1, 21.6). A
 * FlatList keeps municipal-scale jobs (2,000+ recipients) responsive.
 */
export const RecipientResults = ({ state, onRetry, header }: Props) => {
  const renderItem = useCallback(
    ({ item }: { item: DistributionRecipientOutcome }) => <RecipientRow outcome={item} />,
    [],
  );

  if (state.status === 'loading') {
    return (
      <View style={styles.fill}>
        {header}
        <View style={styles.center}>
          <ActivityIndicator size="large" color={BrandColors.navy} />
          <ThemedText style={styles.mutedText}>Loading recipient outcomes…</ThemedText>
        </View>
      </View>
    );
  }

  if (state.status === 'unavailable') {
    return (
      <View style={styles.fill}>
        {header}
        <View style={styles.center}>
          <FontAwesome name="exclamation-triangle" size={36} color={BrandColors.yellow} />
          <ThemedText style={styles.mutedText}>{state.reason}</ThemedText>
          {state.retryable && onRetry && (
            <Pressable onPress={onRetry} style={styles.retryBtn}>
              <ThemedText style={styles.retryBtnText}>Try again</ThemedText>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  return (
    <FlatList
      data={state.outcomes}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <View style={styles.center}>
          <FontAwesome name="inbox" size={36} color={BrandColors.lightGray} />
          <ThemedText style={styles.mutedText}>No recipients recorded for this job yet.</ThemedText>
        </View>
      }
      initialNumToRender={20}
      windowSize={11}
      removeClippedSubviews
    />
  );
};

const RecipientRow = ({ outcome }: { outcome: DistributionRecipientOutcome }) => {
  const meta = STATUS_META[outcome.status];
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <FontAwesome name={meta.icon} size={16} color={meta.color} />
        <View style={styles.rowText}>
          <ThemedText style={styles.reference}>{outcome.reference}</ThemedText>
          <ThemedText style={styles.amount}>{formatStroops(outcome.amountStroops)} RCPHP</ThemedText>
          {outcome.status === 'confirmed' && outcome.transactionHash && (
            <ThemedText numberOfLines={1} style={styles.hash}>
              {outcome.transactionHash}
            </ThemedText>
          )}
          {outcome.status === 'failed' && outcome.failureReason && (
            <ThemedText style={styles.failure}>{outcome.failureReason}</ThemedText>
          )}
        </View>
      </View>
      <View style={styles.rowRight}>
        <ThemedText style={[styles.statusText, { color: meta.color }]}>{meta.label}</ThemedText>
        {outcome.status === 'failed' && (
          <ThemedText style={styles.retryHint}>
            {outcome.safeToRetry ? 'Safe to retry' : 'Needs review'}
          </ThemedText>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  list: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.six,
    gap: Spacing.three,
  },
  mutedText: {
    fontSize: 13,
    color: BrandColors.grey,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: Spacing.three,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    flex: 1,
    marginRight: Spacing.two,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  reference: {
    fontSize: 13,
    fontWeight: 'bold',
    color: BrandColors.navy,
    fontFamily: 'monospace',
  },
  amount: {
    fontSize: 12,
    color: BrandColors.navy,
  },
  hash: {
    fontSize: 10,
    color: BrandColors.grey,
    fontFamily: 'monospace',
  },
  failure: {
    fontSize: 11,
    color: '#B91C1C',
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  retryHint: {
    fontSize: 10,
    color: BrandColors.grey,
  },
  retryBtn: {
    marginTop: Spacing.two,
    backgroundColor: BrandColors.navy,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  retryBtnText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 13,
  },
});

import { FontAwesome } from '@expo/vector-icons';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { DistributionRetryState } from '@/hooks/use-distribution-job';
import type { DistributionRecipientOutcome } from '@/types/distribution';

type Props = {
  outcomes: readonly DistributionRecipientOutcome[];
  /** Relays a safe-retry to the server; the server classifies and dedupes. */
  onRetrySafe?: () => void;
  /** Honest state of the relayed retry (idle, in-flight, or failed). */
  retryState?: DistributionRetryState;
};

/**
 * Summarizes failed recipients for authorized organization users. It groups
 * PII-safe failure reasons and distinguishes server-classified safe-to-retry
 * failures from those needing manual review, so a partial failure is never
 * presented as overall success (Requirements 8.7, 8.8, 21.2).
 */
export const DistributionFailureSummary = ({
  outcomes,
  onRetrySafe,
  retryState = { status: 'idle' },
}: Props) => {
  const { failed, retryable, grouped } = useMemo(() => {
    const failedOutcomes = outcomes.filter((o) => o.status === 'failed');
    const retryableCount = failedOutcomes.filter((o) => o.safeToRetry).length;
    const reasonGroups = new Map<string, number>();
    for (const outcome of failedOutcomes) {
      const key = outcome.failureReason ?? outcome.failureCode ?? 'Unknown failure';
      reasonGroups.set(key, (reasonGroups.get(key) ?? 0) + 1);
    }
    return {
      failed: failedOutcomes.length,
      retryable: retryableCount,
      grouped: Array.from(reasonGroups.entries()).map(([reason, count]) => ({ reason, count })),
    };
  }, [outcomes]);

  if (failed === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <FontAwesome name="exclamation-triangle" size={18} color="#B91C1C" />
        <ThemedText style={styles.title}>
          {failed} recipient{failed === 1 ? '' : 's'} did not receive aid
        </ThemedText>
      </View>

      <View style={styles.reasonList}>
        {grouped.map((group) => (
          <View key={group.reason} style={styles.reasonRow}>
            <ThemedText style={styles.reasonCount}>{group.count}×</ThemedText>
            <ThemedText style={styles.reasonText}>{group.reason}</ThemedText>
          </View>
        ))}
      </View>

      <ThemedText style={styles.note}>
        {retryable > 0
          ? `${retryable} failure${retryable === 1 ? '' : 's'} are safe to retry. Confirmed transfers are preserved and will not be duplicated.`
          : 'These failures need review before retrying. Confirmed transfers are preserved.'}
      </ThemedText>

      {retryState.status === 'error' && (
        <ThemedText style={styles.retryError}>{retryState.error.message}</ThemedText>
      )}

      {retryable > 0 && onRetrySafe && (
        <Pressable
          onPress={onRetrySafe}
          disabled={retryState.status === 'retrying'}
          style={[styles.retryBtn, retryState.status === 'retrying' && styles.retryBtnDisabled]}
        >
          {retryState.status === 'retrying' ? (
            <>
              <ActivityIndicator size="small" color="white" />
              <ThemedText style={styles.retryBtnText}>Relaying retry…</ThemedText>
            </>
          ) : (
            <>
              <FontAwesome name="refresh" size={14} color="white" />
              <ThemedText style={styles.retryBtnText}>
                Retry {retryable} safe failure{retryable === 1 ? '' : 's'}
              </ThemedText>
            </>
          )}
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FEF2F2',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    padding: Spacing.four,
    margin: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  title: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#B91C1C',
    flex: 1,
  },
  reasonList: {
    gap: Spacing.two,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  reasonCount: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#B91C1C',
    minWidth: 28,
  },
  reasonText: {
    fontSize: 13,
    color: BrandColors.navy,
    flex: 1,
  },
  note: {
    fontSize: 12,
    color: BrandColors.grey,
    lineHeight: 17,
  },
  retryError: {
    fontSize: 12,
    color: '#B91C1C',
    lineHeight: 17,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    backgroundColor: BrandColors.navy,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.three,
  },
  retryBtnDisabled: {
    backgroundColor: BrandColors.grey,
  },
  retryBtnText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 13,
  },
});

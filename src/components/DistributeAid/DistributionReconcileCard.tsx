import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { useDistributionReconcileCheck } from '@/hooks/use-distribution-reconcile-check';
import type { DistributionReconcileCheckResult } from '@/types/distribution-reconcile';

type DistributionReconcileCardProps = {
  readonly jobId: string | null;
  readonly onSynced: () => void;
};

/**
 * Always-reachable LGU distribution reconcile card for the job observation
 * screen (the distribution-scope equivalent of the merchant SettlementSyncCard).
 *
 * A `submitted` recipient with no observer running used to strand the job in
 * `reconciling` with no working authorized reconcile trigger — the submit path
 * has no background invoke. The reconcile call is job-scoped (`jobId`), not
 * recipient-scoped, so it belongs here next to the per-recipient cards. The
 * card instantiates the distribution reconcile-check hook with the screen-owned
 * job id and notifies the screen via `onSynced` exactly once per new
 * successful check so the screen can refresh its job/recipient/projection
 * reads. Refresh orchestration stays screen-owned.
 *
 * The trigger mirrors SettlementCheckButton (same tokens, same states) but
 * stays distribution-scoped: importing the merchant-named button into the LGU
 * flow would couple the two domains, so the label reads "Check distribution
 * status" here.
 */
export const DistributionReconcileCard = ({ jobId, onSynced }: DistributionReconcileCardProps) => {
  const { isChecking, error, lastCheck, checkDistribution } = useDistributionReconcileCheck(jobId);

  const previousCheckRef = useRef<DistributionReconcileCheckResult | null>(null);
  useEffect(() => {
    if (lastCheck !== null && lastCheck !== previousCheckRef.current) {
      previousCheckRef.current = lastCheck;
      onSynced();
    }
  }, [lastCheck, onSynced]);

  const handleCheck = useCallback(() => {
    void checkDistribution();
  }, [checkDistribution]);

  const lastCheckText = useMemo(() => {
    if (!lastCheck) return null;
    return (
      `Checked ${lastCheck.checkedAt} — ` +
      `${lastCheck.confirmedCount} confirmed, ` +
      `${lastCheck.failedCount} failed.`
    );
  }, [lastCheck]);

  const canCheck = jobId !== null && !isChecking;

  return (
    <View style={styles.card}>
      <ThemedText style={styles.title}>Distribution status</ThemedText>
      <ThemedText style={styles.subtitle}>
        Sync the latest confirmed transfers for this job from on-chain evidence.
      </ThemedText>
      <View style={styles.block}>
        <Pressable
          accessibilityLabel="Check distribution status"
          accessibilityRole="button"
          disabled={!canCheck}
          onPress={handleCheck}
          style={[styles.button, !canCheck && styles.buttonDisabled]}
        >
          {isChecking ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <ThemedText style={styles.buttonText}>Check distribution status</ThemedText>
          )}
        </Pressable>
        {lastCheckText ? <ThemedText style={styles.helper}>{lastCheckText}</ThemedText> : null}
        {error ? <ThemedText style={styles.error}>{error.message}</ThemedText> : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.md,
    elevation: 3,
    gap: Spacing.two,
    marginHorizontal: Spacing.four,
    padding: Spacing.three,
    shadowColor: '#112E58',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  title: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14 },
  subtitle: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, lineHeight: 17 },
  block: { gap: Spacing.two },
  button: {
    alignItems: 'center',
    backgroundColor: BrandColors.navy,
    borderRadius: BorderRadius.xl,
    padding: Spacing.three,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15 },
  helper: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, lineHeight: 17 },
  error: { color: '#C0392B', fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12 },
});

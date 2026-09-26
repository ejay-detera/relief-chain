import { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { SettlementCheckButton } from '@/components/MerchantInvoice/SettlementCheckButton';
import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { useMerchantSettlementCheck } from '@/hooks/use-merchant-settlement-check';
import type { MerchantSettlementCheckResult } from '@/types/merchant-settlement';

type SettlementSyncCardProps = {
  readonly merchantEntityId: string | null;
  readonly onSynced: () => void;
};

/**
 * Always-reachable merchant settlement sync card for the dashboard.
 *
 * The "Check settlement status" action used to live only on the ephemeral
 * present-QR screen, so pressing back stranded it. The reconcile call is
 * merchant-scoped (merchantId + organizationId), not invoice-scoped, so it
 * belongs here. The card instantiates the existing settlement-check hook with
 * the screen-owned merchant entity id, reuses SettlementCheckButton as-is,
 * and notifies the screen via `onSynced` exactly once per new successful
 * check so the screen can refresh its settlements/balances/metrics/refunds
 * reads. Refresh orchestration stays screen-owned.
 */
export const SettlementSyncCard = ({ merchantEntityId, onSynced }: SettlementSyncCardProps) => {
  const {
    organizationId,
    isResolvingOrg,
    isChecking,
    error,
    lastCheck,
    checkSettlement,
  } = useMerchantSettlementCheck(merchantEntityId);

  const previousCheckRef = useRef<MerchantSettlementCheckResult | null>(null);
  useEffect(() => {
    if (lastCheck !== null && lastCheck !== previousCheckRef.current) {
      previousCheckRef.current = lastCheck;
      onSynced();
    }
  }, [lastCheck, onSynced]);

  const handleCheck = useCallback(() => {
    void checkSettlement();
  }, [checkSettlement]);

  const lastCheckText = useMemo(() => {
    if (!lastCheck) return null;
    return (
      `Checked ${lastCheck.checkedAt} — ` +
      `${lastCheck.confirmedCount} confirmed, ` +
      `${lastCheck.failedCount} failed.`
    );
  }, [lastCheck]);

  const canCheck = merchantEntityId !== null && organizationId !== null && !isResolvingOrg;

  return (
    <View style={styles.card}>
      <ThemedText style={styles.title}>Settlements</ThemedText>
      <ThemedText style={styles.subtitle}>Sync the latest confirmed settlements for your active organization.</ThemedText>
      <SettlementCheckButton
        disabled={!canCheck}
        errorText={error ? error.message : null}
        isChecking={isChecking}
        lastCheckText={lastCheckText}
        onCheck={handleCheck}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.md,
    elevation: 3,
    gap: Spacing.two,
    padding: Spacing.three,
    shadowColor: '#112E58',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  title: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14 },
  subtitle: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, lineHeight: 17 },
});

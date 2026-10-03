import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

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

/** Sums the reconciled available voucher balance across spendable entitlement rows only. */
const sumVoucherAvailable = (entitlements: readonly BeneficiaryProgramEntitlement[]): StroopAmount =>
  entitlements
    .filter((entitlement) => entitlement.aidType === 'voucher' && !entitlement.isAbandoned)
    .reduce<StroopAmount>((acc, entitlement) => addStroops(acc, entitlement.availableStroops), ZERO_STROOPS);

/** Groups spendable vouchers by program purpose or name to show per-voucher-type breakdown. */
const computePerTypeBreakdown = (
  entitlements: readonly BeneficiaryProgramEntitlement[]
): { label: string; amountStroops: StroopAmount }[] => {
  const map = new Map<string, StroopAmount>();

  for (const ent of entitlements) {
    if (ent.isAbandoned) continue;
    const key = ent.purpose || ent.programName || (ent.aidType === 'cash' ? 'Cash Aid' : 'General Voucher');
    const existing = map.get(key) ?? ZERO_STROOPS;
    map.set(key, addStroops(existing, ent.availableStroops));
  }

  return Array.from(map.entries()).map(([label, amountStroops]) => ({
    label,
    amountStroops,
  }));
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
      return 'No reconciled balance';
  }
};

const formatSyncTimestamp = (isoDate?: string): string => {
  if (!isoDate) return 'Sync time unavailable';
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return 'Recently synced';
    return `Last updated: ${d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })} at ${d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    })}`;
  } catch {
    return 'Recently synced';
  }
};

export function TotalBalanceCard({ state, activeProgramCount }: Props) {
  const rows = populatedRows(state);
  const balanceLabel = rows
    ? `${formatStroops(sumVoucherAvailable(rows))} ${PILOT_ASSET_CODE}`
    : placeholderLabel(state.status);

  const breakdown = rows ? computePerTypeBreakdown(rows) : [];

  const syncTimestamp =
    state.status === 'current' || state.status === 'stale'
      ? state.metadata.reconciledAt
      : undefined;

  return (
    <LinearGradient
      colors={[BrandColors.green, '#4A90D9']}
      style={styles.card}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <View style={styles.topHeader}>
        <ThemedText style={styles.title}>Total Reconciled Assistance</ThemedText>
        {syncTimestamp && (
          <View style={styles.syncBadge}>
            <FontAwesome name="clock-o" size={10} color="rgba(255,255,255,0.85)" />
            <ThemedText style={styles.syncText}>
              {state.status === 'stale' ? 'Offline (Cached)' : 'Live'}
            </ThemedText>
          </View>
        )}
      </View>

      <ThemedText style={styles.balance}>{balanceLabel}</ThemedText>

      {/* Sync timestamp for offline/connectivity resilience */}
      {syncTimestamp && (
        <ThemedText style={styles.lastUpdatedText}>
          {formatSyncTimestamp(syncTimestamp)}
        </ThemedText>
      )}

      {/* Per voucher/aid type breakdown (US4) */}
      {breakdown.length > 0 && (
        <View style={styles.breakdownContainer}>
          <ThemedText style={styles.breakdownHeader}>Balance by Aid Type</ThemedText>
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
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 4,
    backgroundColor: 'rgba(0,0,0,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  syncText: {
    fontSize: 10,
    color: 'white',
    fontWeight: '600',
  },
  balance: {
    color: 'white',
    fontSize: 30,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  lastUpdatedText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    marginBottom: Spacing.two,
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
    marginVertical: Spacing.one,
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

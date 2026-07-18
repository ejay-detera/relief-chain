import { FontAwesome } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PILOT_ASSET_CODE } from '@/constants/pilot-disclosure';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { PilotBalanceSummary, ProjectionState } from '@/types/projection';
import { formatStroops } from '@/utils/format-stroops';
import { BalanceDisclosure } from './balance-disclosure';
import type { StellarBalance } from '@/services/stellarBalanceService';

type Props = {
  balance: ProjectionState<PilotBalanceSummary>;
  stellarBalances?: StellarBalance[] | null;
  onWithdraw: () => void;
  onSend: () => void;
};

const reconciledLabel = (reconciledAt: string): string => {
  const parsed = new Date(reconciledAt);
  return Number.isNaN(parsed.getTime())
    ? 'Reconciled recently'
    : `Reconciled ${parsed.toLocaleString()}`;
};

function BalanceBody({ balance }: { balance: ProjectionState<PilotBalanceSummary> }) {
  switch (balance.status) {
    case 'loading':
      return (
        <View style={styles.stateRow}>
          <ActivityIndicator color="white" />
          <ThemedText style={styles.stateText}>Loading balance…</ThemedText>
        </View>
      );
    case 'unavailable':
      return (
        <View>
          <ThemedText style={styles.balance}>Unavailable</ThemedText>
          <ThemedText style={styles.stateText}>
            Balance can&apos;t be shown right now. {balance.retryable ? 'Pull to refresh to retry.' : ''}
          </ThemedText>
        </View>
      );
    case 'empty':
      return (
        <View>
          <ThemedText style={styles.balance}>0.00 {PILOT_ASSET_CODE}</ThemedText>
          <ThemedText style={styles.stateText}>No reconciled balance yet.</ThemedText>
        </View>
      );
    case 'quarantined':
      return (
        <View>
          <ThemedText style={styles.balance}>Under review</ThemedText>
          <ThemedText style={styles.stateText}>{balance.reason}</ThemedText>
        </View>
      );
    case 'current':
    case 'stale': {
      const { data } = balance;
      return (
        <View>
          <ThemedText style={styles.balance}>
            {formatStroops(data.cashAvailableStroops)} {PILOT_ASSET_CODE}
          </ThemedText>
          <ThemedText style={styles.subBalance}>
            Vouchers: {formatStroops(data.voucherAvailableStroops)} {PILOT_ASSET_CODE}
          </ThemedText>
          <ThemedText style={styles.stateText}>
            {balance.status === 'stale'
              ? `Stale · ${reconciledLabel(balance.metadata.reconciledAt)}`
              : reconciledLabel(balance.metadata.reconciledAt)}
          </ThemedText>
        </View>
      );
    }
    default:
      return null;
  }
}

export function WalletBalanceCard({ balance, stellarBalances, onWithdraw, onSend }: Props) {
  return (
    <LinearGradient
      colors={[BrandColors.green, '#4A90D9']}
      style={styles.card}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <ThemedText style={styles.title}>Unrestricted Cash Balance</ThemedText>
      <BalanceBody balance={balance} />
      
      {stellarBalances && stellarBalances.length > 0 && (
        <View style={styles.stellarBalancesBox}>
          <ThemedText style={styles.stellarBalancesTitle}>ON-CHAIN BALANCES (LIVE)</ThemedText>
          {stellarBalances.map(b => (
            <View key={b.assetCode} style={styles.stellarBalanceRow}>
              <ThemedText style={styles.stellarBalanceAsset}>{b.assetCode}</ThemedText>
              <ThemedText style={styles.stellarBalanceAmount}>{b.balance}</ThemedText>
            </View>
          ))}
        </View>
      )}

      <BalanceDisclosure />

      <View style={styles.actionsRow}>
        <Pressable onPress={onWithdraw} style={styles.withdrawButton}>
          <FontAwesome name="credit-card" size={14} color="white" />
          <ThemedText style={styles.actionText}>Withdraw</ThemedText>
        </Pressable>
        <Pressable onPress={onSend} style={styles.sendButton}>
          <FontAwesome name="paper-plane" size={14} color="white" />
          <ThemedText style={styles.actionText}>Send</ThemedText>
        </Pressable>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.three,
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
  },
  subBalance: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: Spacing.two,
  },
  stateText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    marginTop: Spacing.one,
  },
  actionsRow: {
    flexDirection: 'row',
    columnGap: Spacing.two,
    marginTop: Spacing.three,
  },
  withdrawButton: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 6,
    backgroundColor: BrandColors.navy,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: BorderRadius.md,
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 6,
    backgroundColor: BrandColors.green,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: BorderRadius.md,
  },
  actionText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
  },
  stellarBalancesBox: {
    marginTop: Spacing.three,
    padding: Spacing.three,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: BorderRadius.md,
  },
  stellarBalancesTitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontFamily: 'PlusJakartaSans_700Bold',
    letterSpacing: 0.5,
    marginBottom: Spacing.two,
  },
  stellarBalanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  stellarBalanceAsset: {
    color: 'white',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_500Medium',
  },
  stellarBalanceAmount: {
    color: 'white',
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
});

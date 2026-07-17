import { FontAwesome } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PILOT_NETWORK_LABEL, PILOT_NO_VALUE_LABEL } from '@/constants/pilot-disclosure';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { WalletRotationStatusView, WalletRotationUiStatus } from '@/types/wallet-recovery';

type Props = {
  view: WalletRotationStatusView;
};

type StatusMeta = { label: string; description: string; icon: React.ComponentProps<typeof FontAwesome>['name']; tint: string };

const STATUS_META: Record<WalletRotationUiStatus, StatusMeta> = {
  none: { label: 'No rotation in progress', description: 'Your active wallet is in use.', icon: 'check-circle', tint: BrandColors.green },
  prerequisites_required: { label: 'Action needed', description: 'Complete the required checks to start rotation.', icon: 'lock', tint: BrandColors.yellow },
  prepared: { label: 'Ready to authorize', description: 'Authorize the rotation on your device to continue.', icon: 'hourglass-half', tint: BrandColors.navy },
  submitted: { label: 'Submitted · awaiting confirmation', description: 'Not confirmed yet. It is final only after on-chain confirmation.', icon: 'clock-o', tint: BrandColors.navy },
  confirmed: { label: 'Rotation confirmed', description: 'Your entitlements moved to the new wallet and the old wallet can no longer authorize redemptions.', icon: 'check-circle', tint: BrandColors.green },
  failed: { label: 'Rotation did not complete', description: 'No change was made. Your original wallet remains active.', icon: 'times-circle', tint: '#C0392B' },
};

const shortAddress = (address: string): string =>
  address.length > 14 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;

/**
 * Shows the confirmed status of a wallet rotation (Requirement 16.4). Confirmation
 * is surfaced only for the `confirmed` status, which the rotation infrastructure
 * reaches solely from reconciled ledger evidence — a submitted rotation is always
 * shown as pending, never as done (Requirement 18.8). Blocking prerequisites
 * (identity re-verification, recent step-up) are listed when present.
 */
export const WalletRotationStatusCard = ({ view }: Props) => {
  const meta = STATUS_META[view.status];
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <FontAwesome color={meta.tint} name={meta.icon} size={18} />
        <ThemedText style={styles.title}>{meta.label}</ThemedText>
      </View>
      <ThemedText style={styles.description}>{meta.description}</ThemedText>

      {view.replacementAddress ? (
        <View style={styles.detailRow}>
          <ThemedText style={styles.detailLabel}>New wallet</ThemedText>
          <ThemedText selectable style={styles.detailValue}>{shortAddress(view.replacementAddress)}</ThemedText>
        </View>
      ) : null}

      {view.status === 'confirmed' && view.transactionHash ? (
        <View style={styles.refBlock}>
          <ThemedText style={styles.refLabel}>Testnet transaction reference</ThemedText>
          <ThemedText selectable style={styles.refValue}>{view.transactionHash}</ThemedText>
          {view.confirmedLedger ? (
            <ThemedText style={styles.ledger}>Confirmed at ledger {view.confirmedLedger}</ThemedText>
          ) : null}
          <ThemedText style={styles.disclosure}>{PILOT_NETWORK_LABEL} · {PILOT_NO_VALUE_LABEL}</ThemedText>
        </View>
      ) : null}

      {view.blockingReasons.length > 0 ? (
        <View style={styles.reasons}>
          {view.blockingReasons.map((reason) => (
            <View key={reason} style={styles.reasonRow}>
              <FontAwesome color={BrandColors.grey} name="circle" size={6} />
              <ThemedText style={styles.reasonText}>{reason}</ThemedText>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: BorderRadius.lg, gap: Spacing.two, padding: Spacing.four, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' },
  headerRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  title: { color: BrandColors.navy, flex: 1, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16 },
  description: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, lineHeight: 19 },
  detailRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.one },
  detailLabel: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13 },
  detailValue: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13 },
  refBlock: { backgroundColor: BrandColors.lightGray, borderRadius: BorderRadius.md, gap: 2, marginTop: Spacing.two, padding: Spacing.three },
  refLabel: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase' },
  refValue: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12 },
  ledger: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 11 },
  disclosure: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 10, marginTop: 2 },
  reasons: { gap: Spacing.one, marginTop: Spacing.one },
  reasonRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  reasonText: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12 },
});

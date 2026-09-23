import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { PilotWalletState } from '@/types/wallet';

type Props = {
  walletState: PilotWalletState | null;
};

const recoveryMessage = (reason: 'missing_signer' | 'invalid_signer' | 'signer_mismatch'): string => {
  switch (reason) {
    case 'missing_signer':
      return 'This device has no wallet key. Please complete wallet setup.';
    case 'invalid_signer':
      return 'The stored wallet key is unreadable. Please contact support.';
    case 'signer_mismatch':
      return 'The local wallet key does not match your verified wallet. Go to Wallet & Recovery to fix this.';
  }
};

/** Shows wallet recovery status for beneficiaries whose local signer needs rotation. */
export const WalletStatusCard = ({ walletState }: Props) => {
  if (!walletState || walletState.status !== 'recovery_required') {
    return null;
  }

  return (
    <View style={[styles.card, styles.blocked]}>
      <ThemedText style={styles.blockedText}>{recoveryMessage(walletState.reason)}</ThemedText>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.three,
    padding: Spacing.three,
    borderRadius: 12,
  },
  blocked: {
    backgroundColor: 'rgba(192,57,43,0.10)',
  },
  blockedText: {
    color: '#C0392B',
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    lineHeight: 17,
  },
});

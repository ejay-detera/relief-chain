import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing } from '@/constants/theme';
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
      return 'The local wallet key does not match your verified wallet. Click below to fix this for testing.';
  }
};

/**
 * Shows wallet recovery status for beneficiaries with actionable fix button for dev mismatch
 */
export const WalletStatusCard = ({ walletState }: Props) => {
  if (!walletState || walletState.status !== 'recovery_required') {
    return null;
  }

  return (
    <View style={[styles.card, styles.blocked]}>
      <ThemedText style={styles.blockedText}>{recoveryMessage(walletState.reason)}</ThemedText>
      
      {walletState.reason === 'signer_mismatch' && walletState.expectedAddress && (
        <Pressable
          style={styles.fixButton}
          onPress={async () => {
            try {
              // For dev: paste the correct beneficiary secret here
              const correctSecret = 'SBYD6QQGGY2VSG6KZXQQYX2I7D64GJ3IWDCBJRIGVY6VRW7BNT3INAQQ';

              // Import the stellar SDK and SecureStore
              const { Keypair } = await import('@stellar/stellar-sdk');
              const SecureStore = await import('expo-secure-store');

              // Verify the secret matches the expected database address
              const kp = Keypair.fromSecret(correctSecret);
              if (kp.publicKey() !== walletState.expectedAddress) {
                alert(`Secret mismatch! Expected ${walletState.expectedAddress}, got ${kp.publicKey()}`);
                return;
              }

              // Store the correct secret
              const storageKey = walletState.storageNamespace.replaceAll(':', '.');
              await SecureStore.setItemAsync(storageKey, correctSecret);

              alert('Fixed! Stored correct beneficiary secret. Please refresh dashboard.');
            } catch (err) {
              alert('Exception: ' + String(err));
            }
          }}
        >
          <ThemedText style={styles.fixButtonText}>Fix Dev Mismatch</ThemedText>
        </Pressable>
      )}
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
  fixButton: {
    marginTop: 8,
    padding: 8,
    backgroundColor: BrandColors.navy,
    borderRadius: 4,
    alignItems: 'center',
  },
  fixButtonText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
});

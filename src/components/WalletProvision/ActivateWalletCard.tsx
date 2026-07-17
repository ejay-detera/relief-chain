import { FontAwesome } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { useWalletProvision } from '@/hooks/use-wallet-provision';

type Props = {
  /** Authenticated beneficiary user id (namespaces the local signer). */
  readonly userId: string;
  /** The beneficiary's on-device wallet address to provision. */
  readonly walletAddress: string;
  /** Called once the wallet is provisioned (authorized RCPHP trustline). */
  readonly onProvisioned?: () => void;
};

/**
 * A self-contained card that activates a beneficiary's wallet so it can receive
 * RCPHP: it prepares the sponsored trustline, signs the changeTrust locally, and
 * relays it for sponsor co-signature and issuer authorization. It reports only
 * real state — never a fabricated success.
 */
export const ActivateWalletCard = ({ userId, walletAddress, onProvisioned }: Props) => {
  const { state, provision } = useWalletProvision(userId, walletAddress);

  const handlePress = async () => {
    await provision();
  };

  if (state.status === 'provisioned') {
    return (
      <View style={[styles.card, styles.cardDone]}>
        <FontAwesome name="check-circle" size={20} color={BrandColors.green} />
        <ThemedText style={styles.doneText}>Wallet activated. You can now receive assistance.</ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <ThemedText style={styles.title}>Activate your wallet</ThemedText>
      <ThemedText style={styles.subtitle}>
        Your wallet needs a one-time activation before it can receive assistance. This is free — network fees are
        sponsored.
      </ThemedText>

      {state.status === 'error' && (
        <View style={styles.errorRow}>
          <FontAwesome name="exclamation-triangle" size={14} color="#C53030" />
          <ThemedText style={styles.errorText}>{state.error.message}</ThemedText>
        </View>
      )}

      <Pressable
        onPress={handlePress}
        disabled={state.status === 'working'}
        style={[styles.button, state.status === 'working' && styles.buttonDisabled]}
      >
        {state.status === 'working' ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <ThemedText style={styles.buttonText}>
            {state.status === 'error' ? 'Try again' : 'Activate wallet'}
          </ThemedText>
        )}
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    gap: Spacing.two,
    borderWidth: 1,
    borderColor: BrandColors.lightGray,
  },
  cardDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: BrandColors.navy,
  },
  subtitle: {
    fontSize: 13,
    color: '#4A5568',
  },
  doneText: {
    fontSize: 14,
    color: BrandColors.navy,
    flexShrink: 1,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  errorText: {
    fontSize: 12,
    color: '#C53030',
    flexShrink: 1,
  },
  button: {
    backgroundColor: BrandColors.green,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});

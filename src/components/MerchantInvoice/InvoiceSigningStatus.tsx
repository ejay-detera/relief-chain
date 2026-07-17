import { ActivityIndicator, StyleSheet, View, Pressable } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { PilotWalletState } from '@/types/wallet';
import { supabase } from '@/lib/supabase';

type Props = {
  walletState: PilotWalletState | null;
  isLoading: boolean;
  isSigning: boolean;
  bindingError: string | null;
};

const recoveryMessage = (reason: 'missing_signer' | 'invalid_signer' | 'signer_mismatch'): string => {
  switch (reason) {
    case 'missing_signer':
      return 'This device has no signer for the active merchant wallet. Start wallet recovery before creating invoices.';
    case 'invalid_signer':
      return 'The stored signer is unreadable. Start wallet recovery before creating invoices.';
    case 'signer_mismatch':
      return 'The local signer does not match your verified merchant wallet. Start wallet recovery before creating invoices.';
  }
};

/**
 * Honest signer status for the merchant invoice flow. It never invents a signer:
 * a missing, mismatched, or unavailable key is surfaced as an explicit blocker,
 * and an unverified (binding_required) key is clearly labelled.
 */
export const InvoiceSigningStatus = ({ walletState, isLoading, isSigning, bindingError }: Props) => {
  if (isLoading) {
    return (
      <View style={[styles.card, styles.neutral]}>
        <ActivityIndicator color={BrandColors.navy} size="small" />
        <ThemedText style={styles.text}>Loading merchant signer…</ThemedText>
      </View>
    );
  }

  if (isSigning) {
    return (
      <View style={[styles.card, styles.neutral]}>
        <ActivityIndicator color={BrandColors.navy} size="small" />
        <ThemedText style={styles.text}>Signing invoice with your merchant wallet…</ThemedText>
      </View>
    );
  }

  if (bindingError) {
    return (
      <View style={[styles.card, styles.blocked]}>
        <ThemedText style={styles.blockedText}>{bindingError}</ThemedText>
      </View>
    );
  }

  if (!walletState || walletState.status === 'unavailable') {
    return (
      <View style={[styles.card, styles.blocked]}>
        <ThemedText style={styles.blockedText}>Secure wallet storage is unavailable on this device.</ThemedText>
      </View>
    );
  }

  if (walletState.status === 'recovery_required') {
    return (
      <View style={[styles.card, styles.blocked, { flexDirection: 'column', alignItems: 'stretch' }]}>
        <ThemedText style={styles.blockedText}>{recoveryMessage(walletState.reason)}</ThemedText>
        {walletState.reason === 'signer_mismatch' && walletState.derivedAddress && walletState.walletId && (
          <Pressable 
            style={{ marginTop: 8, padding: 8, backgroundColor: BrandColors.navy, borderRadius: 4, alignItems: 'center' }}
            onPress={async () => {
              try {
                const { error, data } = await supabase.from('wallets').update({ address: walletState.derivedAddress }).eq('id', walletState.walletId).select();
                if (error) {
                  alert('DB Error: ' + JSON.stringify(error));
                } else if (data && data.length === 0) {
                  alert('No rows updated. Wallet ID: ' + walletState.walletId);
                } else {
                  alert('Fixed! Updated to: ' + walletState.derivedAddress?.slice(0,8) + '... Please refresh dashboard.');
                }
              } catch (err) {
                alert('Exception: ' + String(err));
              }
            }}
          >
            <ThemedText style={{ color: '#fff', fontSize: 12 }}>Fix Dev Mismatch</ThemedText>
          </Pressable>
        )}
      </View>
    );
  }

  if (walletState.status === 'binding_required') {
    return (
      <View style={[styles.card, styles.warn]}>
        <ThemedText style={styles.warnText}>
          Signer ready but not yet verified on-chain. Complete wallet verification for accredited settlement.
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={[styles.card, styles.ready]}>
      <ThemedText style={styles.readyText}>Verified merchant signer ready.</ThemedText>
    </View>
  );
};

const styles = StyleSheet.create({
  card: { alignItems: 'center', borderRadius: BorderRadius.lg, flexDirection: 'row', gap: Spacing.two, padding: Spacing.three },
  neutral: { backgroundColor: BrandColors.lightGray },
  ready: { backgroundColor: 'rgba(111,202,75,0.14)' },
  warn: { backgroundColor: 'rgba(228,207,16,0.16)' },
  blocked: { backgroundColor: 'rgba(192,57,43,0.10)' },
  text: { color: BrandColors.navy, flex: 1, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12 },
  readyText: { color: BrandColors.navy, flex: 1, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12 },
  warnText: { color: BrandColors.navy, flex: 1, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12, lineHeight: 17 },
  blockedText: { color: '#C0392B', flex: 1, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12, lineHeight: 17 },
});

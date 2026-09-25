import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BrandColors, BorderRadius, Spacing } from '@/constants/theme';
import { generateAndStoreReplacementMerchantSigner, signPreparedProvisionTransaction } from '@/services/stellar-wallet-service';
import { prepareMerchantProvision, submitMerchantProvision } from '@/services/wallet-provision-service';
import type { PilotWalletState } from '@/types/wallet';

type Props = {
  userId: string;
  merchantEntityId: string;
  walletState: PilotWalletState | null;
  refreshing: boolean;
  onRotated: () => Promise<void>;
};

const shortAddress = (address: string): string =>
  address.length > 14 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;

/**
 * Merchant rotation panel: generates a replacement signer on this device and
 * provisions it through the existing prepare/submit-merchant-provision path.
 * The server supersedes the still-bound old wallet so only one active
 * settlement wallet exists. Secrets never leave the device; the server only
 * sees the signed trustline.
 */
export const MerchantRotationPanel = ({ userId, walletState, refreshing, onRotated }: Props) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [replacement, setReplacement] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!walletState || walletState.status === 'unavailable') {
    return (
      <View style={styles.card}>
        <ThemedText style={styles.body}>Secure wallet storage is unavailable on this device, so rotation cannot start here.</ThemedText>
      </View>
    );
  }

  if (walletState.status === 'ready') {
    return (
      <View style={[styles.card, styles.ready]}>
        <ThemedText style={styles.readyText}>Verified merchant signer ready — no rotation needed. You can create invoices.</ThemedText>
      </View>
    );
  }

  const expectedOld = walletState.status === 'recovery_required' ? walletState.expectedAddress : null;
  const derived = walletState.status === 'recovery_required' ? walletState.derivedAddress : null;
  const bindingKey = walletState.status === 'binding_required' ? walletState.publicKey : null;
  const candidate = replacement ?? derived ?? bindingKey;

  const handleGenerate = async () => {
    setActionError(null);
    setSuccess(null);
    setIsGenerating(true);
    try {
      const publicKey = await generateAndStoreReplacementMerchantSigner(userId);
      setReplacement(publicKey);
      await onRotated();
      setSuccess('Replacement wallet generated on this device. Provision it below to activate settlement.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not generate a replacement wallet.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleProvision = async () => {
    if (!candidate) {
      setActionError('Generate a replacement wallet first.');
      return;
    }
    setActionError(null);
    setSuccess(null);
    setIsProvisioning(true);
    try {
      const prepared = await prepareMerchantProvision(candidate);
      if (!prepared.ok) {
        if (__DEV__) {
          // Metro terminal copy: same detail as the on-screen tag, easier to copy than long-press.
          console.error('[MerchantRotationPanel] provision prepare failed:', prepared.error.code, prepared.error.correlationId, prepared.error.message);
        }
        setActionError(`[prepare:${prepared.error.code}/${prepared.error.correlationId}] ${prepared.error.message}`);
        return;
      }
      if (prepared.data.alreadyProvisioned) {
        await onRotated();
        setSuccess('Replacement already provisioned on-chain. Wallet binding refreshed — check status above.');
        return;
      }
      const { unsignedTxXdr, networkPassphrase, expectedSigner } = prepared.data;
      if (!unsignedTxXdr || !networkPassphrase || !expectedSigner) {
        setActionError('[prepare:package] Incomplete provisioning package. Please try again.');
        return;
      }
      let signedTxXdr: string;
      try {
        signedTxXdr = await signPreparedProvisionTransaction(userId, expectedSigner, unsignedTxXdr, networkPassphrase);
      } catch (err) {
        if (__DEV__) {
          console.error('[MerchantRotationPanel] provision sign failed:', err instanceof Error ? err.message : err);
        }
        setActionError(`[sign] ${err instanceof Error ? err.message : 'Signing failed on this device.'}`);
        return;
      }
      const submitted = await submitMerchantProvision(candidate, signedTxXdr);
      if (!submitted.ok) {
        if (__DEV__) {
          console.error('[MerchantRotationPanel] provision submit failed:', submitted.error.code, submitted.error.correlationId, submitted.error.message);
        }
        setActionError(`[submit:${submitted.error.code}/${submitted.error.correlationId}] ${submitted.error.message}`);
        return;
      }
      setReplacement(null);
      await onRotated();
      setSuccess('Replacement activated. The old settlement wallet was superseded — you can now create invoices.');
    } finally {
      setIsProvisioning(false);
    }
  };

  const busy = isGenerating || isProvisioning || refreshing;

  return (
    <View style={styles.card}>
      <ThemedText style={styles.title}>Replace the lost merchant signer</ThemedText>
      {expectedOld ? (
        <ThemedText style={styles.body}>
          Still-bound old wallet: {shortAddress(expectedOld)}. The replacement will supersede it — the old address is deactivated, never edited.
        </ThemedText>
      ) : (
        <ThemedText style={styles.body}>
          No active merchant wallet is bound yet. Generate a key on this device, then provision it for settlement.
        </ThemedText>
      )}
      {derived && replacement == null ? (
        <ThemedText style={styles.body}>This device holds: {shortAddress(derived)} (not yet active).</ThemedText>
      ) : null}
      {candidate ? (
        <ThemedText selectable style={styles.body}>Provisioning address: {candidate}</ThemedText>
      ) : null}

      {actionError ? <ThemedText style={styles.error}>{actionError}</ThemedText> : null}
      {success ? <ThemedText style={styles.success}>{success}</ThemedText> : null}

      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void handleGenerate()} style={[styles.button, styles.primary, busy && styles.disabled]}>
        {isGenerating ? <ActivityIndicator color="#FFFFFF" size="small" /> : <ThemedText style={styles.buttonText}>Generate replacement on this device</ThemedText>}
      </Pressable>
      <Pressable accessibilityRole="button" disabled={busy || !candidate} onPress={() => void handleProvision()} style={[styles.button, styles.secondary, (busy || !candidate) && styles.disabled]}>
        {isProvisioning ? <ActivityIndicator color={BrandColors.navy} size="small" /> : <ThemedText style={styles.secondaryText}>Provision & activate replacement</ThemedText>}
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: BorderRadius.lg, gap: Spacing.two, padding: Spacing.four, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' },
  ready: { backgroundColor: 'rgba(111,202,75,0.14)' },
  title: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15 },
  body: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, lineHeight: 18 },
  error: { color: '#C0392B', fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12 },
  success: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12 },
  readyText: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12, lineHeight: 17 },
  button: { alignItems: 'center', borderRadius: 24, padding: Spacing.three },
  primary: { backgroundColor: BrandColors.green },
  secondary: { borderColor: BrandColors.navy, borderWidth: 1 },
  disabled: { opacity: 0.55 },
  buttonText: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14 },
  secondaryText: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14 },
});

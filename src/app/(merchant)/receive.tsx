import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InvoiceAmountForm } from '@/components/MerchantInvoice/InvoiceAmountForm';
import { InvoiceExpiryCountdown } from '@/components/MerchantInvoice/InvoiceExpiryCountdown';
import { InvoiceQrCard } from '@/components/MerchantInvoice/InvoiceQrCard';
import { InvoiceSettlementState } from '@/components/MerchantInvoice/InvoiceSettlementState';
import { InvoiceSigningStatus } from '@/components/MerchantInvoice/InvoiceSigningStatus';
import { SettlementCheckButton } from '@/components/MerchantInvoice/SettlementCheckButton';
import { FadeInView } from '@/components/shared/FadeInView';
import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useMerchantSettlementCheck } from '@/hooks/use-merchant-settlement-check';
import { isVerifiedMerchantWallet, merchantWalletPublicKey, useMerchantWallet } from '@/hooks/use-merchant-wallet';
import { createSignedInvoice } from '@/services/invoice-service';
import { getStoredInvoiceByNonce, saveInvoice, updateInvoiceStatus } from '@/services/merchant-invoice-storage';
import type {
    InvoiceSettlementState as SettlementState,
    InvoiceTransport,
    InvoiceV1,
    MerchantInvoiceDraft,
    MerchantInvoiceStep,
} from '@/types/invoice';

type PresentedInvoice = { invoice: InvoiceV1; transport: InvoiceTransport };

const MerchantReceiveScreen = () => {
  const router = useRouter();
  const { session } = useAuth();
  const { state: walletState, merchantEntityId, isLoading, error: bindingError } = useMerchantWallet();

  const [step, setStep] = useState<MerchantInvoiceStep>('collect');
  const [presented, setPresented] = useState<PresentedInvoice | null>(null);
  const [settlement, setSettlement] = useState<SettlementState>({ status: 'awaiting_scan' });
  const [formError, setFormError] = useState<string | null>(null);

  const resolvedMerchantIdForCheck = merchantEntityId ?? null;
  const {
    organizationId: settlementOrganizationId,
    isResolvingOrg: isResolvingSettlementOrg,
    isChecking: isCheckingSettlement,
    error: settlementCheckError,
    lastCheck: settlementLastCheck,
    settledEvidence,
    checkSettlement,
    resetCheck,
  } = useMerchantSettlementCheck(resolvedMerchantIdForCheck);

  // `settled` renders only from reconciler-owned DB evidence re-read after the
  // authorized check — never from the invoke response alone. Derived during
  // render (no effect) so no cascading setState is introduced.
  const displayedSettlement: SettlementState = settledEvidence
    ? { status: 'settled', evidence: settledEvidence }
    : settlement;

  const handleCheckSettlement = useCallback(() => {
    void checkSettlement();
  }, [checkSettlement]);

  const settlementCheckSummary = useMemo(() => {
    if (!settlementLastCheck) return null;
    return (
      `Checked ${settlementLastCheck.checkedAt} — ` +
      `${settlementLastCheck.confirmedCount} confirmed, ` +
      `${settlementLastCheck.failedCount} failed.`
    );
  }, [settlementLastCheck]);

  const userId = session?.user.id ?? null;
  // Use the merchantEntityId from the wallet hook, which resolves the entity ID, instead of the auth user ID.
  // The backend prepare-payment function strictly expects the merchant entity ID to resolve accreditations.
  const resolvedMerchantId = merchantEntityId ?? null;
  const merchantWallet = merchantWalletPublicKey(walletState);
  // Invoice signing requires the local secret to match the verified active
  // wallet. `merchantWalletPublicKey` also returns the expected address while
  // in `recovery_required` for display, so gate creation on verified readiness
  // explicitly — otherwise `signMerchantInvoice` fails late with the low-level
  // "disposable testnet signer is unavailable" error.
  const isReady = isVerifiedMerchantWallet(walletState);

  const { nonce } = useLocalSearchParams<{ nonce?: string }>();

  // If a nonce parameter is supplied, resume that invoice from storage
  useEffect(() => {
    if (!nonce || !resolvedMerchantId) return;
    let cancelled = false;
    void getStoredInvoiceByNonce(resolvedMerchantId, nonce).then((record) => {
      if (cancelled || !record) return;
      setPresented({ invoice: record.invoice, transport: record.transport });
      const isExpired = Date.parse(record.invoice.expiresAt) <= Date.now();
      setSettlement(
        record.settlementEvidence
          ? { status: 'settled', evidence: record.settlementEvidence }
          : isExpired
          ? { status: 'expired' }
          : { status: 'awaiting_scan' },
      );
      setStep('present');
    });
    return () => {
      cancelled = true;
    };
  }, [nonce, resolvedMerchantId]);

  const canCreate = Boolean(userId && resolvedMerchantId && merchantWallet && isReady);
  const needsRecovery = walletState?.status === 'recovery_required';

  const handleStartRecovery = useCallback(() => {
    router.push('/(merchant)/wallet-recovery' as never);
  }, [router]);

  const handleSubmit = useCallback(async (draft: MerchantInvoiceDraft) => {
    if (!userId || !resolvedMerchantId || !merchantWallet) return;
    if (!isReady) {
      setFormError('Complete wallet recovery before creating invoices. Your verified merchant signer is not ready on this device.');
      setStep('collect');
      return;
    }
    setStep('signing');
    setFormError(null);
    try {
      const result = await createSignedInvoice({
        userId,
        merchantId: resolvedMerchantId,
        merchantWallet,
        kind: draft.kind,
        amountStroops: draft.amountStroops,
        category: draft.category,
        programId: draft.programId,
        contractId: draft.contractId,
        receiptDigest: draft.receiptDigest,
      });
      // Persist the generated invoice immediately so it survives back-navigation
      void saveInvoice(resolvedMerchantId, {
        id: result.invoice.nonce,
        invoice: result.invoice,
        transport: result.transport,
        createdAt: new Date().toISOString(),
        status: 'active',
      });
      setPresented(result);
      setSettlement({ status: 'awaiting_scan' });
      resetCheck();
      setStep('present');
    } catch (caught: unknown) {
      const message = caught instanceof Error ? caught.message : 'Could not create the invoice.';
      // Map the low-level missing-secret error to the actionable recovery message
      // when the wallet is in recovery — the signer, not the form, is the blocker.
      setFormError(
        needsRecovery && message.includes('disposable testnet signer')
          ? 'This device has no signer for the active merchant wallet. Start wallet recovery before creating invoices.'
          : message,
      );
      setStep('collect');
    }
  }, [userId, resolvedMerchantId, merchantWallet, isReady, needsRecovery, resetCheck]);

  const startNewInvoice = useCallback(() => {
    setPresented(null);
    setSettlement({ status: 'awaiting_scan' });
    setFormError(null);
    resetCheck();
    setStep('collect');
  }, [resetCheck]);

  const handleExpired = useCallback(() => {
    setSettlement({ status: 'expired' });
    if (resolvedMerchantId && presented?.invoice.nonce) {
      void updateInvoiceStatus(resolvedMerchantId, presented.invoice.nonce, 'expired');
    }
  }, [resolvedMerchantId, presented]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(merchant)' as any);
    }
  }, [router]);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Go back" accessibilityRole="button" hitSlop={10} onPress={handleBack} style={styles.back}>
          <MaterialCommunityIcons color={BrandColors.navy} name="arrow-left" size={22} />
        </Pressable>
        <ThemedText style={styles.title}>Receive payment</ThemedText>
        <Pressable
          accessibilityLabel="Payment history"
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => router.push('/(merchant)/payment-history')}
          style={styles.historyBtn}
        >
          <MaterialCommunityIcons color={BrandColors.navy} name="history" size={22} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <InvoiceSigningStatus
          bindingError={bindingError}
          isLoading={isLoading}
          isSigning={step === 'signing'}
          onStartRecovery={needsRecovery ? handleStartRecovery : undefined}
          walletState={walletState}
        />

        {/* Pending payments UI removed – merchant receives instantly */}

        {step === 'present' && presented ? (
          <FadeInView delay={40}>
            <View style={styles.presentBlock}>
              <InvoiceExpiryCountdown expiresAt={presented.invoice.expiresAt} onExpired={handleExpired} />
              <InvoiceQrCard invoice={presented.invoice} transport={presented.transport} />
              <InvoiceSettlementState state={displayedSettlement} />
              <SettlementCheckButton
                disabled={!resolvedMerchantIdForCheck || !settlementOrganizationId || isResolvingSettlementOrg}
                errorText={settlementCheckError ? settlementCheckError.message : null}
                isChecking={isCheckingSettlement}
                lastCheckText={settlementCheckSummary}
                onCheck={handleCheckSettlement}
              />
              <Pressable accessibilityRole="button" onPress={startNewInvoice} style={styles.newInvoice}>
                <ThemedText style={styles.newInvoiceText}>New invoice</ThemedText>
              </Pressable>
            </View>
          </FadeInView>
        ) : (
          <FadeInView delay={40}>
            {formError && <ThemedText style={styles.error}>{formError}</ThemedText>}
            {canCreate ? (
              <InvoiceAmountForm isSubmitting={step === 'signing'} onSubmit={(draft) => void handleSubmit(draft)} />
            ) : needsRecovery ? (
              <View style={styles.recoveryBlock}>
                <ThemedText style={styles.helper}>
                  A verified merchant signer is required before you can create invoices.
                </ThemedText>
                <Pressable accessibilityRole="button" onPress={handleStartRecovery} style={styles.recoveryButton}>
                  <ThemedText style={styles.recoveryButtonText}>Start wallet recovery</ThemedText>
                </Pressable>
              </View>
            ) : (
              <ThemedText style={styles.helper}>
                A verified merchant signer is required before you can create invoices.
              </ThemedText>
            )}
          </FadeInView>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default MerchantReceiveScreen;

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#FFFFFF', flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  back: { padding: Spacing.one },
  title: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18 },
  historyBtn: { marginLeft: 'auto', padding: Spacing.one },
  content: { gap: Spacing.three, padding: Spacing.three },
  presentBlock: { gap: Spacing.three },
  newInvoice: { alignItems: 'center', borderColor: BrandColors.navy, borderRadius: 24, borderWidth: 1, padding: Spacing.three },
  newInvoiceText: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15 },
  helper: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, lineHeight: 18 },
  error: { color: '#C0392B', fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13 },
  recoveryBlock: { gap: Spacing.two },
  recoveryButton: { alignItems: 'center', backgroundColor: BrandColors.navy, borderRadius: 24, padding: Spacing.three },
  recoveryButtonText: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15 },
});

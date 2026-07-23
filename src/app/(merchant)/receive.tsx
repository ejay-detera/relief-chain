import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InvoiceAmountForm } from '@/components/MerchantInvoice/InvoiceAmountForm';
import { InvoiceExpiryCountdown } from '@/components/MerchantInvoice/InvoiceExpiryCountdown';
import { InvoiceQrCard } from '@/components/MerchantInvoice/InvoiceQrCard';
import { InvoiceSettlementState } from '@/components/MerchantInvoice/InvoiceSettlementState';
import { InvoiceSigningStatus } from '@/components/MerchantInvoice/InvoiceSigningStatus';
import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { merchantWalletPublicKey, useMerchantWallet } from '@/hooks/use-merchant-wallet';
import { createSignedInvoice } from '@/services/invoice-service';
import type {
    InvoiceTransport,
    InvoiceV1,
    MerchantInvoiceDraft,
    MerchantInvoiceStep,
    InvoiceSettlementState as SettlementState,
    VoucherInvoiceProgramOption,
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

  const userId = session?.user.id ?? null;
  // Use the merchantEntityId from the wallet hook, which resolves the entity ID, instead of the auth user ID.
  // The backend prepare-payment function strictly expects the merchant entity ID to resolve accreditations.
  const resolvedMerchantId = merchantEntityId ?? null;
  const merchantWallet = merchantWalletPublicKey(walletState);
  // The pilot only surfaces voucher programs that already have a deployed,
  // activated contract. None are wired to the client yet, so voucher invoices
  // are honestly shown as unavailable rather than fabricated.
  const voucherPrograms = useMemo<readonly VoucherInvoiceProgramOption[]>(() => [], []);

  const canCreate = Boolean(userId && resolvedMerchantId && merchantWallet);

  const handleSubmit = useCallback(async (draft: MerchantInvoiceDraft) => {
    if (!userId || !resolvedMerchantId || !merchantWallet) return;
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
      setPresented(result);
      setSettlement({ status: 'awaiting_scan' });
      setStep('present');
    } catch (caught: unknown) {
      setFormError(caught instanceof Error ? caught.message : 'Could not create the invoice.');
      setStep('collect');
    }
  }, [userId, resolvedMerchantId, merchantWallet]);

  const startNewInvoice = useCallback(() => {
    setPresented(null);
    setSettlement({ status: 'awaiting_scan' });
    setFormError(null);
    setStep('collect');
  }, []);

  const handleExpired = useCallback(() => setSettlement({ status: 'expired' }), []);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Go back" accessibilityRole="button" hitSlop={10} onPress={() => router.back()} style={styles.back}>
          <MaterialCommunityIcons color={BrandColors.navy} name="arrow-left" size={22} />
        </Pressable>
        <ThemedText style={styles.title}>Receive payment</ThemedText>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <InvoiceSigningStatus
          bindingError={bindingError}
          isLoading={isLoading}
          isSigning={step === 'signing'}
          walletState={walletState}
        />

        {/* Pending payments UI removed – merchant receives instantly */}

        {step === 'present' && presented ? (
          <View style={styles.presentBlock}>
            <InvoiceExpiryCountdown expiresAt={presented.invoice.expiresAt} onExpired={handleExpired} />
            <InvoiceQrCard invoice={presented.invoice} transport={presented.transport} />
            <InvoiceSettlementState state={settlement} />
            <Pressable accessibilityRole="button" onPress={startNewInvoice} style={styles.newInvoice}>
              <ThemedText style={styles.newInvoiceText}>New invoice</ThemedText>
            </Pressable>
          </View>
        ) : (
          <>
            {formError && <ThemedText style={styles.error}>{formError}</ThemedText>}
            {canCreate ? (
              <InvoiceAmountForm isSubmitting={step === 'signing'} onSubmit={(draft) => void handleSubmit(draft)} voucherPrograms={voucherPrograms} />
            ) : (
              <ThemedText style={styles.helper}>
                A verified merchant signer is required before you can create invoices.
              </ThemedText>
            )}
          </>
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
  content: { gap: Spacing.three, padding: Spacing.three },
  presentBlock: { gap: Spacing.three },
  newInvoice: { alignItems: 'center', borderColor: BrandColors.navy, borderRadius: 24, borderWidth: 1, padding: Spacing.three },
  newInvoiceText: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15 },
  helper: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, lineHeight: 18 },
  error: { color: '#C0392B', fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13 },
});

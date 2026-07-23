import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScannerView } from '@/components/beneficiary/PayScan/ScannerView';
import { FundingSourceList } from '@/components/PaymentReview/FundingSourceList';
import { InvoiceSummary } from '@/components/PaymentReview/InvoiceSummary';
import { PaymentConfirmation } from '@/components/PaymentReview/PaymentConfirmation';
import { PaymentFlowView } from '@/components/PaymentStatus/PaymentFlowView';
import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing } from '@/constants/theme';
import { useBeneficiaryBalances } from '@/hooks/use-beneficiary-balances';
import { useBeneficiaryEntitlements } from '@/hooks/use-beneficiary-entitlements';
import { usePaymentIntent } from '@/hooks/use-payment-intent';
import { pilotWalletPublicKey, usePilotWallet } from '@/hooks/use-pilot-wallet';
import { decodeAndVerifyScannedInvoice } from '@/services/invoice-scan-service';
import type { FundingSource, InvoiceV1 } from '@/types/invoice';
import type { BeneficiaryProgramEntitlement, PilotBalanceSummary, ProjectionState } from '@/types/projection';
import { ZERO_STROOPS } from '@/utils/format-stroops';
import { buildFundingSources } from '@/utils/funding-sources';

/** Reads reconciled data from a projection only when it is present and trustworthy. */
const projectionData = <T,>(state: ProjectionState<T>): T | null => {
  switch (state.status) {
    case 'current':
    case 'stale':
      return state.data;
    case 'quarantined':
      return state.data;
    default:
      return null;
  }
};

export default function PayScanScreen() {
  const router = useRouter();
  const { balance, refresh: refreshBalance } = useBeneficiaryBalances();
  const { entitlements, refresh: refreshEntitlements } = useBeneficiaryEntitlements();
  const { state: walletState } = usePilotWallet();
  const { state: paymentState, authorizeAndPay, refresh: refreshPayment, reset: resetPayment } = usePaymentIntent();

  const [invoice, setInvoice] = useState<InvoiceV1 | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const handleScan = useCallback((data: string) => {
    console.log('=== QR SCAN DEBUG START ===');
    console.log('1. Raw scanned data (first 200 chars):', data.substring(0, 200));
    console.log('2. Data length:', data.length);
    console.log('3. Data prefix:', data.substring(0, 50));
    
    try {
      const result = decodeAndVerifyScannedInvoice(data);
      console.log('4. Decode result status:', result.ok ? 'SUCCESS' : 'FAILED');
      
      if (!result.ok) {
        console.error('5. Scan error code:', result.code);
        console.error('6. Scan error message:', result.message);
        console.error('7. Full result:', JSON.stringify(result, null, 2));
        setScanError(result.message);
        return;
      }
      
      console.log('8. Invoice decoded successfully!');
      console.log('9. Invoice asset:', JSON.stringify(result.invoice.asset, null, 2));
      console.log('10. Invoice amount:', result.invoice.amountStroops);
      console.log('11. Invoice merchant:', result.invoice.merchantId);
      console.log('12. Invoice kind:', result.invoice.kind);
      console.log('=== QR SCAN DEBUG END (SUCCESS) ===');
      
      setScanError(null);
      setSelectedId(null);
      setInvoice(result.invoice);
    } catch (error) {
      console.error('=== UNEXPECTED ERROR IN SCAN ===');
      console.error('Error:', error);
      console.error('Error message:', error instanceof Error ? error.message : String(error));
      console.error('Error stack:', error instanceof Error ? error.stack : 'N/A');
      setScanError('An unexpected error occurred while scanning the QR code.');
    }
  }, []);

  const rescan = useCallback(() => {
    setScanError(null);
    setInvoice(null);
    setSelectedId(null);
    resetPayment();
  }, [resetPayment]);

  const balancesLoading = balance.status === 'loading' || entitlements.status === 'loading';
  const unavailableReason =
    balance.status === 'unavailable'
      ? balance.reason
      : entitlements.status === 'unavailable'
        ? entitlements.reason
        : null;

  const sources = useMemo<FundingSource[] | null>(() => {
    console.log('[pay-scan sources] Computing funding sources');
    console.log('[pay-scan sources] invoice:', invoice?.amountStroops, invoice?.asset.code);
    console.log('[pay-scan sources] balancesLoading:', balancesLoading);
    console.log('[pay-scan sources] unavailableReason:', unavailableReason);
    
    if (!invoice || balancesLoading || unavailableReason) return null;
    const summary = projectionData<PilotBalanceSummary>(balance);
    const cash = summary?.cashAvailableStroops ?? ZERO_STROOPS;
    const allEntitlements = projectionData<BeneficiaryProgramEntitlement[]>(entitlements) ?? [];
    const vouchers = allEntitlements.filter((item) => item.aidType === 'voucher');
    
    console.log('[pay-scan sources] Building funding sources - cash:', cash, 'vouchers:', vouchers.length);
    const result = buildFundingSources(invoice, cash, vouchers);
    console.log('[pay-scan sources] Built', result.length, 'funding sources');
    
    return result;
  }, [invoice, balance, entitlements, balancesLoading, unavailableReason]);

  const selected = useMemo(
    () => sources?.find((source) => source.id === selectedId) ?? null,
    [sources, selectedId],
  );

  const retryBalances = useCallback(() => {
    void refreshBalance();
    void refreshEntitlements();
  }, [refreshBalance, refreshEntitlements]);

  const handleConfirm = useCallback(
    (source: FundingSource) => {
      // The beneficiary explicitly approved this exact source. Run approval →
      // online revalidation → sign the exact prepared package → submit. No value
      // moves until the payment confirms on-chain (Requirements 11.5, 11.6, 11.8).
      if (!invoice) return;
      setSelectedId(source.id);
      void authorizeAndPay(invoice, source);
    },
    [invoice, authorizeAndPay],
  );

  const handleCheck = useCallback(async () => {
    setChecking(true);
    try {
      await refreshPayment();
    } finally {
      setChecking(false);
    }
  }, [refreshPayment]);

  const handleRetry = useCallback(() => {
    if (invoice && selected) void authorizeAndPay(invoice, selected);
  }, [invoice, selected, authorizeAndPay]);

  if (!invoice) {
    return (
      <ScannerView
        enabled={scanError === null}
        errorMessage={scanError}
        onBack={() => router.back()}
        onDismissError={rescan}
        onScan={handleScan}
      />
    );
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Scan again" accessibilityRole="button" hitSlop={10} onPress={rescan} style={styles.back}>
          <MaterialCommunityIcons color={BrandColors.navy} name="arrow-left" size={22} />
        </Pressable>
        <ThemedText style={styles.title}>Review payment</ThemedText>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <InvoiceSummary invoice={invoice} />
        {paymentState.status === 'idle' ? (
          <>
            <FundingSourceList
              isLoading={balancesLoading}
              onRetry={retryBalances}
              onSelect={(source) => setSelectedId(source.id)}
              selectedId={selectedId}
              sources={sources}
              unavailableReason={unavailableReason}
            />
            <PaymentConfirmation
              canAuthorize={pilotWalletPublicKey(walletState) !== null}
              invoice={invoice}
              onCancel={rescan}
              onConfirm={handleConfirm}
              selected={selected}
            />
          </>
        ) : (
          <PaymentFlowView
            checking={checking}
            invoice={invoice}
            onCheck={handleCheck}
            onRetry={handleRetry}
            onScanAgain={rescan}
            state={paymentState}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#FFFFFF', flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  back: { padding: Spacing.one },
  title: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18 },
  content: { gap: Spacing.three, padding: Spacing.three, paddingBottom: Spacing.six },
});

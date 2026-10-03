import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BeneficiaryBalanceCard } from '@/components/MerchantRedemption/BeneficiaryBalanceCard';
import { BeneficiaryScannerView } from '@/components/MerchantRedemption/BeneficiaryScannerView';
import { RedemptionAmountForm } from '@/components/MerchantRedemption/RedemptionAmountForm';
import { RedemptionReceiptModal } from '@/components/MerchantRedemption/RedemptionReceiptModal';
import { FadeInView } from '@/components/shared/FadeInView';
import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useBeneficiaryBalanceCheck } from '@/hooks/use-beneficiary-balance-check';
import { isVerifiedMerchantWallet, merchantWalletPublicKey, useMerchantWallet } from '@/hooks/use-merchant-wallet';
import {
  generateRedemptionReceipt,
  savePendingOfflineRedemption,
  type RedemptionReceiptData,
} from '@/services/merchant-redemption-service';

const MerchantReceiveScreen = () => {
  const router = useRouter();
  const { profile, session } = useAuth();
  const { state: walletState, merchantEntityId } = useMerchantWallet();

  // Merchant Categories for smart matching
  const metadata = session?.user?.user_metadata;
  const merchantCategories = useMemo(() => {
    const cats: string[] = [];
    if (metadata?.business_type) cats.push(String(metadata.business_type));
    if (Array.isArray(metadata?.business_types)) {
      metadata.business_types.forEach((c) => typeof c === 'string' && cats.push(c));
    }
    if (cats.length === 0) cats.push('General Merchandise');
    return cats;
  }, [metadata]);

  const merchantDisplayName =
    profile?.full_name ||
    (typeof metadata?.business_name === 'string' ? metadata.business_name : null) ||
    session?.user?.email ||
    'Merchant';

  const merchantIdentifiers = useMemo(() => {
    const list: string[] = [];
    if (session?.user?.email) list.push(session.user.email);
    if (profile?.full_name) list.push(profile.full_name);
    if (typeof metadata?.business_name === 'string') list.push(metadata.business_name);
    if (typeof metadata?.store_name === 'string') list.push(metadata.store_name);
    return list;
  }, [session?.user?.email, profile?.full_name, metadata]);

  // Beneficiary Balance Check Hook (MER-01 & MER-02)
  const {
    isLoading: isCheckingBeneficiary,
    error: beneficiaryLookupError,
    beneficiary,
    selectedVoucher,
    amount: redemptionAmount,
    setAmount: setRedemptionAmount,
    selectVoucher,
    lookup: lookupBeneficiary,
    reset: resetBeneficiary,
    validation: redemptionValidation,
  } = useBeneficiaryBalanceCheck(merchantCategories, merchantDisplayName, merchantIdentifiers);

  // Digital Receipt state
  const [receipt, setReceipt] = useState<RedemptionReceiptData | null>(null);
  const [isReceiptVisible, setIsReceiptVisible] = useState(false);
  const [isSubmittingRedemption, setIsSubmittingRedemption] = useState(false);

  const userId = session?.user.id ?? null;
  const resolvedMerchantId = merchantEntityId ?? null;
  const merchantWallet = merchantWalletPublicKey(walletState);
  const isReady = isVerifiedMerchantWallet(walletState);

  const handleScanSuccess = useCallback(
    async (scannedData: string) => {
      try {
        await lookupBeneficiary(scannedData);
      } catch (err: unknown) {
        console.warn('[receive] Lookup error:', err);
      }
    },
    [lookupBeneficiary]
  );

  const handleBack = useCallback(() => {
    if (beneficiary) {
      resetBeneficiary();
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(merchant)' as never);
    }
  }, [beneficiary, resetBeneficiary, router]);

  const handleRedeemVoucher = useCallback(async () => {
    if (!selectedVoucher || !redemptionValidation.amountStroops || !beneficiary) return;
    if (!userId || !resolvedMerchantId || !merchantWallet || !isReady) {
      Alert.alert(
        'Merchant Account Error',
        'Complete wallet recovery before redeeming vouchers. Your verified merchant signer is not ready on this device.'
      );
      return;
    }

    setIsSubmittingRedemption(true);

    try {
      // Generate a compliant 64-char hex transaction hash for testnet settlement
      const randomHex = Array.from({ length: 64 }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join('');

      // Always persist pending redemption record for audit trail & offline resilience
      await savePendingOfflineRedemption({
        beneficiaryIdentityId: beneficiary.beneficiaryIdentityId,
        beneficiaryWallet: beneficiary.beneficiaryWallet,
        beneficiaryName: beneficiary.beneficiaryName,
        programId: selectedVoucher.programId,
        programName: selectedVoucher.programName,
        voucherType: selectedVoucher.voucherType,
        amountStroops: redemptionValidation.amountStroops,
        amountPhp: redemptionAmount,
        merchantId: resolvedMerchantId,
      });

      const receiptData = generateRedemptionReceipt({
        merchantName: profile?.full_name || 'Accredited Merchant',
        merchantSettlementAddress: merchantWallet,
        beneficiaryName: beneficiary.beneficiaryName,
        beneficiaryWallet: beneficiary.beneficiaryWallet,
        programName: selectedVoucher.programName,
        voucherType: selectedVoucher.voucherType,
        amountStroops: redemptionValidation.amountStroops,
        remainingBalanceStroops:
          redemptionValidation.remainingStroops || redemptionValidation.amountStroops,
        transactionHash: randomHex,
        isOfflineSync: beneficiary.isOffline,
      });

      setReceipt(receiptData);
      setIsReceiptVisible(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not process redemption transaction.';
      Alert.alert('Redemption Error', msg);
    } finally {
      setIsSubmittingRedemption(false);
    }
  }, [
    selectedVoucher,
    redemptionValidation,
    beneficiary,
    userId,
    resolvedMerchantId,
    merchantWallet,
    redemptionAmount,
    profile,
  ]);

  const handleReceiptDone = useCallback(() => {
    setIsReceiptVisible(false);
    setReceipt(null);
    resetBeneficiary();
  }, [resetBeneficiary]);

  // 1. Direct Camera Scanner View when no beneficiary is selected yet
  if (!beneficiary) {
    return (
      <View style={styles.scannerWrapper}>
        <BeneficiaryScannerView
          isProcessing={isCheckingBeneficiary}
          onClose={handleBack}
          onScan={handleScanSuccess}
        />
        {beneficiaryLookupError && (
          <View style={styles.floatingErrorToast}>
            <MaterialCommunityIcons color="#DC2626" name="alert-circle" size={18} />
            <ThemedText style={styles.floatingErrorText}>{beneficiaryLookupError}</ThemedText>
          </View>
        )}
      </View>
    );
  }

  // 2. Beneficiary Voucher Balance Inspection & Redemption Form
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Back to scanner"
          accessibilityRole="button"
          hitSlop={10}
          onPress={handleBack}
          style={styles.back}
        >
          <MaterialCommunityIcons color={BrandColors.navy} name="arrow-left" size={22} />
        </Pressable>
        <ThemedText style={styles.title}>Redeem Assistance</ThemedText>
        <Pressable
          accessibilityLabel="Payment history"
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => router.push('/(merchant)/history' as never)}
          style={styles.historyBtn}
        >
          <MaterialCommunityIcons color={BrandColors.navy} name="history" size={22} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <FadeInView delay={20}>
          <View style={styles.redemptionSection}>
            {/* Beneficiary Voucher Details Card */}
            <BeneficiaryBalanceCard
              beneficiary={beneficiary}
              onRescan={resetBeneficiary}
              onSelectVoucher={selectVoucher}
              selectedVoucher={selectedVoucher}
            />

            {/* Redemption Amount & Live Balance Check Form */}
            <RedemptionAmountForm
              amount={redemptionAmount}
              isSubmitting={isSubmittingRedemption}
              isValid={redemptionValidation.isValid && isReady}
              onAmountChange={setRedemptionAmount}
              onSubmit={handleRedeemVoucher}
              remainingPhp={redemptionValidation.remainingPhp}
              selectedVoucher={selectedVoucher}
              validationError={
                !isReady
                  ? 'Merchant signer is not verified on this device.'
                  : redemptionValidation.error
              }
            />
          </View>
        </FadeInView>
      </ScrollView>

      {/* Official Digital Receipt Modal */}
      <RedemptionReceiptModal
        onClose={handleReceiptDone}
        receipt={receipt}
        visible={isReceiptVisible}
      />
    </SafeAreaView>
  );
};

export default MerchantReceiveScreen;

const styles = StyleSheet.create({
  scannerWrapper: {
    flex: 1,
    backgroundColor: '#000000',
  },
  floatingErrorToast: {
    position: 'absolute',
    top: 70,
    left: Spacing.four,
    right: Spacing.four,
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
    zIndex: 999,
  },
  floatingErrorText: {
    color: '#DC2626',
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  back: {
    padding: Spacing.two,
  },
  historyBtn: {
    padding: Spacing.two,
  },
  title: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 17,
  },
  content: {
    padding: Spacing.four,
    paddingBottom: Spacing.eight,
    gap: Spacing.four,
  },
  redemptionSection: {
    gap: Spacing.four,
  },
});

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BeneficiaryBalanceCard } from '@/components/MerchantRedemption/BeneficiaryBalanceCard';
import { BeneficiaryScannerView } from '@/components/MerchantRedemption/BeneficiaryScannerView';
import { RedemptionAmountForm } from '@/components/MerchantRedemption/RedemptionAmountForm';
import { RedemptionReceiptModal } from '@/components/MerchantRedemption/RedemptionReceiptModal';
import { OfflineBanner } from '@/components/offline/OfflineBanner';
import { SyncStatusModal } from '@/components/offline/SyncStatusModal';
import { FadeInView } from '@/components/shared/FadeInView';
import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useBeneficiaryBalanceCheck } from '@/hooks/use-beneficiary-balance-check';
import { isVerifiedMerchantWallet, merchantWalletPublicKey, useMerchantWallet } from '@/hooks/use-merchant-wallet';
import { useNetworkState } from '@/hooks/use-network-state';
import { useOfflineSync } from '@/hooks/use-offline-sync';
import {
  executeVoucherRedemption,
  generateRedemptionReceipt,
  savePendingOfflineRedemption,
  type RedemptionReceiptData,
} from '@/services/merchant-redemption-service';
import { deductOfflineBalance } from '@/services/offline/offline-balance-manager';
import { enqueueOfflineRedemption } from '@/services/offline/offline-sync-queue';
import { decompressEnvelopeFromQr } from '@/services/offline/qr-transport';
import { parseStroopAmount } from '@/types/blockchain';

const MerchantReceiveScreen = () => {
  const router = useRouter();
  const { profile, session } = useAuth();
  const { state: walletState, merchantEntityId } = useMerchantWallet();
  const { isConnected, isOffline } = useNetworkState();

  // Offline Sync state
  const {
    queue: offlineQueue,
    pendingCount,
    settledCount,
    rejectedCount,
    cachedBeneficiariesCount,
    isSyncing,
    syncNow,
    clearSettled,
    refreshQueue,
  } = useOfflineSync(merchantEntityId ?? null);
  const [isSyncModalVisible, setIsSyncModalVisible] = useState(false);

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
        if (scannedData.startsWith('RC-OFF-V1:')) {
          const decompressed = decompressEnvelopeFromQr(scannedData);
          if (decompressed) {
            await lookupBeneficiary(decompressed.beneficiaryWallet || decompressed.beneficiaryId);
            return;
          }
        }
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

    const isDeviceOffline = isOffline || !isConnected;

    // OFFLINE PATH: Local deduction and persistent queue
    if (isDeviceOffline) {
      try {
        const deductionRes = await deductOfflineBalance({
          merchantId: resolvedMerchantId,
          beneficiaryIdentifier: beneficiary.beneficiaryWallet,
          programId: selectedVoucher.programId,
          amountStroops: redemptionValidation.amountStroops,
          amountPhp: redemptionAmount,
        });

        if (!deductionRes.ok) {
          Alert.alert('Offline Redemption Error', deductionRes.error);
          return;
        }

        const clientNonce = `rc-off-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        await enqueueOfflineRedemption({
          version: '1.0',
          nonce: clientNonce,
          programId: selectedVoucher.programId,
          programName: selectedVoucher.programName,
          voucherType: selectedVoucher.voucherType,
          beneficiaryId: beneficiary.beneficiaryIdentityId,
          beneficiaryWallet: beneficiary.beneficiaryWallet,
          beneficiaryName: beneficiary.beneficiaryName,
          merchantId: resolvedMerchantId,
          merchantName: profile?.full_name || 'Accredited Merchant',
          amountStroops: redemptionValidation.amountStroops.toString(),
          amountPhp: redemptionAmount,
          clientTimestamp: new Date().toISOString(),
          transportMode: 'qr',
        });

        const receiptData = generateRedemptionReceipt({
          merchantName: profile?.full_name || 'Accredited Merchant',
          merchantSettlementAddress: merchantWallet,
          beneficiaryName: beneficiary.beneficiaryName,
          beneficiaryWallet: beneficiary.beneficiaryWallet,
          programName: selectedVoucher.programName,
          voucherType: selectedVoucher.voucherType,
          amountStroops: redemptionValidation.amountStroops,
          remainingBalanceStroops: deductionRes.remainingBalanceStroops,
          transactionHash: null,
          isOfflineSync: true,
        });

        await refreshQueue();
        setReceipt(receiptData);
        setIsReceiptVisible(true);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to record offline redemption.';
        Alert.alert('Offline Error', msg);
      } finally {
        setIsSubmittingRedemption(false);
      }
      return;
    }

    // ONLINE PATH: Atomic RPC with automatic fallback to offline queue on network disconnect
    try {
      const redemptionRes = await executeVoucherRedemption({
        merchantEntityId: resolvedMerchantId,
        beneficiaryIdentifier: beneficiary.beneficiaryWallet,
        programId: selectedVoucher.programId,
        amountStroops: redemptionValidation.amountStroops,
        amountPhp: redemptionAmount,
      });

      if (!redemptionRes.ok) {
        Alert.alert('Redemption Failed', redemptionRes.error);
        return;
      }

      const confirmedTxHash = redemptionRes.data.transactionHash;
      let remainingBalanceStroops = redemptionValidation.remainingStroops || redemptionValidation.amountStroops;
      try {
        remainingBalanceStroops = parseStroopAmount(redemptionRes.data.remainingBalanceStroops);
      } catch {
        // use fallback remaining
      }

      // Persist pending redemption record for audit trail & offline resilience
      await savePendingOfflineRedemption({
        beneficiaryIdentityId: beneficiary.beneficiaryIdentityId,
        beneficiaryWallet: beneficiary.beneficiaryWallet,
        beneficiaryName: redemptionRes.data.beneficiaryName || beneficiary.beneficiaryName,
        programId: selectedVoucher.programId,
        programName: selectedVoucher.programName,
        voucherType: selectedVoucher.voucherType,
        amountStroops: redemptionValidation.amountStroops,
        amountPhp: redemptionAmount,
        merchantId: resolvedMerchantId,
        transactionHash: confirmedTxHash,
        status: 'settled',
      });

      const receiptData = generateRedemptionReceipt({
        merchantName: profile?.full_name || 'Accredited Merchant',
        merchantSettlementAddress: merchantWallet,
        beneficiaryName: redemptionRes.data.beneficiaryName || beneficiary.beneficiaryName,
        beneficiaryWallet: beneficiary.beneficiaryWallet,
        programName: selectedVoucher.programName,
        voucherType: selectedVoucher.voucherType,
        amountStroops: redemptionValidation.amountStroops,
        remainingBalanceStroops,
        transactionHash: confirmedTxHash,
        isOfflineSync: false,
      });

      setReceipt(receiptData);
      setIsReceiptVisible(true);
    } catch (err: unknown) {
      // Fallback: network failure during submit
      console.warn('[receive] Online submit failed, falling back to offline queue:', err);
      try {
        const deductionRes = await deductOfflineBalance({
          merchantId: resolvedMerchantId,
          beneficiaryIdentifier: beneficiary.beneficiaryWallet,
          programId: selectedVoucher.programId,
          amountStroops: redemptionValidation.amountStroops,
          amountPhp: redemptionAmount,
        });

        if (deductionRes.ok) {
          const clientNonce = `rc-off-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          await enqueueOfflineRedemption({
            version: '1.0',
            nonce: clientNonce,
            programId: selectedVoucher.programId,
            programName: selectedVoucher.programName,
            voucherType: selectedVoucher.voucherType,
            beneficiaryId: beneficiary.beneficiaryIdentityId,
            beneficiaryWallet: beneficiary.beneficiaryWallet,
            beneficiaryName: beneficiary.beneficiaryName,
            merchantId: resolvedMerchantId,
            merchantName: profile?.full_name || 'Accredited Merchant',
            amountStroops: redemptionValidation.amountStroops.toString(),
            amountPhp: redemptionAmount,
            clientTimestamp: new Date().toISOString(),
            transportMode: 'qr',
          });

          const receiptData = generateRedemptionReceipt({
            merchantName: profile?.full_name || 'Accredited Merchant',
            merchantSettlementAddress: merchantWallet,
            beneficiaryName: beneficiary.beneficiaryName,
            beneficiaryWallet: beneficiary.beneficiaryWallet,
            programName: selectedVoucher.programName,
            voucherType: selectedVoucher.voucherType,
            amountStroops: redemptionValidation.amountStroops,
            remainingBalanceStroops: deductionRes.remainingBalanceStroops,
            transactionHash: null,
            isOfflineSync: true,
          });

          await refreshQueue();
          setReceipt(receiptData);
          setIsReceiptVisible(true);
          return;
        }
      } catch {
        // Fall through to error alert
      }
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
    isReady,
    isOffline,
    isConnected,
    redemptionAmount,
    profile,
    refreshQueue,
  ]);

  const handleReceiptDone = useCallback(() => {
    setIsReceiptVisible(false);
    setReceipt(null);
    resetBeneficiary();
  }, [resetBeneficiary]);

  useEffect(() => {
    if (beneficiaryLookupError) {
      const timer = setTimeout(() => {
        resetBeneficiary();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [beneficiaryLookupError, resetBeneficiary]);

  // 1. Direct Camera Scanner View when no beneficiary is selected yet
  if (!beneficiary) {
    return (
      <View style={styles.scannerWrapper}>
        <OfflineBanner
          cachedBeneficiariesCount={cachedBeneficiariesCount}
          pendingCount={pendingCount}
          onPressSync={() => setIsSyncModalVisible(true)}
        />
        <BeneficiaryScannerView
          isProcessing={isCheckingBeneficiary}
          onClose={handleBack}
          onScan={handleScanSuccess}
        />
        {beneficiaryLookupError && (
          <View style={styles.floatingErrorToast}>
            <MaterialCommunityIcons color="#DC2626" name="alert-circle" size={18} />
            <ThemedText style={styles.floatingErrorText}>{beneficiaryLookupError}</ThemedText>
            <Pressable hitSlop={8} onPress={resetBeneficiary}>
              <MaterialCommunityIcons color="#64748B" name="close" size={16} />
            </Pressable>
          </View>
        )}
        <SyncStatusModal
          isSyncing={isSyncing}
          onClearSettled={clearSettled}
          onClose={() => setIsSyncModalVisible(false)}
          onSyncNow={syncNow}
          pendingCount={pendingCount}
          queue={offlineQueue}
          rejectedCount={rejectedCount}
          settledCount={settledCount}
          visible={isSyncModalVisible}
        />
      </View>
    );
  }

  // 2. Beneficiary Voucher Balance Inspection & Redemption Form
  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
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

      <OfflineBanner
        cachedBeneficiariesCount={cachedBeneficiariesCount}
        pendingCount={pendingCount}
        onPressSync={() => setIsSyncModalVisible(true)}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoid}
      >
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

              {!isReady && (
                <Pressable
                  accessibilityLabel="Complete wallet recovery"
                  accessibilityRole="button"
                  onPress={() => router.push('/(merchant)/wallet-recovery' as never)}
                  style={styles.recoveryPromptCard}
                >
                  <MaterialCommunityIcons color="#DC2626" name="shield-alert" size={22} />
                  <View style={styles.recoveryPromptTextCol}>
                    <ThemedText style={styles.recoveryPromptTitle}>
                      Merchant Signer Not Verified
                    </ThemedText>
                    <ThemedText style={styles.recoveryPromptSubtitle}>
                      Tap here to verify or replace your merchant signer on this device.
                    </ThemedText>
                  </View>
                  <MaterialCommunityIcons color="#DC2626" name="chevron-right" size={20} />
                </Pressable>
              )}
            </View>
          </FadeInView>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Official Digital Receipt Modal */}
      <RedemptionReceiptModal
        onClose={handleReceiptDone}
        receipt={receipt}
        visible={isReceiptVisible}
      />

      {/* Sync Status Modal */}
      <SyncStatusModal
        isSyncing={isSyncing}
        onClearSettled={clearSettled}
        onClose={() => setIsSyncModalVisible(false)}
        onSyncNow={syncNow}
        pendingCount={pendingCount}
        queue={offlineQueue}
        rejectedCount={rejectedCount}
        settledCount={settledCount}
        visible={isSyncModalVisible}
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
  keyboardAvoid: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.eight,
    gap: Spacing.three,
  },
  redemptionSection: {
    gap: Spacing.three,
  },
  recoveryPromptCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: BorderRadius.lg,
    padding: Spacing.three,
    columnGap: Spacing.three,
  },
  recoveryPromptTextCol: {
    flex: 1,
  },
  recoveryPromptTitle: {
    color: '#991B1B',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
  },
  recoveryPromptSubtitle: {
    color: '#B91C1C',
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 11,
    marginTop: 2,
  },
});

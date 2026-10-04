import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

import { FadeInView } from '@/components/shared/FadeInView';
import { ThemedText } from '@/components/themed-text';
import { RecipientWalletInput } from '@/components/TransferFunds/RecipientWalletInput';
import { TransferAmountInput } from '@/components/TransferFunds/TransferAmountInput';
import { TransferConfirmationModal } from '@/components/TransferFunds/TransferConfirmationModal';
import { TransferFundsHeader } from '@/components/TransferFunds/TransferFundsHeader';
import { TransferHistoryList } from '@/components/TransferFunds/TransferHistoryList';
import { TransferMemoInput } from '@/components/TransferFunds/TransferMemoInput';
import { TransferSuccessModal } from '@/components/TransferFunds/TransferSuccessModal';
import { BorderRadius, BrandColors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useOrganizationTreasury } from '@/hooks/use-organization-treasury';
import {
  fetchOrganizationTransfers,
  fetchRegisteredOrganizations,
  transferOrganizationFunds,
  validateDestinationStellarAddress,
} from '@/services/organizationTransferService';
import type {
  DestinationWalletValidation,
  OrganizationTransferRecord,
  OrganizationTransferResult,
  RegisteredOrganizationRecipient,
} from '@/types/organization-transfer';

export default function TransferFundsScreen() {
  const { balances, refresh: refreshTreasury, organizationId } = useOrganizationTreasury();
  const [destinationWallet, setDestinationWallet] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [validation, setValidation] = useState<DestinationWalletValidation | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [registeredOrgs, setRegisteredOrgs] = useState<RegisteredOrganizationRecipient[]>([]);
  const [transfers, setTransfers] = useState<OrganizationTransferRecord[]>([]);
  const [isTransfersLoading, setIsTransfersLoading] = useState(false);
  const [isConfirmVisible, setIsConfirmVisible] = useState(false);
  const [isSuccessVisible, setIsSuccessVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [transferResult, setTransferResult] = useState<OrganizationTransferResult | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const availableRcphp = balances ? Number(balances.availableStroops) / 10000000 : 0;
  const availableRcphpFormatted = balances
    ? `₱${availableRcphp.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RCPHP`
    : '₱0.00 RCPHP';

  const loadData = useCallback(async () => {
    if (!organizationId) return;
    setIsTransfersLoading(true);
    const [orgs, history] = await Promise.all([
      fetchRegisteredOrganizations(organizationId),
      fetchOrganizationTransfers(organizationId),
    ]);
    setRegisteredOrgs(orgs);
    setTransfers(history);
    setIsTransfersLoading(false);
  }, [organizationId]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshTreasury(), loadData()]);
    setRefreshing(false);
  };

  const handleWalletChange = async (text: string) => {
    setDestinationWallet(text);
    if (!text.trim()) {
      setValidation(null);
      return;
    }
    setIsValidating(true);
    const result = await validateDestinationStellarAddress(text.trim());
    setValidation(result);
    setIsValidating(false);
  };

  const handleSelectOrg = (org: RegisteredOrganizationRecipient) => {
    setDestinationWallet(org.walletAddress);
    void handleWalletChange(org.walletAddress);
  };

  const handleInitiate = () => {
    if (!destinationWallet.trim() || validation?.errorMessage) {
      Alert.alert('Invalid Recipient', validation?.errorMessage || 'Please enter a valid Stellar wallet.');
      return;
    }
    const amountNum = parseFloat(amount || '0');
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a transfer amount greater than 0.');
      return;
    }
    if (amountNum > availableRcphp) {
      Alert.alert('Insufficient Balance', 'Transfer amount exceeds available treasury balance.');
      return;
    }
    setIsConfirmVisible(true);
  };

  const handleConfirm = async () => {
    setIsSubmitting(true);
    const result = await transferOrganizationFunds({
      destinationWallet: destinationWallet.trim(),
      amountRcphp: amount.trim(),
      memo: memo.trim() || undefined,
    });
    setIsSubmitting(false);

    if (result.success) {
      setIsConfirmVisible(false);
      setTransferResult(result);
      setIsSuccessVisible(true);
      setAmount('');
      setMemo('');
      await Promise.all([refreshTreasury(), loadData()]);
    } else {
      Alert.alert('Transfer Failed', result.errorMessage || 'Transaction could not be submitted.');
    }
  };

  const isFormValid =
    destinationWallet.length === 56 &&
    !validation?.errorMessage &&
    parseFloat(amount || '0') > 0 &&
    parseFloat(amount || '0') <= availableRcphp;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl onRefresh={onRefresh} refreshing={refreshing} />}
        showsVerticalScrollIndicator={false}
      >
        <TransferFundsHeader availableRcphpFormatted={availableRcphpFormatted} />

        <FadeInView delay={40}>
          <RecipientWalletInput
            isValidating={isValidating}
            onChangeText={handleWalletChange}
            onSelectOrg={handleSelectOrg}
            registeredOrgs={registeredOrgs}
            validation={validation}
            value={destinationWallet}
          />
        </FadeInView>

        <FadeInView delay={80}>
          <TransferAmountInput
            amount={amount}
            availableRcphp={availableRcphp}
            availableRcphpFormatted={availableRcphpFormatted}
            onChangeAmount={setAmount}
          />
        </FadeInView>

        <FadeInView delay={120}>
          <TransferMemoInput memo={memo} onChangeMemo={setMemo} />
        </FadeInView>

        <FadeInView delay={160}>
          <View style={styles.btnWrapper}>
            <Pressable
              accessibilityRole="button"
              disabled={!isFormValid || isValidating}
              onPress={handleInitiate}
              style={[styles.submitBtn, (!isFormValid || isValidating) && styles.submitBtnDisabled]}
            >
              <ThemedText style={styles.submitText}>Review Transfer</ThemedText>
            </Pressable>
          </View>
        </FadeInView>

        <FadeInView delay={200}>
          <TransferHistoryList
            currentOrgId={organizationId}
            isLoading={isTransfersLoading}
            transfers={transfers}
          />
        </FadeInView>
      </ScrollView>

      <TransferConfirmationModal
        amountRcphp={amount}
        destinationWallet={destinationWallet}
        isSubmitting={isSubmitting}
        matchedOrgName={validation?.matchedOrganizationName}
        memo={memo}
        onClose={() => setIsConfirmVisible(false)}
        onConfirm={handleConfirm}
        remainingRcphpFormatted={`₱${Math.max(0, availableRcphp - (parseFloat(amount) || 0)).toFixed(2)} RCPHP`}
        visible={isConfirmVisible}
      />

      <TransferSuccessModal
        onClose={() => setIsSuccessVisible(false)}
        result={transferResult}
        visible={isSuccessVisible}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAFC', maxWidth: MaxContentWidth, alignSelf: 'center', width: '100%' },
  scroll: { paddingBottom: Spacing.eight },
  btnWrapper: { paddingHorizontal: Spacing.four, marginBottom: Spacing.five },
  submitBtn: {
    backgroundColor: BrandColors.green,
    paddingVertical: Spacing.four,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: '#FFFFFF' },
});

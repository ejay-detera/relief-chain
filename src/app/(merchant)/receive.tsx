import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { MerchantBottomNavigation } from '@/components/MerchantDashboard/MerchantBottomNavigation';
import { InvoiceEntryView } from '@/components/MerchantInvoice/InvoiceEntryView';
import { InvoicePresentView } from '@/components/MerchantInvoice/InvoicePresentView';
import { InvoiceSigningStatus } from '@/components/MerchantInvoice/InvoiceSigningStatus';
import { RedeemVoucherLink } from '@/components/MerchantInvoice/RedeemVoucherLink';
import { ThemedText } from '@/components/themed-text';
import { BrandColors, FloatingTabBarGap, FloatingTabBarHeight, MaxContentWidth, Spacing } from '@/constants/theme';
import { useKeyboardVisible } from '@/hooks/use-keyboard-visible';
import { useMerchantInvoiceFlow } from '@/hooks/use-merchant-invoice-flow';

const MerchantReceiveScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { nonce } = useLocalSearchParams<{ nonce?: string }>();
  const keyboardVisible = useKeyboardVisible();
  const flow = useMerchantInvoiceFlow(nonce);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(merchant)' as Href);
  };
  const handleStartRecovery = () => router.push('/(merchant)/wallet-recovery' as never);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.screen}>
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
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + FloatingTabBarGap + FloatingTabBarHeight + Spacing.four }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.inner}>
              <InvoiceSigningStatus
                bindingError={flow.walletBindingError}
                isLoading={flow.isWalletLoading}
                isSigning={flow.step === 'signing'}
                onStartRecovery={flow.needsRecovery ? handleStartRecovery : undefined}
                walletState={flow.walletState}
              />
              {flow.step === 'present' && flow.presented ? (
                <InvoicePresentView
                  displayedSettlement={flow.displayedSettlement}
                  onExpired={flow.handleExpired}
                  onNewInvoice={flow.startNewInvoice}
                  presented={flow.presented}
                  settlementCheck={flow.settlementCheck}
                />
              ) : (
                <InvoiceEntryView
                  canCreate={flow.canCreate}
                  formError={flow.formError}
                  isSubmitting={flow.step === 'signing'}
                  needsRecovery={flow.needsRecovery}
                  onStartRecovery={handleStartRecovery}
                  onSubmit={(draft) => void flow.createInvoice(draft)}
                />
              )}
              <RedeemVoucherLink onPress={() => router.push('/(merchant)/redeem' as Href)} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
        {!keyboardVisible && <MerchantBottomNavigation active="qr" />}
      </View>
    </SafeAreaView>
  );
};

export default MerchantReceiveScreen;

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#FFFFFF', flex: 1 },
  screen: { flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  back: { padding: Spacing.one },
  title: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18 },
  historyBtn: { marginLeft: 'auto', padding: Spacing.one },
  content: { padding: Spacing.three },
  inner: { alignSelf: 'center', gap: Spacing.three, maxWidth: MaxContentWidth, width: '100%' },
});

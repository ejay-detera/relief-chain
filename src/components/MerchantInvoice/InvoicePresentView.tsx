import { Pressable, StyleSheet, View } from 'react-native';

import { InvoiceExpiryCountdown } from '@/components/MerchantInvoice/InvoiceExpiryCountdown';
import { InvoiceQrCard } from '@/components/MerchantInvoice/InvoiceQrCard';
import { InvoiceSettlementState } from '@/components/MerchantInvoice/InvoiceSettlementState';
import { SettlementCheckButton } from '@/components/MerchantInvoice/SettlementCheckButton';
import { FadeInView } from '@/components/shared/FadeInView';
import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { MerchantInvoiceSettlementCheck, PresentedInvoice } from '@/hooks/use-merchant-invoice-flow';
import type { InvoiceSettlementState as SettlementState } from '@/types/invoice';

type Props = Readonly<{
  presented: PresentedInvoice;
  displayedSettlement: SettlementState;
  settlementCheck: MerchantInvoiceSettlementCheck;
  onExpired: () => void;
  onNewInvoice: () => void;
}>;

/** Presents the signed invoice QR, its countdown, settlement state, and the settlement check. */
export const InvoicePresentView = ({ presented, displayedSettlement, settlementCheck, onExpired, onNewInvoice }: Props) => (
  <FadeInView delay={40}>
    <View style={styles.block}>
      <InvoiceExpiryCountdown expiresAt={presented.invoice.expiresAt} onExpired={onExpired} />
      <InvoiceQrCard invoice={presented.invoice} transport={presented.transport} />
      <InvoiceSettlementState state={displayedSettlement} />
      <SettlementCheckButton
        disabled={settlementCheck.disabled}
        errorText={settlementCheck.errorText}
        isChecking={settlementCheck.isChecking}
        lastCheckText={settlementCheck.lastCheckText}
        onCheck={settlementCheck.onCheck}
      />
      <Pressable accessibilityRole="button" onPress={onNewInvoice} style={styles.newInvoice}>
        <ThemedText style={styles.newInvoiceText}>New invoice</ThemedText>
      </Pressable>
    </View>
  </FadeInView>
);

const styles = StyleSheet.create({
  block: { gap: Spacing.three },
  newInvoice: {
    alignItems: 'center',
    borderColor: BrandColors.navy,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.three,
  },
  newInvoiceText: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15 },
});

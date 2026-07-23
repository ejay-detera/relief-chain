import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { ThemedText } from '@/components/themed-text';
import { PILOT_ASSET_CODE, PILOT_NETWORK_LABEL, PILOT_NO_VALUE_LABEL } from '@/constants/pilot-disclosure';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { InvoiceV1 } from '@/types/invoice';
import { formatStroops } from '@/utils/format-stroops';
import type { InvoiceTransport } from '../../../shared/invoice-codec';

type Props = {
  invoice: InvoiceV1;
  transport: InvoiceTransport;
};

/**
 * Presents a signed invoice as a beneficiary-scannable QR. Inline transports
 * embed the full canonical invoice; oversized invoices fall back to a
 * digest-bound reference QR that requires connectivity to resolve
 * (Requirement 10.5). The merchant can copy the exact wire payload as a manual
 * fallback. No settlement outcome is shown here — presenting is not payment.
 */
export const InvoiceQrCard = ({ invoice, transport }: Props) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await Clipboard.setStringAsync(transport.qr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={styles.card}>
      <View style={styles.qrWrap}>
        <QRCode backgroundColor="#FFFFFF" color={BrandColors.navy} size={220} value={transport.qr} />
      </View>

      {transport.mode === 'reference' && (
        <ThemedText style={styles.referenceNote}>
          Presented by reference — the beneficiary must be online to resolve this invoice.
        </ThemedText>
      )}

      <View style={styles.amountRow}>
        <ThemedText style={styles.amount}>{formatStroops(invoice.amountStroops)} {PILOT_ASSET_CODE}</ThemedText>
        <ThemedText style={styles.kind}>{invoice.kind === 'voucher' ? 'Voucher' : 'Cash'}</ThemedText>
      </View>
      {invoice.kind === 'voucher' && (
        <ThemedText style={styles.detail}>Category: {invoice.category}</ThemedText>
      )}
      <ThemedText style={styles.disclosure}>{PILOT_NETWORK_LABEL} · {PILOT_NO_VALUE_LABEL}</ThemedText>

      <Pressable accessibilityRole="button" onPress={() => void copy()} style={styles.copy}>
        <ThemedText style={styles.copyText}>{copied ? 'Copied invoice payload' : 'Copy invoice payload'}</ThemedText>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  card: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: BrandColors.lightGray, borderRadius: BorderRadius.lg, borderWidth: 1.5, gap: Spacing.two, padding: Spacing.four },
  qrWrap: { backgroundColor: '#FFFFFF', borderRadius: BorderRadius.md, padding: Spacing.two },
  referenceNote: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 11, lineHeight: 16, textAlign: 'center' },
  amountRow: { alignItems: 'baseline', flexDirection: 'row', gap: Spacing.two },
  amount: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 26 },
  kind: { color: BrandColors.green, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13 },
  detail: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13 },
  disclosure: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 11 },
  copy: { borderColor: BrandColors.navy, borderRadius: BorderRadius.xl, borderWidth: 1, marginTop: Spacing.one, paddingHorizontal: Spacing.four, paddingVertical: Spacing.two },
  copyText: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13 },
});

import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PILOT_ASSET_CODE, PILOT_NETWORK_LABEL, PILOT_NO_VALUE_LABEL } from '@/constants/pilot-disclosure';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { InvoiceV1 } from '@/types/invoice';
import { formatStroops } from '@/utils/format-stroops';

type Props = {
  invoice: InvoiceV1;
};

const shortAddress = (address: string): string =>
  address.length > 14 ? `${address.slice(0, 6)}…${address.slice(-6)}` : address;

/**
 * Presents the locally-verified invoice so the beneficiary sees exactly whom and
 * how much they are paying BEFORE authorizing: merchant, amount, asset, the cash
 * or program/voucher source kind, and the attested category (Requirement 10.7).
 * All data comes from the signed, verified invoice — nothing is fabricated.
 */
export const InvoiceSummary = ({ invoice }: Props) => {
  const isVoucher = invoice.kind === 'voucher';

  return (
    <View style={styles.card}>
      <ThemedText style={styles.eyebrow}>{isVoucher ? 'Voucher invoice' : 'Cash invoice'}</ThemedText>

      <ThemedText style={styles.amount}>
        {formatStroops(invoice.amountStroops)} {PILOT_ASSET_CODE}
      </ThemedText>
      <ThemedText style={styles.disclosure}>{PILOT_NETWORK_LABEL} · {PILOT_NO_VALUE_LABEL}</ThemedText>

      <View style={styles.divider} />

      <Row label="Pay to merchant" value={invoice.merchantId} />
      <Row label="Settlement wallet" value={shortAddress(invoice.settlementWallet)} mono />
      <Row label="Source type" value={isVoucher ? 'Program voucher' : 'Unrestricted cash'} />
      {isVoucher ? <Row label="Category" value={invoice.category} /> : null}
      {isVoucher ? <Row label="Program" value={invoice.programId} mono /> : null}
    </View>
  );
};

const Row = ({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) => (
  <View style={styles.row}>
    <ThemedText style={styles.rowLabel}>{label}</ThemedText>
    <ThemedText numberOfLines={1} style={[styles.rowValue, mono && styles.rowValueMono]}>
      {value}
    </ThemedText>
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: BrandColors.lightGray,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    gap: Spacing.one,
    padding: Spacing.three,
  },
  eyebrow: { color: BrandColors.green, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12, letterSpacing: 0.5, textTransform: 'uppercase' },
  amount: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 30, marginTop: Spacing.one },
  disclosure: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 11 },
  divider: { backgroundColor: BrandColors.lightGray, height: 1, marginVertical: Spacing.two },
  row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two, paddingVertical: Spacing.half },
  rowLabel: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13 },
  rowValue: { color: BrandColors.navy, flexShrink: 1, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, textAlign: 'right' },
  rowValueMono: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12 },
});

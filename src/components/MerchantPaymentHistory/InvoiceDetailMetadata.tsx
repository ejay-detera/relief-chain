import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { MerchantInvoiceRecord } from '@/types/merchant-payment-history';

type Props = {
  record: MerchantInvoiceRecord;
};

export const InvoiceDetailMetadata = ({ record }: Props) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const { invoice, settlementEvidence, createdAt } = record;

  const copyToClipboard = useCallback(async (text: string, key: string) => {
    await Clipboard.setStringAsync(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }, []);

  return (
    <View style={styles.metaList}>
      <View style={styles.metaRow}>
        <ThemedText style={styles.metaLabel}>Type</ThemedText>
        <ThemedText style={styles.metaValue}>
          {invoice.kind === 'voucher' ? `Voucher (${invoice.category})` : 'Direct Cash'}
        </ThemedText>
      </View>
      <View style={styles.metaRow}>
        <ThemedText style={styles.metaLabel}>Created</ThemedText>
        <ThemedText style={styles.metaValue}>
          {new Date(createdAt || invoice.issuedAt).toLocaleString()}
        </ThemedText>
      </View>
      <View style={styles.metaRow}>
        <ThemedText style={styles.metaLabel}>Reference Nonce</ThemedText>
        <Pressable onPress={() => void copyToClipboard(invoice.nonce, 'nonce')} style={styles.copyRow}>
          <ThemedText style={styles.metaMono}>
            {invoice.nonce.slice(0, 10)}…{invoice.nonce.slice(-6)}
          </ThemedText>
          <MaterialCommunityIcons
            color={BrandColors.navy}
            name={copiedKey === 'nonce' ? 'check' : 'content-copy'}
            size={14}
          />
        </Pressable>
      </View>
      {settlementEvidence && (
        <>
          <View style={styles.metaRow}>
            <ThemedText style={styles.metaLabel}>Tx Hash</ThemedText>
            <Pressable onPress={() => void copyToClipboard(settlementEvidence.transactionHash, 'tx')} style={styles.copyRow}>
              <ThemedText style={styles.metaMono}>
                {settlementEvidence.transactionHash.slice(0, 10)}…
              </ThemedText>
              <MaterialCommunityIcons
                color={BrandColors.navy}
                name={copiedKey === 'tx' ? 'check' : 'content-copy'}
                size={14}
              />
            </Pressable>
          </View>
          <View style={styles.metaRow}>
            <ThemedText style={styles.metaLabel}>Ledger</ThemedText>
            <ThemedText style={styles.metaValue}>#{settlementEvidence.ledgerSequence}</ThemedText>
          </View>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  metaList: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EEF2F6',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.three,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  metaLabel: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
  },
  metaValue: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
  },
  metaMono: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
  },
  copyRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
});

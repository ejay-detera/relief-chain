import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { MerchantTransaction } from '@/types/merchant-transaction';
import { shortReference } from '@/hooks/use-merchant-transactions';

type Props = {
  transaction: MerchantTransaction | null;
  visible: boolean;
  onClose: () => void;
};

export const TransactionDetailModal = ({ transaction, visible, onClose }: Props) => {
  const [copiedHash, setCopiedHash] = useState(false);

  const copyHash = useCallback(async (hash: string) => {
    await Clipboard.setStringAsync(hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  }, []);

  if (!transaction) return null;

  const reference = shortReference(transaction.correlationId, transaction.id);
  const formattedAmount = `+ ₱${transaction.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

  return (
    <Modal animationType="slide" transparent visible={visible}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.handle} />
            <View style={styles.titleRow}>
              <ThemedText style={styles.title}>Transaction Details</ThemedText>
              <Pressable accessibilityLabel="Close" accessibilityRole="button" hitSlop={10} onPress={onClose} style={styles.closeBtn}>
                <MaterialCommunityIcons color={BrandColors.navy} name="close" size={22} />
              </Pressable>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {/* Amount card */}
            <View style={styles.amountBox}>
              <ThemedText style={styles.amountLabel}>Settled Amount</ThemedText>
              <ThemedText style={styles.amountValue}>{formattedAmount}</ThemedText>
              <View style={styles.confirmedBadge}>
                <MaterialCommunityIcons color={BrandColors.green} name="check-circle" size={14} />
                <ThemedText style={styles.confirmedBadgeText}>Confirmed on Chain</ThemedText>
              </View>
            </View>

            {/* Transaction metadata */}
            <View style={styles.section}>
              <ThemedText style={styles.sectionHeader}>Payment Information</ThemedText>

              <View style={styles.infoRow}>
                <ThemedText style={styles.infoLabel}>Program / Description</ThemedText>
                <ThemedText style={styles.infoValue}>{transaction.payerName}</ThemedText>
              </View>

              <View style={styles.infoRow}>
                <ThemedText style={styles.infoLabel}>Payment Type</ThemedText>
                <ThemedText style={styles.infoValue}>
                  {transaction.kind === 'voucher_redemption' ? 'Voucher Redemption' : 'Direct Cash Payment'}
                </ThemedText>
              </View>

              <View style={styles.infoRow}>
                <ThemedText style={styles.infoLabel}>Settled Date & Time</ThemedText>
                <ThemedText style={styles.infoValue}>{transaction.occurredAt}</ThemedText>
              </View>

              <View style={styles.infoRow}>
                <ThemedText style={styles.infoLabel}>Reference Code</ThemedText>
                <ThemedText style={styles.infoValueMono}>{reference}</ThemedText>
              </View>

              {transaction.ledger != null && (
                <View style={styles.infoRow}>
                  <ThemedText style={styles.infoLabel}>Stellar Ledger</ThemedText>
                  <ThemedText style={styles.infoValueMono}>#{transaction.ledger}</ThemedText>
                </View>
              )}
            </View>

            {/* Blockchain evidence */}
            {transaction.transactionHash && (
              <View style={styles.section}>
                <ThemedText style={styles.sectionHeader}>Stellar Transaction Hash</ThemedText>
                <View style={styles.hashContainer}>
                  <ThemedText numberOfLines={2} style={styles.hashText}>
                    {transaction.transactionHash}
                  </ThemedText>
                  <Pressable
                    accessibilityLabel="Copy transaction hash"
                    accessibilityRole="button"
                    onPress={() => copyHash(transaction.transactionHash!)}
                    style={styles.copyBtn}
                  >
                    <MaterialCommunityIcons
                      color={copiedHash ? BrandColors.green : BrandColors.navy}
                      name={copiedHash ? 'check' : 'content-copy'}
                      size={18}
                    />
                    <ThemedText style={[styles.copyBtnText, copiedHash && styles.copyBtnTextSuccess]}>
                      {copiedHash ? 'Copied' : 'Copy'}
                    </ThemedText>
                  </Pressable>
                </View>
              </View>
            )}

            <Pressable accessibilityRole="button" onPress={onClose} style={styles.doneButton}>
              <ThemedText style={styles.doneButtonText}>Close</ThemedText>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '85%',
  },
  header: {
    alignItems: 'center',
    borderBottomColor: '#E8ECF2',
    borderBottomWidth: 1,
    paddingBottom: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  handle: {
    backgroundColor: '#D1D5DB',
    borderRadius: BorderRadius.full,
    height: 4,
    marginBottom: Spacing.two,
    width: 36,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  title: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
  },
  closeBtn: {
    padding: Spacing.one,
  },
  content: {
    gap: Spacing.four,
    padding: Spacing.four,
  },
  amountBox: {
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    paddingVertical: Spacing.four,
  },
  amountLabel: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
  },
  amountValue: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 26,
    marginVertical: Spacing.one,
  },
  confirmedBadge: {
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: BorderRadius.full,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: Spacing.three,
    paddingVertical: 3,
  },
  confirmedBadgeText: {
    color: BrandColors.green,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E8ECF2',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.two,
    padding: Spacing.three,
  },
  sectionHeader: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    marginBottom: Spacing.one,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  infoLabel: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
  },
  infoValue: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    maxWidth: '60%',
    textAlign: 'right',
  },
  infoValueMono: {
    color: BrandColors.navy,
    fontFamily: 'monospace',
    fontSize: 11,
  },
  hashContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: BorderRadius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.two,
    gap: Spacing.two,
  },
  hashText: {
    color: BrandColors.navy,
    flex: 1,
    fontFamily: 'monospace',
    fontSize: 10,
  },
  copyBtn: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D1D5DB',
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
  },
  copyBtnText: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
  },
  copyBtnTextSuccess: {
    color: BrandColors.green,
  },
  doneButton: {
    alignItems: 'center',
    backgroundColor: BrandColors.navy,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    paddingVertical: Spacing.three,
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
  },
});

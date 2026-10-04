import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { MerchantRedemptionTransaction } from '@/types/merchant-management';

type Props = {
  transaction: MerchantRedemptionTransaction;
};

export const MerchantRedemptionCard = ({ transaction }: Props) => {
  const [copiedHash, setCopiedHash] = useState(false);

  const handleCopyHash = async () => {
    if (!transaction.tx_hash) return;
    await Clipboard.setStringAsync(transaction.tx_hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const shortHash = transaction.tx_hash
    ? `${transaction.tx_hash.substring(0, 6)}...${transaction.tx_hash.substring(
        transaction.tx_hash.length - 6,
      )}`
    : null;

  const isCompleted = transaction.status === 'Completed';
  const isPending = transaction.status === 'Pending';

  return (
    <View style={styles.card}>
      {/* Top Row: Beneficiary Reference & Status */}
      <View style={styles.topRow}>
        <View style={styles.beneficiaryContainer}>
          <View style={styles.beneficiaryInfo}>
            <ThemedText style={styles.beneficiaryName} numberOfLines={1}>
              {transaction.beneficiary_reference ||
                transaction.beneficiary_name ||
                'Citizen Beneficiary'}
            </ThemedText>
            <ThemedText style={styles.programName} numberOfLines={1}>
              {transaction.program_name}
            </ThemedText>
          </View>
        </View>

        <View
          style={[
            styles.statusBadge,
            isCompleted
              ? styles.badgeCompleted
              : isPending
              ? styles.badgePending
              : styles.badgeFailed,
          ]}
        >
          <ThemedText
            style={[
              styles.statusText,
              isCompleted
                ? styles.textCompleted
                : isPending
                ? styles.textPending
                : styles.textFailed,
            ]}
          >
            {transaction.status}
          </ThemedText>
        </View>
      </View>

      {/* Middle Row: Voucher Type & Redeemed Amount */}
      <View style={styles.middleRow}>
        <View style={styles.voucherTypeBadge}>
          <ThemedText style={styles.voucherTypeText}>
            {transaction.category} Voucher
          </ThemedText>
        </View>

        <ThemedText style={styles.amountText}>
          ₱
          {transaction.amount.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </ThemedText>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Bottom Row: Timestamp & Stellar Hash */}
      <View style={styles.bottomRow}>
        <View style={styles.dateContainer}>
          <ThemedText style={styles.dateText}>
            {formatDate(transaction.redeemed_at)}
          </ThemedText>
        </View>

        {shortHash && (
          <Pressable onPress={handleCopyHash} style={styles.hashBtn}>
            <ThemedText style={styles.hashText}>{shortHash}</ThemedText>
            <FontAwesome
              name={copiedHash ? 'check' : 'copy'}
              size={11}
              color={copiedHash ? BrandColors.green : BrandColors.grey}
            />
          </Pressable>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.three,
    marginBottom: Spacing.three,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.two,
  },
  beneficiaryContainer: {
    flex: 1,
    marginRight: Spacing.two,
  },
  beneficiaryInfo: {
    flex: 1,
  },
  beneficiaryName: {
    fontSize: 14,
    fontWeight: '700',
    color: BrandColors.navy,
  },
  programName: {
    fontSize: 11,
    color: BrandColors.grey,
    marginTop: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.md,
  },
  badgeCompleted: {
    backgroundColor: '#E8F5E9',
  },
  badgePending: {
    backgroundColor: '#FFF8E1',
  },
  badgeFailed: {
    backgroundColor: '#FFEBEE',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  textCompleted: {
    color: '#2E7D32',
  },
  textPending: {
    color: '#F57F17',
  },
  textFailed: {
    color: '#C62828',
  },
  middleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  voucherTypeBadge: {
    backgroundColor: '#F4F5F7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  voucherTypeText: {
    fontSize: 12,
    fontWeight: '600',
    color: BrandColors.navy,
  },
  amountText: {
    fontSize: 16,
    fontWeight: '800',
    color: BrandColors.navy,
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: Spacing.two,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateContainer: {
    justifyContent: 'center',
  },
  dateText: {
    fontSize: 11,
    color: BrandColors.grey,
  },
  hashBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: '#ECEFF1',
  },
  hashText: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: BrandColors.grey,
  },
});

import React from 'react';
import { StyleSheet, View, Pressable } from 'react-native';
import { Link } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing, BorderRadius } from '@/constants/theme';
import { Voucher } from '@/types/wallet';
import { VoucherCategoryBadge } from './voucher-category-badge';

type Props = {
  voucher: Voucher;
};

export function VoucherCard({ voucher }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <ThemedText style={styles.program}>{voucher.program}</ThemedText>
        <VoucherCategoryBadge category={voucher.category} />
      </View>
      
      <View style={styles.body}>
        <View style={styles.amountContainer}>
          <ThemedText style={styles.amount}>{voucher.amount}</ThemedText>
          <ThemedText style={styles.purpose}>{voucher.purpose}</ThemedText>
        </View>
        
        <View style={styles.statusContainer}>
          <ThemedText style={styles.expiry}>Exp: {voucher.expiresAt}</ThemedText>
          <View style={[styles.statusPill, voucher.status === 'Available' ? styles.statusAvailable : styles.statusOther]}>
            <ThemedText style={styles.statusText}>{voucher.status}</ThemedText>
          </View>
        </View>
      </View>
      
      {voucher.status === 'Available' && (
        <Link href={"/(beneficiary)/pay-scan" as any} asChild>
          <Pressable style={styles.redeemButton}>
            <ThemedText style={styles.redeemButtonText}>Redeem Now</ThemedText>
          </Pressable>
        </Link>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    marginBottom: Spacing.three,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  program: {
    fontSize: 14,
    fontWeight: '600',
    color: BrandColors.navy,
    flex: 1,
    marginRight: Spacing.two,
  },
  body: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: Spacing.four,
  },
  amountContainer: {
    flex: 1,
  },
  amount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: BrandColors.green,
    marginBottom: 4,
  },
  purpose: {
    fontSize: 12,
    color: BrandColors.grey,
  },
  statusContainer: {
    alignItems: 'flex-end',
  },
  expiry: {
    fontSize: 11,
    color: BrandColors.grey,
    marginBottom: 8,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusAvailable: {
    backgroundColor: '#E8F5E9',
  },
  statusOther: {
    backgroundColor: '#f5f5f5',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    color: BrandColors.navy,
  },
  redeemButton: {
    backgroundColor: BrandColors.navy,
    borderRadius: BorderRadius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  redeemButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

import React from 'react';
import { StyleSheet, View, ScrollView } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing, BorderRadius } from '@/constants/theme';
import { EnrolledProgram } from '@/types/wallet';

type Props = {
  programs: EnrolledProgram[];
};

export function EnrolledProgramCard({ programs }: Props) {
  if (programs.length === 0) return null;

  return (
    <View style={styles.container}>
      <ThemedText style={styles.sectionTitle}>Active Programs</ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {programs.map((prog) => (
          <View key={prog.id} style={styles.card}>
            <View style={styles.header}>
              <ThemedText style={styles.title} numberOfLines={1}>{prog.name}</ThemedText>
              <View style={[styles.statusBadge, prog.approvalStatus === 'Approved' ? styles.statusApproved : styles.statusPending]}>
                <ThemedText style={styles.statusText}>{prog.approvalStatus}</ThemedText>
              </View>
            </View>
            
            <ThemedText style={styles.amountLabel}>Voucher Balance</ThemedText>
            <ThemedText style={styles.amount}>{prog.voucherBalance}</ThemedText>
            
            <View style={styles.footer}>
              <View style={styles.purposeTag}>
                <ThemedText style={styles.purposeText}>{prog.purpose}</ThemedText>
              </View>
              <ThemedText style={styles.expiry}>Exp: {prog.expiresAt}</ThemedText>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.four,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BrandColors.navy,
    marginLeft: Spacing.four,
    marginBottom: Spacing.two,
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.three,
    width: 260,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: BrandColors.navy,
    flex: 1,
    marginRight: Spacing.two,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusApproved: {
    backgroundColor: '#E8F5E9',
  },
  statusPending: {
    backgroundColor: '#FFF8E1',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    color: BrandColors.navy,
  },
  amountLabel: {
    fontSize: 12,
    color: BrandColors.grey,
  },
  amount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: BrandColors.green,
    marginBottom: Spacing.three,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: Spacing.two,
  },
  purposeTag: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  purposeText: {
    fontSize: 11,
    color: BrandColors.navy,
  },
  expiry: {
    fontSize: 11,
    color: BrandColors.grey,
  },
});

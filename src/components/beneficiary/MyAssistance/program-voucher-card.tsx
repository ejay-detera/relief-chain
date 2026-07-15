import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { EnrolledProgram } from '@/types/wallet';

type Props = {
  program: EnrolledProgram;
};

export function ProgramVoucherCard({ program }: Props) {
  const router = useRouter();
  const isApproved = program.approvalStatus === 'Approved';

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={[styles.statusBadge, isApproved ? styles.statusApproved : styles.statusPending]}>
          <ThemedText style={[styles.statusText, isApproved ? styles.statusTextApproved : styles.statusTextPending]}>
            {program.approvalStatus}
          </ThemedText>
        </View>
        <Pressable accessibilityLabel="Program options" style={styles.kebabButton}>
          <FontAwesome name="ellipsis-v" size={16} color={BrandColors.grey} />
        </Pressable>
      </View>

      <ThemedText style={styles.name} numberOfLines={1}>{program.name}</ThemedText>

      <View style={styles.bodyRow}>
        <View style={styles.balanceColumn}>
          <ThemedText style={styles.balanceLabel}>Voucher Balance</ThemedText>
          <ThemedText style={styles.balanceValue}>{program.voucherBalance}</ThemedText>
          <View style={styles.expiryRow}>
            <FontAwesome name="calendar" size={11} color={BrandColors.grey} />
            <ThemedText style={styles.expiryText}>Expires: {program.expiresAt}</ThemedText>
          </View>
        </View>
        <View style={styles.purposeColumn}>
          <ThemedText style={styles.purposeLabel}>Purpose</ThemedText>
          <ThemedText style={styles.purposeValue}>{program.purpose}</ThemedText>
        </View>
      </View>

      <Pressable onPress={() => router.push('/(beneficiary)/pay-scan')} style={styles.redeemButton}>
        <FontAwesome name="qrcode" size={14} color="white" />
        <ThemedText style={styles.redeemButtonText}>Scan to Redeem</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.three,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusApproved: {
    backgroundColor: '#E8F5E9',
  },
  statusPending: {
    backgroundColor: '#FFF8E1',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusTextApproved: {
    color: BrandColors.green,
  },
  statusTextPending: {
    color: '#B8860B',
  },
  kebabButton: {
    padding: Spacing.one,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: BrandColors.navy,
    marginBottom: Spacing.three,
  },
  bodyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.three,
  },
  balanceColumn: {
    flex: 1,
  },
  balanceLabel: {
    fontSize: 11,
    color: BrandColors.grey,
    marginBottom: 2,
  },
  balanceValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: BrandColors.navy,
    marginBottom: Spacing.two,
  },
  expiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 4,
  },
  expiryText: {
    fontSize: 11,
    color: BrandColors.grey,
  },
  purposeColumn: {
    alignItems: 'flex-end',
  },
  purposeLabel: {
    fontSize: 11,
    color: BrandColors.grey,
    marginBottom: 2,
  },
  purposeValue: {
    fontSize: 13,
    fontWeight: '600',
    color: BrandColors.navy,
  },
  redeemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 8,
    backgroundColor: BrandColors.green,
    borderRadius: BorderRadius.md,
    paddingVertical: 12,
  },
  redeemButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

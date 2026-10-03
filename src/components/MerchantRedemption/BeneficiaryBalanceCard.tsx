import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PILOT_ASSET_CODE } from '@/constants/pilot-disclosure';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { BeneficiaryLookupResult, BeneficiaryVoucherBalanceItem } from '@/services/merchant-redemption-service';
import { getVoucherTypeDetails } from '@/utils/voucher-category-matcher';

type Props = {
  beneficiary: BeneficiaryLookupResult;
  selectedVoucher: BeneficiaryVoucherBalanceItem | null;
  onSelectVoucher: (v: BeneficiaryVoucherBalanceItem) => void;
  onRescan: () => void;
};

export function BeneficiaryBalanceCard({
  beneficiary,
  selectedVoucher,
  onSelectVoucher,
  onRescan,
}: Props) {
  const rawWallet = beneficiary.beneficiaryWallet || '';
  const shortWallet =
    rawWallet.length >= 10
      ? `${rawWallet.substring(0, 6)}…${rawWallet.substring(rawWallet.length - 4)}`
      : rawWallet || 'Recipient';

  return (
    <View style={styles.container}>
      {/* Beneficiary Header */}
      <View style={styles.beneficiaryHeader}>
        <View style={styles.avatar}>
          <MaterialCommunityIcons name="account" size={24} color={BrandColors.navy} />
        </View>
        <View style={styles.headerInfo}>
          <ThemedText style={styles.beneficiaryName}>{beneficiary.beneficiaryName}</ThemedText>
          <ThemedText style={styles.walletAddress}>{shortWallet}</ThemedText>
        </View>
        <Pressable onPress={onRescan} style={styles.rescanButton}>
          <MaterialCommunityIcons name="qrcode-scan" size={14} color={BrandColors.navy} />
          <ThemedText style={styles.rescanText}>Rescan</ThemedText>
        </Pressable>
      </View>

      {/* Sync Status Badge */}
      <View style={[styles.syncBadge, beneficiary.isOffline ? styles.syncBadgeOffline : styles.syncBadgeOnline]}>
        <MaterialCommunityIcons
          name={beneficiary.isOffline ? 'cloud-off-outline' : 'shield-check'}
          size={14}
          color={beneficiary.isOffline ? '#D97706' : BrandColors.green}
        />
        <ThemedText style={[styles.syncText, beneficiary.isOffline ? styles.syncTextOffline : styles.syncTextOnline]}>
          {beneficiary.isOffline
            ? `Offline Mode · Cached balance as of ${new Date(beneficiary.syncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : 'Online Verified · Reconciled blockchain truth'}
        </ThemedText>
      </View>

      {/* Program Vouchers Header */}
      <ThemedText style={styles.sectionTitle}>Available Assistance & Vouchers</ThemedText>

      {/* Vouchers List */}
      <View style={styles.voucherList}>
        {beneficiary.balances.length === 0 ? (
          <View style={styles.emptyVouchers}>
            <ThemedText style={styles.emptyText}>
              This beneficiary has no active relief programs or voucher allocations.
            </ThemedText>
          </View>
        ) : (
          beneficiary.balances.map((item) => {
            const isSelected = selectedVoucher?.programId === item.programId;
            const meta = getVoucherTypeDetails(item.category || item.voucherType);

            return (
              <Pressable
                disabled={!item.isAllowedForMerchant}
                key={item.programId}
                onPress={() => onSelectVoucher(item)}
                style={[
                  styles.voucherItem,
                  isSelected && styles.voucherItemSelected,
                  !item.isAllowedForMerchant && styles.voucherItemDisabled,
                ]}
              >
                <View style={styles.voucherTopRow}>
                  <View style={styles.voucherTitleRow}>
                    <View
                      style={[
                        styles.voucherIconBox,
                        isSelected && styles.voucherIconBoxSelected,
                        !item.isAllowedForMerchant && styles.voucherIconBoxDisabled,
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={(meta.icon as never) || 'ticket-percent-outline'}
                        size={18}
                        color={!item.isAllowedForMerchant ? BrandColors.grey : isSelected ? '#FFFFFF' : BrandColors.navy}
                      />
                    </View>
                    <View style={styles.voucherTextCol}>
                      <ThemedText style={styles.programName} numberOfLines={1}>
                        {item.programName}
                      </ThemedText>
                      <ThemedText style={styles.categoryLabel}>{meta.categoryLabel}</ThemedText>
                    </View>
                  </View>

                  {/* Radio Indicator */}
                  <View
                    style={[
                      styles.radio,
                      isSelected && styles.radioSelected,
                      !item.isAllowedForMerchant && styles.radioDisabled,
                    ]}
                  >
                    {isSelected && <View style={styles.radioInner} />}
                  </View>
                </View>

                {/* Balance and Accreditation Match Row */}
                <View style={styles.voucherBottomRow}>
                  <View>
                    <ThemedText style={styles.balanceLabel}>Available</ThemedText>
                    <ThemedText style={styles.balanceValue}>
                      ₱{item.availablePhp}{' '}
                      <ThemedText style={styles.balanceAsset}>{PILOT_ASSET_CODE}</ThemedText>
                    </ThemedText>
                  </View>

                  {item.isAllowedForMerchant ? (
                    <View style={styles.matchBadge}>
                      <MaterialCommunityIcons name="check-circle" size={12} color={BrandColors.green} />
                      <ThemedText style={styles.matchText}>Accredited for redemption</ThemedText>
                    </View>
                  ) : (
                    <View style={styles.mismatchBadge}>
                      <MaterialCommunityIcons name="alert-circle-outline" size={12} color="#DC2626" />
                      <ThemedText style={styles.mismatchText}>Category restricted</ThemedText>
                    </View>
                  )}
                </View>

                {!item.isAllowedForMerchant && item.disallowedReason && (
                  <ThemedText style={styles.disallowedReasonText}>{item.disallowedReason}</ThemedText>
                )}
              </Pressable>
            );
          })
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.xl,
    padding: Spacing.four,
    gap: Spacing.three,
    boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
  },
  beneficiaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EEF2F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    flex: 1,
  },
  beneficiaryName: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
  },
  walletAddress: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
  },
  rescanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    backgroundColor: '#F1F5F9',
    borderRadius: BorderRadius.full,
  },
  rescanText: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
  },
  syncBadgeOnline: {
    backgroundColor: '#ECFDF5',
  },
  syncBadgeOffline: {
    backgroundColor: '#FFFBEB',
  },
  syncText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
  },
  syncTextOnline: {
    color: BrandColors.green,
  },
  syncTextOffline: {
    color: '#B45309',
  },
  sectionTitle: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    marginTop: Spacing.one,
  },
  voucherList: {
    gap: Spacing.two,
  },
  emptyVouchers: {
    padding: Spacing.three,
    alignItems: 'center',
  },
  emptyText: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    textAlign: 'center',
  },
  voucherItem: {
    backgroundColor: '#F8FAFC',
    borderColor: BrandColors.lightGray,
    borderWidth: 1.5,
    borderRadius: BorderRadius.lg,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  voucherItemSelected: {
    borderColor: BrandColors.green,
    backgroundColor: '#F0FDF4',
  },
  voucherItemDisabled: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    opacity: 0.65,
  },
  voucherTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  voucherTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flex: 1,
  },
  voucherIconBox: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voucherIconBoxSelected: {
    backgroundColor: BrandColors.green,
  },
  voucherIconBoxDisabled: {
    backgroundColor: '#EDF2F7',
  },
  voucherTextCol: {
    flex: 1,
  },
  programName: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
  },
  categoryLabel: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: BrandColors.grey,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: BrandColors.green,
  },
  radioDisabled: {
    borderColor: '#CBD5E1',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: BrandColors.green,
  },
  voucherBottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  balanceLabel: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 10,
  },
  balanceValue: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
  },
  balanceAsset: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
  },
  matchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  matchText: {
    color: BrandColors.green,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 10,
  },
  mismatchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  mismatchText: {
    color: '#DC2626',
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 10,
  },
  disallowedReasonText: {
    color: '#DC2626',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 10,
    marginTop: 2,
  },
});

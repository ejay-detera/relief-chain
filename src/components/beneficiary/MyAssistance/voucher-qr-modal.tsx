import { FontAwesome, MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { ThemedText } from '@/components/themed-text';
import { PILOT_ASSET_CODE } from '@/constants/pilot-disclosure';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { parseStroopAmount } from '@/types/blockchain';
import type { BeneficiaryProgramEntitlement } from '@/types/projection';
import type { EnrolledProgram } from '@/types/wallet';
import { formatStroops } from '@/utils/format-stroops';

type Props = {
  visible: boolean;
  onClose: () => void;
  program: EnrolledProgram;
  entitlement: BeneficiaryProgramEntitlement | null;
  beneficiaryWallet?: string;
};

export function VoucherQrModal({
  visible,
  onClose,
  program,
  entitlement,
  beneficiaryWallet,
}: Props) {
  const stroopBalance =
    entitlement?.availableStroops ??
    (program.allocatedAmountStroops ? parseStroopAmount(program.allocatedAmountStroops) : null);

  const balanceText = stroopBalance
    ? `₱${formatStroops(stroopBalance)} ${PILOT_ASSET_CODE}`
    : 'Active Voucher';

  // Construct structured voucher payload for accredited merchant scanning
  const qrPayload = JSON.stringify({
    type: 'reliefchain:voucher',
    version: 1,
    programId: program.id,
    enrollmentId: program.enrollmentId ?? null,
    beneficiaryWallet: beneficiaryWallet ?? '',
    programName: program.name,
    category: program.category ?? 'food',
    voucherType: program.purpose || program.category || 'Aid Voucher',
    allocatedAmountStroops: stroopBalance ? stroopBalance.toString() : null,
  });

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.badgeRow}>
              <View style={styles.categoryBadge}>
                <MaterialCommunityIcons name="ticket-percent-outline" size={14} color="#FFFFFF" />
                <ThemedText style={styles.categoryBadgeText}>
                  {program.category?.toUpperCase() || 'ASSISTANCE VOUCHER'}
                </ThemedText>
              </View>
            </View>
            <Pressable
              accessibilityLabel="Close voucher QR"
              accessibilityRole="button"
              hitSlop={8}
              onPress={onClose}
              style={styles.closeButton}
            >
              <FontAwesome name="close" size={20} color={BrandColors.navy} />
            </Pressable>
          </View>

          {/* Program Info */}
          <ThemedText numberOfLines={2} style={styles.programTitle}>
            {program.name}
          </ThemedText>
          <ThemedText style={styles.balanceValue}>{balanceText}</ThemedText>

          {/* Dedicated QR Code */}
          <View style={styles.qrWrapper}>
            <QRCode
              backgroundColor="#FFFFFF"
              color={BrandColors.navy}
              size={190}
              value={qrPayload}
            />
          </View>

          {/* Accreditation Notice */}
          <View style={styles.noticeContainer}>
            <MaterialCommunityIcons name="shield-check" size={16} color={BrandColors.green} />
            <ThemedText style={styles.noticeText}>
              Redeemable only at certified partner merchants.
            </ThemedText>
          </View>

          {/* Accepted Categories */}
          {program.acceptedMerchantCategories && program.acceptedMerchantCategories.length > 0 && (
            <View style={styles.categoriesRow}>
              <ThemedText style={styles.acceptedLabel}>Accepted at: </ThemedText>
              {program.acceptedMerchantCategories.map((cat, idx) => (
                <View key={idx} style={styles.categoryChip}>
                  <ThemedText style={styles.categoryChipText}>{cat}</ThemedText>
                </View>
              ))}
            </View>
          )}

          {/* Instructions */}
          <ThemedText style={styles.instructions}>
            Present this QR to the merchant cashier. The merchant will scan it with ReliefChain to redeem your voucher.
          </ThemedText>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
  },
  card: {
    width: '100%',
    maxWidth: 350,
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.xl,
    padding: Spacing.five,
    alignItems: 'center',
    boxShadow: '0 8px 30px rgba(0, 0, 0, 0.2)',
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: BrandColors.navy,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  categoryBadgeText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  closeButton: {
    padding: Spacing.one,
  },
  programTitle: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 18,
    textAlign: 'center',
    marginTop: Spacing.one,
  },
  balanceValue: {
    color: BrandColors.green,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 22,
    marginVertical: Spacing.two,
  },
  qrWrapper: {
    padding: Spacing.three,
    backgroundColor: '#F8FAFC',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: BrandColors.lightGray,
    marginVertical: Spacing.two,
  },
  noticeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.two,
  },
  noticeText: {
    color: BrandColors.green,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
  },
  categoriesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: Spacing.two,
  },
  acceptedLabel: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
  },
  categoryChip: {
    backgroundColor: '#EEF2F6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  categoryChipText: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 10,
  },
  instructions: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    textAlign: 'center',
    marginTop: Spacing.three,
    lineHeight: 16,
  },
});

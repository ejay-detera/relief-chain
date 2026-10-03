import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { PILOT_ASSET_CODE, PILOT_NETWORK_LABEL } from '@/constants/pilot-disclosure';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { RedemptionReceiptData } from '@/services/merchant-redemption-service';

type Props = {
  visible: boolean;
  receipt: RedemptionReceiptData | null;
  onClose: () => void;
};

export function RedemptionReceiptModal({ visible, receipt, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  if (!receipt) return null;

  const handleCopyHash = async () => {
    if (!receipt.transactionHash) return;
    await Clipboard.setStringAsync(receipt.transactionHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    try {
      const message = [
        `=== RELIEFCHAIN REDEMPTION RECEIPT ===`,
        `Receipt Ref: ${receipt.receiptNumber}`,
        `Date: ${new Date(receipt.timestamp).toLocaleString()}`,
        `Merchant: ${receipt.merchantName}`,
        `Beneficiary: ${receipt.beneficiaryName}`,
        `Program: ${receipt.programName} (${receipt.voucherType})`,
        `Amount Redeemed: ₱${receipt.amountPhp} ${PILOT_ASSET_CODE}`,
        `Remaining Balance: ₱${receipt.remainingBalancePhp} ${PILOT_ASSET_CODE}`,
        receipt.transactionHash ? `Stellar Tx Hash: ${receipt.transactionHash}` : `Mode: Pending Sync (Offline)`,
        `Network: ${PILOT_NETWORK_LABEL}`,
      ].join('\n');

      await Share.share({ message, title: `Receipt ${receipt.receiptNumber}` });
    } catch {
      Alert.alert('Share', 'Unable to open share sheet.');
    }
  };

  const shortHash = receipt.transactionHash
    ? `${receipt.transactionHash.substring(0, 10)}…${receipt.transactionHash.substring(
        receipt.transactionHash.length - 8
      )}`
    : null;

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.overlay}>
        <SafeAreaView edges={['bottom']} style={styles.modalCard}>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Header Success Icon */}
            <View style={styles.topIconBox}>
              <MaterialCommunityIcons name="check-decagram" size={54} color={BrandColors.green} />
              <ThemedText style={styles.successTitle}>Payment Received!</ThemedText>
              <ThemedText style={styles.successSubtitle}>
                Voucher redemption successfully processed and verified.
              </ThemedText>
            </View>

            {/* Amount Banner */}
            <View style={styles.amountBanner}>
              <ThemedText style={styles.amountLabel}>Total Redeemed</ThemedText>
              <ThemedText style={styles.amountValue}>
                ₱{receipt.amountPhp} <ThemedText style={styles.amountAsset}>{PILOT_ASSET_CODE}</ThemedText>
              </ThemedText>
              <ThemedText style={styles.programLabel}>
                {receipt.programName} · {receipt.voucherType}
              </ThemedText>
            </View>

            {/* Offline Status Notice */}
            {receipt.isOfflineSync && (
              <View style={styles.offlineNotice}>
                <MaterialCommunityIcons name="cloud-sync" size={16} color="#B45309" />
                <ThemedText style={styles.offlineNoticeText}>
                  Recorded offline. Will automatically synchronize to Stellar blockchain once connectivity returns.
                </ThemedText>
              </View>
            )}

            {/* Receipt Details Card */}
            <View style={styles.detailsCard}>
              <View style={styles.detailRow}>
                <ThemedText style={styles.detailKey}>Receipt Number</ThemedText>
                <ThemedText style={styles.detailValBold}>{receipt.receiptNumber}</ThemedText>
              </View>

              <View style={styles.detailRow}>
                <ThemedText style={styles.detailKey}>Date & Time</ThemedText>
                <ThemedText style={styles.detailVal}>
                  {new Date(receipt.timestamp).toLocaleString([], {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </ThemedText>
              </View>

              <View style={styles.detailRow}>
                <ThemedText style={styles.detailKey}>Merchant</ThemedText>
                <ThemedText style={styles.detailVal}>{receipt.merchantName}</ThemedText>
              </View>

              <View style={styles.detailRow}>
                <ThemedText style={styles.detailKey}>Beneficiary</ThemedText>
                <ThemedText style={styles.detailVal}>{receipt.beneficiaryName}</ThemedText>
              </View>

              <View style={styles.detailRow}>
                <ThemedText style={styles.detailKey}>Beneficiary Wallet</ThemedText>
                <ThemedText style={styles.detailValMono}>
                  {receipt.beneficiaryWallet.substring(0, 8)}…
                  {receipt.beneficiaryWallet.substring(receipt.beneficiaryWallet.length - 6)}
                </ThemedText>
              </View>

              <View style={styles.detailRow}>
                <ThemedText style={styles.detailKey}>Remaining Balance</ThemedText>
                <ThemedText style={styles.detailValGreen}>
                  ₱{receipt.remainingBalancePhp} {PILOT_ASSET_CODE}
                </ThemedText>
              </View>

              {/* Transaction Hash */}
              {shortHash && (
                <View style={styles.hashRow}>
                  <View style={styles.hashLeft}>
                    <ThemedText style={styles.detailKey}>Blockchain Evidence</ThemedText>
                    <ThemedText style={styles.detailValMono}>{shortHash}</ThemedText>
                  </View>
                  <Pressable onPress={handleCopyHash} style={styles.copyButton}>
                    <MaterialCommunityIcons
                      name={copied ? 'check' : 'content-copy'}
                      size={14}
                      color={copied ? BrandColors.green : BrandColors.navy}
                    />
                    <ThemedText style={styles.copyText}>{copied ? 'Copied' : 'Copy'}</ThemedText>
                  </Pressable>
                </View>
              )}
            </View>

            {/* Actions */}
            <View style={styles.actionRow}>
              <Pressable onPress={handleShare} style={styles.shareButton}>
                <MaterialCommunityIcons name="share-variant-outline" size={18} color={BrandColors.navy} />
                <ThemedText style={styles.shareButtonText}>Share Receipt</ThemedText>
              </Pressable>

              <Pressable onPress={onClose} style={styles.doneButton}>
                <ThemedText style={styles.doneButtonText}>Done</ThemedText>
              </Pressable>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '90%',
  },
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  topIconBox: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
    gap: Spacing.one,
  },
  successTitle: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 20,
  },
  successSubtitle: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    textAlign: 'center',
  },
  amountBanner: {
    backgroundColor: '#F8FAFC',
    borderRadius: BorderRadius.lg,
    padding: Spacing.three,
    alignItems: 'center',
    gap: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  amountLabel: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
  },
  amountValue: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 26,
  },
  amountAsset: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
  },
  programLabel: {
    color: BrandColors.green,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    marginTop: 2,
  },
  offlineNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: '#FEF3C7',
    padding: Spacing.two,
    borderRadius: BorderRadius.md,
  },
  offlineNoticeText: {
    color: '#92400E',
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    flex: 1,
  },
  detailsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: BrandColors.lightGray,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  detailKey: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
  },
  detailVal: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
  },
  detailValBold: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
  },
  detailValMono: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
  },
  detailValGreen: {
    color: BrandColors.green,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
  },
  hashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  hashLeft: {
    flex: 1,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  copyText: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  shareButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    backgroundColor: '#F1F5F9',
    paddingVertical: Spacing.three,
    borderRadius: BorderRadius.lg,
  },
  shareButtonText: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
  },
  doneButton: {
    flex: 1,
    backgroundColor: BrandColors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.three,
    borderRadius: BorderRadius.lg,
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
  },
});

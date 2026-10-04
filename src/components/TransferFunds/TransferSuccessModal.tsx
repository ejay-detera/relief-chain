import { FontAwesome } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { OrganizationTransferResult } from '@/types/organization-transfer';

interface TransferSuccessModalProps {
  visible: boolean;
  onClose: () => void;
  result: OrganizationTransferResult | null;
}

export function TransferSuccessModal({ visible, onClose, result }: TransferSuccessModalProps) {
  const [copied, setCopied] = useState(false);

  if (!result) return null;

  const handleCopyHash = async () => {
    if (result.transactionHash) {
      await Clipboard.setStringAsync(result.transactionHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const truncatedHash = result.transactionHash
    ? `${result.transactionHash.slice(0, 10)}...${result.transactionHash.slice(-10)}`
    : 'N/A';

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.iconCircle}>
            <FontAwesome color="#FFFFFF" name="check" size={28} />
          </View>

          <ThemedText style={styles.title}>Transfer Settled Successfully!</ThemedText>
          <ThemedText style={styles.subtitle}>
            Your funds have been transferred on the Stellar blockchain network.
          </ThemedText>

          <View style={styles.amountCard}>
            <ThemedText style={styles.amountText}>₱{result.amountRcphp} RCPHP</ThemedText>
            <ThemedText style={styles.toText}>
              Sent to: {result.destinationWallet.slice(0, 6)}...{result.destinationWallet.slice(-6)}
            </ThemedText>
          </View>

          <View style={styles.detailsBox}>
            <View style={styles.row}>
              <ThemedText style={styles.detailLabel}>Network</ThemedText>
              <ThemedText style={styles.detailValue}>Stellar Testnet</ThemedText>
            </View>

            {result.ledgerSequence ? (
              <View style={styles.row}>
                <ThemedText style={styles.detailLabel}>Ledger Sequence</ThemedText>
                <ThemedText style={styles.detailValue}>#{result.ledgerSequence}</ThemedText>
              </View>
            ) : null}

            <View style={styles.row}>
              <ThemedText style={styles.detailLabel}>Transaction Hash</ThemedText>
              <Pressable onPress={handleCopyHash} style={styles.copyRow}>
                <ThemedText style={styles.hashText}>{truncatedHash}</ThemedText>
                <FontAwesome
                  color={copied ? BrandColors.green : BrandColors.navy}
                  name={copied ? 'check' : 'copy'}
                  size={12}
                />
              </Pressable>
            </View>
          </View>

          <Pressable accessibilityRole="button" onPress={onClose} style={styles.doneBtn}>
            <ThemedText style={styles.doneText}>Done</ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.xl,
    padding: Spacing.four,
    alignItems: 'center',
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: BrandColors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.three,
  },
  title: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 18,
    color: BrandColors.navy,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    color: BrandColors.grey,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: Spacing.three,
  },
  amountCard: {
    backgroundColor: '#E8F5E9',
    width: '100%',
    padding: Spacing.three,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  amountText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 24,
    color: '#1B5E20',
  },
  toText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: '#2E7D32',
    marginTop: 2,
  },
  detailsBox: {
    width: '100%',
    backgroundColor: BrandColors.lightGray,
    borderRadius: BorderRadius.md,
    padding: Spacing.three,
    marginBottom: Spacing.four,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  detailLabel: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    color: BrandColors.grey,
  },
  detailValue: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: BrandColors.navy,
  },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hashText: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: BrandColors.navy,
  },
  doneBtn: {
    width: '100%',
    backgroundColor: BrandColors.navy,
    paddingVertical: Spacing.three,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  doneText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: '#FFFFFF',
  },
});

import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  Share,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { exportTransactionsToCsv } from '@/hooks/use-merchant-transactions';
import type { MerchantTransaction } from '@/types/merchant-transaction';

type Props = {
  onClose: () => void;
  transactions: readonly MerchantTransaction[];
  visible: boolean;
};

export const TransactionExportModal = ({ visible, onClose, transactions }: Props) => {
  const [copied, setCopied] = useState(false);

  const totalPhp = transactions.reduce((sum, tx) => sum + tx.amount, 0);
  const csvContent = exportTransactionsToCsv(transactions);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(csvContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: csvContent,
        title: 'reliefchain-merchant-redemptions.csv',
      });
    } catch {
      // User cancelled or share dismissed
    }
  };

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <MaterialCommunityIcons color={BrandColors.navy} name="file-delimited-outline" size={24} />
              <ThemedText style={styles.title}>Export Reconciliation</ThemedText>
            </View>
            <Pressable accessibilityLabel="Close modal" accessibilityRole="button" hitSlop={8} onPress={onClose}>
              <MaterialCommunityIcons color={BrandColors.grey} name="close" size={20} />
            </Pressable>
          </View>

          {/* Stats Bar */}
          <View style={styles.statsBar}>
            <View style={styles.statCol}>
              <ThemedText style={styles.statLabel}>Records</ThemedText>
              <ThemedText style={styles.statValue}>{transactions.length}</ThemedText>
            </View>
            <View style={styles.divider} />
            <View style={styles.statCol}>
              <ThemedText style={styles.statLabel}>Total Settled</ThemedText>
              <ThemedText style={styles.statValue}>
                ₱{totalPhp.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </ThemedText>
            </View>
          </View>

          <ThemedText style={styles.description}>
            Export your filtered transaction and redemption history formatted as standard CSV for reconciliation with your accounting records.
          </ThemedText>

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={transactions.length === 0}
              onPress={() => void handleShare()}
              style={[styles.primaryButton, transactions.length === 0 && styles.buttonDisabled]}
            >
              <MaterialCommunityIcons color="#FFFFFF" name="share-variant-outline" size={18} />
              <ThemedText style={styles.primaryButtonText}>Share / Save CSV</ThemedText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              disabled={transactions.length === 0}
              onPress={() => void handleCopy()}
              style={[styles.secondaryButton, transactions.length === 0 && styles.buttonDisabled]}
            >
              <MaterialCommunityIcons color={BrandColors.navy} name={copied ? 'check' : 'content-copy'} size={18} />
              <ThemedText style={styles.secondaryButtonText}>
                {copied ? 'Copied to Clipboard!' : 'Copy CSV Text'}
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(17, 46, 88, 0.45)',
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.xl,
    gap: Spacing.three,
    maxWidth: 400,
    padding: Spacing.four,
    width: '100%',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  headerLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
  },
  title: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
  },
  statsBar: {
    backgroundColor: '#F3F4F6',
    borderRadius: BorderRadius.lg,
    flexDirection: 'row',
    padding: Spacing.three,
  },
  statCol: {
    flex: 1,
  },
  statLabel: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    marginBottom: 2,
  },
  statValue: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
  },
  divider: {
    backgroundColor: '#E2E8F0',
    height: '100%',
    marginHorizontal: Spacing.two,
    width: 1,
  },
  description: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  actions: {
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: BrandColors.navy,
    borderRadius: BorderRadius.md,
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: Spacing.four,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderColor: 'rgba(151,151,151,0.25)',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: Spacing.four,
  },
  secondaryButtonText: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});

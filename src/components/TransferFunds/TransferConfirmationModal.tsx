import { FontAwesome } from '@expo/vector-icons';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';

interface TransferConfirmationModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
  destinationWallet: string;
  matchedOrgName?: string | null;
  amountRcphp: string;
  remainingRcphpFormatted: string;
  memo?: string;
}

export function TransferConfirmationModal({
  visible,
  onClose,
  onConfirm,
  isSubmitting,
  destinationWallet,
  matchedOrgName,
  amountRcphp,
  remainingRcphpFormatted,
  memo,
}: TransferConfirmationModalProps) {
  const truncatedWallet = `${destinationWallet.slice(0, 8)}...${destinationWallet.slice(-8)}`;

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <FontAwesome color={BrandColors.navy} name="exchange" size={18} />
            </View>
            <ThemedText style={styles.title}>Confirm Fund Transfer</ThemedText>
            <ThemedText style={styles.subtitle}>
              Please review transaction details before submitting to Stellar network.
            </ThemedText>
          </View>

          <View style={styles.summaryCard}>
            <View style={styles.amountBox}>
              <ThemedText style={styles.amountLabel}>Transfer Amount</ThemedText>
              <ThemedText style={styles.amountValue}>₱{amountRcphp} RCPHP</ThemedText>
            </View>

            <View style={styles.divider} />

            <View style={styles.detailRow}>
              <ThemedText style={styles.detailLabel}>Recipient Address</ThemedText>
              <ThemedText style={styles.detailValueMono}>{truncatedWallet}</ThemedText>
            </View>

            {matchedOrgName ? (
              <View style={styles.detailRow}>
                <ThemedText style={styles.detailLabel}>Destination Org</ThemedText>
                <ThemedText style={styles.detailValueBold}>{matchedOrgName}</ThemedText>
              </View>
            ) : null}

            {memo ? (
              <View style={styles.detailRow}>
                <ThemedText style={styles.detailLabel}>Memo</ThemedText>
                <ThemedText style={styles.detailValue}>{memo}</ThemedText>
              </View>
            ) : null}

            <View style={styles.detailRow}>
              <ThemedText style={styles.detailLabel}>Network Fee</ThemedText>
              <ThemedText style={styles.detailValueFee}>Sponsored (Free)</ThemedText>
            </View>

            <View style={styles.detailRow}>
              <ThemedText style={styles.detailLabel}>Post-transfer Balance</ThemedText>
              <ThemedText style={styles.detailValue}>{remainingRcphpFormatted}</ThemedText>
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={onClose}
              style={[styles.cancelBtn, isSubmitting && styles.btnDisabled]}
            >
              <ThemedText style={styles.cancelText}>Cancel</ThemedText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={onConfirm}
              style={[styles.confirmBtn, isSubmitting && styles.btnDisabled]}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <FontAwesome color="#FFFFFF" name="check" size={14} />
                  <ThemedText style={styles.confirmText}>Confirm & Transfer</ThemedText>
                </>
              )}
            </Pressable>
          </View>
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
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  title: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 18,
    color: BrandColors.navy,
  },
  subtitle: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    color: BrandColors.grey,
    textAlign: 'center',
    marginTop: 4,
  },
  summaryCard: {
    backgroundColor: BrandColors.lightGray,
    borderRadius: BorderRadius.lg,
    padding: Spacing.three,
    marginBottom: Spacing.four,
  },
  amountBox: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  amountLabel: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: BrandColors.grey,
  },
  amountValue: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 22,
    color: BrandColors.navy,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginVertical: Spacing.two,
  },
  detailRow: {
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
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: BrandColors.navy,
  },
  detailValueMono: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: BrandColors.navy,
  },
  detailValueBold: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: BrandColors.navy,
  },
  detailValueFee: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: '#2E7D32',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: Spacing.three,
    borderRadius: BorderRadius.md,
    backgroundColor: '#F0F2F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    color: BrandColors.navy,
  },
  confirmBtn: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: Spacing.three,
    borderRadius: BorderRadius.md,
    backgroundColor: BrandColors.green,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  confirmText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  btnDisabled: {
    opacity: 0.6,
  },
});

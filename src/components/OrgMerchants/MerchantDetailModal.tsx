import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { FontAwesome } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { ConfirmationModal } from './ConfirmationModal';
import { BrandColors, BorderRadius, Spacing } from '@/constants/theme';
import { approveMerchant, rejectMerchant, type PendingMerchant } from '@/services/merchantManagementService';

type Props = {
  merchant: PendingMerchant | null;
  visible: boolean;
  organizationId: string;
  onClose: () => void;
  onDecisionComplete: () => void;
};

export const MerchantDetailModal = ({ merchant, visible, organizationId, onClose, onDecisionComplete }: Props) => {
  const [confirmVariant, setConfirmVariant] = useState<'approve' | 'reject' | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!merchant) return null;

  const handleApprove = async () => {
    setIsSubmitting(true);
    try {
      await approveMerchant(merchant.accreditationId);
      setConfirmVariant(null);
      onDecisionComplete();
      onClose();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not approve merchant.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) return;
    setIsSubmitting(true);
    try {
      await rejectMerchant(merchant.accreditationId, organizationId, rejectionReason.trim());
      setConfirmVariant(null);
      setRejectionReason('');
      onDecisionComplete();
      onClose();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not reject merchant.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <ThemedText style={styles.title}>{merchant.displayName}</ThemedText>
            <Pressable onPress={onClose} accessibilityRole="button">
              <FontAwesome name="times" size={20} color={BrandColors.navy} />
            </Pressable>
          </View>
          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            <InfoRow label="Category" value={merchant.category} />
            <InfoRow label="Submitted" value={new Date(merchant.submittedAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })} />
            {merchant.stellarPubkey && (
              <View style={styles.walletRow}>
                <ThemedText style={styles.infoLabel}>Stellar Wallet</ThemedText>
                <View style={styles.walletValue}>
                  <ThemedText style={styles.infoValue} selectable numberOfLines={1}>{merchant.stellarPubkey}</ThemedText>
                  <Pressable onPress={async () => { await Clipboard.setStringAsync(merchant.stellarPubkey!); Alert.alert('Copied', 'Wallet address copied.'); }} accessibilityRole="button">
                    <FontAwesome name="copy" size={14} color={BrandColors.green} />
                  </Pressable>
                </View>
              </View>
            )}
            {confirmVariant === 'reject' && (
              <View style={styles.remarksSection}>
                <ThemedText style={styles.infoLabel}>Rejection Reason (required)</ThemedText>
                <TextInput
                  style={styles.remarksInput}
                  value={rejectionReason}
                  onChangeText={setRejectionReason}
                  placeholder="Explain why this application is rejected..."
                  placeholderTextColor={BrandColors.grey}
                  multiline
                  numberOfLines={4}
                />
              </View>
            )}
          </ScrollView>
          <View style={styles.actions}>
            <Pressable style={styles.rejectBtn} onPress={() => setConfirmVariant('reject')} accessibilityRole="button">
              <ThemedText style={styles.rejectText}>Reject</ThemedText>
            </Pressable>
            <Pressable style={styles.approveBtn} onPress={() => setConfirmVariant('approve')} accessibilityRole="button">
              <ThemedText style={styles.approveText}>Approve</ThemedText>
            </Pressable>
          </View>
          {confirmVariant === 'reject' && (
            <Pressable
              style={[styles.submitRejectBtn, (!rejectionReason.trim() || isSubmitting) && styles.disabledBtn]}
              onPress={handleReject}
              disabled={!rejectionReason.trim() || isSubmitting}
              accessibilityRole="button"
            >
              <ThemedText style={styles.approveText}>Submit Rejection</ThemedText>
            </Pressable>
          )}
          <ConfirmationModal
            visible={confirmVariant === 'approve'}
            title="Approve Merchant?"
            body={`Approving "${merchant.displayName}" will grant them access to accept voucher payments.`}
            variant="approve"
            onConfirm={handleApprove}
            onCancel={() => setConfirmVariant(null)}
          />
        </View>
      </View>
    </Modal>
  );
};

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.infoRow}>
    <ThemedText style={styles.infoLabel}>{label}</ThemedText>
    <ThemedText style={styles.infoValue}>{value}</ThemedText>
  </View>
);

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, maxHeight: '85%', paddingBottom: Spacing.five },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.four, borderBottomWidth: 1, borderBottomColor: BrandColors.lightGray },
  title: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, color: BrandColors.navy, flex: 1 },
  body: { paddingHorizontal: Spacing.four },
  infoRow: { paddingVertical: Spacing.two, borderBottomWidth: 1, borderBottomColor: BrandColors.lightGray },
  walletRow: { paddingVertical: Spacing.two, borderBottomWidth: 1, borderBottomColor: BrandColors.lightGray, gap: 4 },
  walletValue: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  infoLabel: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 11, color: BrandColors.grey, marginBottom: 2 },
  infoValue: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, color: BrandColors.navy, flex: 1 },
  remarksSection: { paddingTop: Spacing.three, gap: Spacing.two },
  remarksInput: { borderWidth: 1, borderColor: BrandColors.grey, borderRadius: BorderRadius.md, padding: Spacing.two, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, color: BrandColors.navy, textAlignVertical: 'top', minHeight: 80 },
  actions: { flexDirection: 'row', gap: Spacing.two, padding: Spacing.four },
  rejectBtn: { flex: 1, borderWidth: 1, borderColor: '#E74C3C', borderRadius: BorderRadius.md, paddingVertical: Spacing.three, alignItems: 'center' },
  rejectText: { color: '#E74C3C', fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14 },
  approveBtn: { flex: 1, backgroundColor: BrandColors.green, borderRadius: BorderRadius.md, paddingVertical: Spacing.three, alignItems: 'center' },
  approveText: { color: '#FFF', fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14 },
  submitRejectBtn: { marginHorizontal: Spacing.four, backgroundColor: '#E74C3C', borderRadius: BorderRadius.md, paddingVertical: Spacing.three, alignItems: 'center' },
  disabledBtn: { opacity: 0.4 },
});

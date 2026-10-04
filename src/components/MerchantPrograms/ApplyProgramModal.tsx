import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { AvailableAidProgram } from '@/types/merchant-program';

type Props = {
  visible: boolean;
  program: AvailableAidProgram | null;
  onClose: () => void;
  onSubmit: (programId: string, notes: string) => Promise<void>;
};

export const ApplyProgramModal = ({ visible, program, onClose, onSubmit }: Props) => {
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!program) return null;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await onSubmit(program.id, notes.trim());
      setNotes('');
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to submit application. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDraft = program.status.toLowerCase() === 'draft';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleContainer}>
              <ThemedText style={styles.title}>Apply for Aid Program</ThemedText>
              <ThemedText style={styles.subtitle}>
                Submit an application to accept relief vouchers for this program.
              </ThemedText>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityRole="button">
              <MaterialCommunityIcons name="close" size={22} color={BrandColors.grey} />
            </TouchableOpacity>
          </View>

          {/* Program Overview Box */}
          <View style={styles.programBox}>
            <View style={styles.badgeRow}>
              <View style={[styles.statusTag, isDraft ? styles.draftTag : styles.activeTag]}>
                <Text style={isDraft ? styles.draftText : styles.activeText}>
                  {isDraft ? 'Draft Stage' : 'Active Stage'}
                </Text>
              </View>
              <ThemedText style={styles.orgText}>{program.organizationName}</ThemedText>
            </View>
            <ThemedText style={styles.progName}>{program.name}</ThemedText>
            <ThemedText style={styles.progPurpose} numberOfLines={2}>
              {program.purpose}
            </ThemedText>

            <View style={styles.metaRow}>
              <View style={styles.metaCol}>
                <ThemedText style={styles.metaLabel}>Voucher Value</ThemedText>
                <ThemedText style={styles.metaVal}>
                  ₱{program.voucherValue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </ThemedText>
              </View>
              <View style={styles.metaCol}>
                <ThemedText style={styles.metaLabel}>Allowed Goods</ThemedText>
                <ThemedText style={styles.metaVal} numberOfLines={1}>
                  {program.voucherTypes.join(', ') || 'All categories'}
                </ThemedText>
              </View>
            </View>
          </View>

          {/* Voluntary Consent Notice */}
          <View style={styles.noticeBox}>
            <MaterialCommunityIcons name="shield-check-outline" size={18} color={BrandColors.navy} />
            <Text style={styles.noticeText}>
              By applying, you confirm your store&apos;s willingness to redeem digital vouchers according to
              the program terms. The organization administrator will review your application before accrediting your store.
            </Text>
          </View>

          {/* Notes Input */}
          <View style={styles.inputGroup}>
            <ThemedText style={styles.inputLabel}>
              Application Notes & Availability (Optional)
            </ThemedText>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Operating hours, branch inventory, delivery capabilities..."
              placeholderTextColor={BrandColors.grey}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              maxLength={500}
            />
          </View>

          {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              disabled={isSubmitting}
              accessibilityRole="button"
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={isSubmitting}
              accessibilityRole="button"
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <MaterialCommunityIcons name="send" size={16} color="#FFFFFF" />
                  <Text style={styles.submitBtnText}>Submit Application</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.xl,
    padding: Spacing.four,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.three,
  },
  headerTitleContainer: {
    flex: 1,
  },
  title: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
  },
  subtitle: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 11,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  programBox: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.three,
  },
  badgeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  statusTag: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
  draftTag: {
    backgroundColor: '#FEF3C7',
  },
  draftText: {
    color: '#92400E',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 9,
  },
  activeTag: {
    backgroundColor: '#DCFCE7',
  },
  activeText: {
    color: '#15803D',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 9,
  },
  orgText: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 10,
  },
  progName: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
  },
  progPurpose: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 11,
    marginTop: 2,
  },
  metaRow: {
    borderTopColor: '#E2E8F0',
    borderTopWidth: 1,
    flexDirection: 'row',
    marginTop: Spacing.two,
    paddingTop: Spacing.two,
    gap: Spacing.two,
  },
  metaCol: {
    flex: 1,
  },
  metaLabel: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 9,
  },
  metaVal: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    marginTop: 1,
  },
  noticeBox: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.three,
    padding: Spacing.two,
  },
  noticeText: {
    color: BrandColors.navy,
    flex: 1,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 10,
    lineHeight: 14,
  },
  inputGroup: {
    marginTop: Spacing.three,
  },
  inputLabel: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    marginBottom: 4,
  },
  textInput: {
    borderColor: '#D1D5DB',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    minHeight: 64,
    padding: Spacing.two,
    textAlignVertical: 'top',
  },
  errorText: {
    color: '#DC2626',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    marginTop: Spacing.two,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: Spacing.four,
    gap: Spacing.two,
  },
  cancelBtn: {
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
  },
  cancelBtnText: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
  },
  submitBtn: {
    alignItems: 'center',
    backgroundColor: BrandColors.green,
    borderRadius: BorderRadius.md,
    flexDirection: 'row',
    paddingHorizontal: Spacing.four,
    paddingVertical: 10,
    gap: Spacing.two,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
  },
});

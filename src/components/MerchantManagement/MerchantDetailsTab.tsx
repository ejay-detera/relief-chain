import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import {
  ACCREDITATION_CATEGORIES,
  type AccreditedMerchant,
  type MerchantAccreditationStatus,
} from '@/types/merchant-management';

type Props = {
  merchant: AccreditedMerchant;
  onUpdateStatus: (
    accreditationId: string,
    status: MerchantAccreditationStatus,
    remarks?: string,
    category?: string,
  ) => Promise<void>;
  onRemove: (accreditationId: string) => Promise<void>;
  onClose: () => void;
};

export const MerchantDetailsTab = ({
  merchant,
  onUpdateStatus,
  onRemove,
  onClose,
}: Props) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionType, setActionType] = useState<
    'none' | 'suspend' | 'reject' | 'editCategory'
  >('none');
  const [remarksInput, setRemarksInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(
    merchant.category || 'Grocery',
  );
  const [copiedKey, setCopiedKey] = useState(false);

  // Sync state if merchant changes
  React.useEffect(() => {
    let isMounted = true;
    Promise.resolve().then(() => {
      if (isMounted) {
        setSelectedCategory(merchant.category);
        setRemarksInput('');
        setActionType('none');
        setCopiedKey(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [merchant]);

  const handleCopyPubkey = async () => {
    if (!merchant.stellar_pubkey) return;
    await Clipboard.setStringAsync(merchant.stellar_pubkey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleConfirmSuspendOrReject = async (
    targetStatus: 'suspended' | 'rejected',
  ) => {
    const trimmedReason = remarksInput.trim();
    if (!trimmedReason) {
      Alert.alert(
        'Reason Required',
        `Please specify a reason for ${
          targetStatus === 'suspended' ? 'suspending' : 'rejecting'
        } this merchant account.`,
      );
      return;
    }

    try {
      setIsSubmitting(true);
      await onUpdateStatus(
        merchant.accreditation_id,
        targetStatus,
        trimmedReason,
      );
      setActionType('none');
      setRemarksInput('');
    } catch {
      // Handled in parent
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReactivate = async () => {
    Alert.alert(
      'Reactivate Merchant',
      `Are you sure you want to reactivate ${merchant.display_name} for aid programs?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reactivate',
          onPress: async () => {
            try {
              setIsSubmitting(true);
              await onUpdateStatus(
                merchant.accreditation_id,
                'active',
                'Reactivated by organization admin',
              );
            } catch {
              // Handled in parent
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ],
    );
  };

  const handleSaveCategory = async () => {
    try {
      setIsSubmitting(true);
      await onUpdateStatus(
        merchant.accreditation_id,
        merchant.status,
        merchant.remarks || undefined,
        selectedCategory,
      );
      setActionType('none');
    } catch {
      // Handled in parent
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmRemove = () => {
    Alert.alert(
      'Remove Merchant',
      `Are you sure you want to remove ${merchant.display_name}? This merchant will no longer appear when creating or modifying aid programs for your organization.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsSubmitting(true);
              await onRemove(merchant.accreditation_id);
              onClose();
            } catch {
              // Handled in parent
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ],
    );
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* Information Section */}
      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>
          Business & Account Details
        </ThemedText>
        <View style={styles.infoRow}>
          <ThemedText style={styles.infoLabel}>Owner Name</ThemedText>
          <ThemedText style={styles.infoValue}>
            {merchant.owner_name || 'Not provided'}
          </ThemedText>
        </View>
        <View style={styles.infoRow}>
          <ThemedText style={styles.infoLabel}>Mobile Number</ThemedText>
          <ThemedText style={styles.infoValue}>
            {merchant.mobile_number || 'Not provided'}
          </ThemedText>
        </View>
        <View style={styles.infoRow}>
          <ThemedText style={styles.infoLabel}>Category</ThemedText>
          <View style={styles.categoryRow}>
            <ThemedText style={styles.infoValue}>{merchant.category}</ThemedText>
            <Pressable
              onPress={() =>
                setActionType(
                  actionType === 'editCategory' ? 'none' : 'editCategory',
                )
              }
              style={styles.editLink}
            >
              <ThemedText style={styles.editLinkText}>Change</ThemedText>
            </Pressable>
          </View>
        </View>

        {/* Inline Edit Category */}
        {actionType === 'editCategory' && (
          <View style={styles.editCategoryContainer}>
            <ThemedText style={styles.inlineLabel}>
              Select New Category:
            </ThemedText>
            <View style={styles.categoryChips}>
              {ACCREDITATION_CATEGORIES.map((cat) => (
                <Pressable
                  key={cat}
                  onPress={() => setSelectedCategory(cat)}
                  style={[
                    styles.categoryChip,
                    selectedCategory === cat && styles.categoryChipActive,
                  ]}
                >
                  <ThemedText
                    style={[
                      styles.categoryChipText,
                      selectedCategory === cat && styles.categoryChipTextActive,
                    ]}
                  >
                    {cat}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
            <View style={styles.inlineActionRow}>
              <Pressable
                onPress={() => setActionType('none')}
                style={styles.inlineCancelBtn}
              >
                <ThemedText style={styles.inlineCancelText}>Cancel</ThemedText>
              </Pressable>
              <Pressable
                onPress={handleSaveCategory}
                disabled={isSubmitting}
                style={styles.inlineSaveBtn}
              >
                <ThemedText style={styles.inlineSaveText}>Save Category</ThemedText>
              </Pressable>
            </View>
          </View>
        )}

        <View style={styles.infoRow}>
          <ThemedText style={styles.infoLabel}>Accredited On</ThemedText>
          <ThemedText style={styles.infoValue}>
            {formatDate(merchant.valid_from)}
          </ThemedText>
        </View>
        <View style={styles.infoRow}>
          <ThemedText style={styles.infoLabel}>Valid Until</ThemedText>
          <ThemedText style={styles.infoValue}>
            {formatDate(merchant.valid_until)}
          </ThemedText>
        </View>

        {/* Stellar Public Key */}
        <View style={styles.keyRow}>
          <ThemedText style={styles.infoLabel}>Stellar Public Key</ThemedText>
          <Pressable onPress={handleCopyPubkey} style={styles.keyBox}>
            <ThemedText numberOfLines={1} style={styles.keyText}>
              {merchant.stellar_pubkey || 'No key generated'}
            </ThemedText>
            <FontAwesome
              name={copiedKey ? 'check' : 'copy'}
              size={13}
              color={copiedKey ? BrandColors.green : BrandColors.grey}
            />
          </Pressable>
        </View>

        {merchant.remarks && (
          <View style={styles.remarksBox}>
            <ThemedText style={styles.remarksTitle}>
              Current Remarks / Suspension Reason:
            </ThemedText>
            <ThemedText style={styles.remarksBody}>
              {merchant.remarks}
            </ThemedText>
          </View>
        )}
      </View>

      {/* Inline Reason Form for Suspend / Reject */}
      {(actionType === 'suspend' || actionType === 'reject') && (
        <View style={styles.reasonSection}>
          <ThemedText style={styles.reasonTitle}>
            {actionType === 'suspend'
              ? 'Reason for Suspension (Required)'
              : 'Reason for Rejection (Required)'}
          </ThemedText>
          <TextInput
            value={remarksInput}
            onChangeText={setRemarksInput}
            placeholder="e.g. License expired, store relocation, suspicious activity..."
            placeholderTextColor={BrandColors.grey}
            multiline={true}
            numberOfLines={3}
            style={styles.reasonInput}
          />
          <View style={styles.inlineActionRow}>
            <Pressable
              onPress={() => setActionType('none')}
              style={styles.inlineCancelBtn}
            >
              <ThemedText style={styles.inlineCancelText}>Cancel</ThemedText>
            </Pressable>
            <Pressable
              onPress={() =>
                handleConfirmSuspendOrReject(
                  actionType === 'suspend' ? 'suspended' : 'rejected',
                )
              }
              disabled={isSubmitting}
              style={styles.inlineConfirmBtn}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <ThemedText style={styles.inlineConfirmText}>
                  Confirm {actionType === 'suspend' ? 'Suspend' : 'Reject'}
                </ThemedText>
              )}
            </Pressable>
          </View>
        </View>
      )}

      {/* Main Action Buttons */}
      {actionType === 'none' && (
        <View style={styles.actionsContainer}>
          {merchant.status === 'active' ? (
            <View style={styles.primaryActionRow}>
              <Pressable
                onPress={() => setActionType('suspend')}
                style={styles.suspendBtn}
              >
                <FontAwesome name="ban" size={14} color="#E65100" />
                <ThemedText style={styles.suspendBtnText}>
                  Suspend Account
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => setActionType('reject')}
                style={styles.rejectBtn}
              >
                <FontAwesome name="times-circle" size={14} color="#D32F2F" />
                <ThemedText style={styles.rejectBtnText}>Reject</ThemedText>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={handleReactivate} style={styles.reactivateBtn}>
              <FontAwesome name="check-circle" size={15} color="white" />
              <ThemedText style={styles.reactivateBtnText}>
                Reactivate / Approve Merchant
              </ThemedText>
            </Pressable>
          )}

          <Pressable onPress={handleConfirmRemove} style={styles.removeBtn}>
            <FontAwesome name="trash" size={14} color="#D32F2F" />
            <ThemedText style={styles.removeBtnText}>
              Remove from Organization
            </ThemedText>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingBottom: Spacing.four,
  },
  section: {
    backgroundColor: '#F8F9FA',
    borderRadius: BorderRadius.lg,
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: BrandColors.navy,
    marginBottom: Spacing.two,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  infoLabel: {
    fontSize: 12,
    color: BrandColors.grey,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: BrandColors.navy,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editLink: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#EAEFF8',
    borderRadius: BorderRadius.sm,
  },
  editLinkText: {
    fontSize: 11,
    fontWeight: '700',
    color: BrandColors.navy,
  },
  editCategoryContainer: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.md,
    padding: Spacing.two,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  inlineLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: BrandColors.grey,
    marginBottom: 6,
  },
  categoryChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: Spacing.two,
  },
  categoryChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    backgroundColor: '#F0F0F0',
  },
  categoryChipActive: {
    backgroundColor: BrandColors.navy,
  },
  categoryChipText: {
    fontSize: 11,
    color: BrandColors.grey,
  },
  categoryChipTextActive: {
    color: 'white',
    fontWeight: '700',
  },
  keyRow: {
    paddingVertical: 7,
  },
  keyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'white',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.two,
    paddingVertical: 8,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  keyText: {
    flex: 1,
    fontSize: 11,
    fontFamily: 'monospace',
    color: BrandColors.navy,
    marginRight: 8,
  },
  remarksBox: {
    backgroundColor: '#FFF8E1',
    borderRadius: BorderRadius.md,
    padding: Spacing.two,
    marginTop: Spacing.two,
    borderLeftWidth: 3,
    borderLeftColor: '#FFA000',
  },
  remarksTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E65100',
    marginBottom: 2,
  },
  remarksBody: {
    fontSize: 12,
    color: '#5D4037',
  },
  reasonSection: {
    backgroundColor: '#FFF3E0',
    borderRadius: BorderRadius.lg,
    padding: Spacing.three,
    marginBottom: Spacing.three,
    borderWidth: 1,
    borderColor: '#FFE0B2',
  },
  reasonTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E65100',
    marginBottom: Spacing.two,
  },
  reasonInput: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#FFCC80',
    padding: Spacing.two,
    fontSize: 13,
    color: BrandColors.navy,
    textAlignVertical: 'top',
    minHeight: 65,
    marginBottom: Spacing.two,
  },
  inlineActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
  inlineCancelBtn: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
    backgroundColor: '#EEEEEE',
  },
  inlineCancelText: {
    fontSize: 12,
    fontWeight: '600',
    color: BrandColors.grey,
  },
  inlineConfirmBtn: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
    backgroundColor: '#D32F2F',
    minWidth: 120,
    alignItems: 'center',
  },
  inlineConfirmText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'white',
  },
  inlineSaveBtn: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
    backgroundColor: BrandColors.navy,
  },
  inlineSaveText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'white',
  },
  actionsContainer: {
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  primaryActionRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  suspendBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: '#FFE0B2',
    backgroundColor: '#FFF3E0',
  },
  suspendBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E65100',
  },
  rejectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: '#FFCDD2',
    backgroundColor: '#FFEBEE',
  },
  rejectBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#D32F2F',
  },
  reactivateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    backgroundColor: BrandColors.green,
  },
  reactivateBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: 'white',
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#FFCDD2',
    backgroundColor: 'white',
  },
  removeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#D32F2F',
  },
});

import { FontAwesome, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import {
  fetchProgramMerchantApplications,
  reviewMerchantApplication,
} from '@/services/organizationMerchantService';
import type { MerchantProgramApplicant } from '@/types/merchant-management';

type Props = {
  programId: string;
  onUpdated?: () => void;
};

const statusStyleFor = (status: MerchantProgramApplicant['status']) => {
  switch (status) {
    case 'approved':
      return { bg: '#E8F5E9', text: BrandColors.green, icon: 'check-circle' as const, label: 'Approved' };
    case 'rejected':
      return { bg: '#FFEBEE', text: '#D32F2F', icon: 'times-circle' as const, label: 'Rejected' };
    case 'withdrawn':
      return { bg: '#F3F4F6', text: BrandColors.grey, icon: 'minus-circle' as const, label: 'Withdrawn' };
    default:
      return { bg: '#FFF8E1', text: BrandColors.yellow, icon: 'clock-o' as const, label: 'Pending Review' };
  }
};

export const MerchantApplicantsSection = ({ programId, onUpdated }: Props) => {
  const [applicants, setApplicants] = useState<MerchantProgramApplicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});

  const loadApplicants = async () => {
    try {
      const data = await fetchProgramMerchantApplications(programId);
      setApplicants(data);
    } catch (err) {
      console.error('Error loading program merchant applicants:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadApplicants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId]);

  const handleApprove = async (applicant: MerchantProgramApplicant) => {
    setUpdatingId(applicant.application_id);
    try {
      const res = await reviewMerchantApplication(applicant.application_id, 'approved');
      if (!res.success) {
        Alert.alert('Error', res.error || 'Failed to approve application.');
        return;
      }
      Alert.alert(
        'Merchant Accredited',
        `"${applicant.display_name}" is now accredited for this program.`,
      );
      await loadApplicants();
      if (onUpdated) onUpdated();
    } catch (err) {
      console.error('Error approving merchant applicant:', err);
      Alert.alert('Error', 'Failed to approve application.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleStartReject = (appId: string) => {
    setRejectingId(appId);
  };

  const handleConfirmReject = async (applicant: MerchantProgramApplicant) => {
    const reason = rejectionReasons[applicant.application_id]?.trim();
    if (!reason) {
      Alert.alert('Reason Required', 'Please provide a reason why this merchant is not accepted.');
      return;
    }

    setUpdatingId(applicant.application_id);
    try {
      const res = await reviewMerchantApplication(applicant.application_id, 'rejected', reason);
      if (!res.success) {
        Alert.alert('Error', res.error || 'Failed to decline application.');
        return;
      }
      setRejectingId(null);
      await loadApplicants();
      if (onUpdated) onUpdated();
    } catch (err) {
      console.error('Error rejecting merchant applicant:', err);
      Alert.alert('Error', 'Failed to decline application.');
    } finally {
      setUpdatingId(null);
    }
  };

  const pendingCount = applicants.filter((a) => a.status === 'pending').length;
  const approvedCount = applicants.filter((a) => a.status === 'approved').length;

  return (
    <View style={styles.section}>
      {/* Header */}
      <View style={styles.sectionHeaderRow}>
        <View style={styles.titleWithIcon}>
          <MaterialCommunityIcons name="storefront-outline" size={20} color={BrandColors.navy} />
          <Text style={styles.sectionTitle}>Merchant Applications</Text>
        </View>

        <View style={styles.pillContainer}>
          {approvedCount > 0 && (
            <View style={styles.approvedPill}>
              <Text style={styles.approvedPillText}>{approvedCount} Accredited</Text>
            </View>
          )}
          {pendingCount > 0 && (
            <View style={styles.pendingPill}>
              <Text style={styles.pendingPillText}>{pendingCount} Pending</Text>
            </View>
          )}
        </View>
      </View>

      <Text style={styles.sectionSubtitle}>
        Merchants who voluntarily applied to accept relief vouchers for this program.
      </Text>

      {/* Body */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={BrandColors.green} />
          <Text style={styles.loadingText}>Loading applications…</Text>
        </View>
      ) : applicants.length === 0 ? (
        <View style={styles.emptyBox}>
          <MaterialCommunityIcons name="store-clock-outline" size={32} color={BrandColors.grey} />
          <Text style={styles.emptyTitle}>No Merchant Applications Yet</Text>
          <Text style={styles.emptyDesc}>
            Registered merchants can discover this program (in Draft or Active status) on their
            Programs page and apply to accept vouchers. Approved merchants will appear here.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {applicants.map((item) => {
            const style = statusStyleFor(item.status);
            const isPending = item.status === 'pending';
            const isRejecting = rejectingId === item.application_id;
            const isUpdating = updatingId === item.application_id;

            return (
              <View key={item.application_id} style={styles.applicantCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.merchantInfo}>
                    <Text style={styles.merchantName}>{item.display_name}</Text>
                    {item.owner_name && (
                      <Text style={styles.ownerText}>Owner: {item.owner_name}</Text>
                    )}
                    {item.mobile_number && (
                      <Text style={styles.contactText}>Phone: {item.mobile_number}</Text>
                    )}
                  </View>

                  <View style={[styles.statusBadge, { backgroundColor: style.bg }]}>
                    <FontAwesome name={style.icon} size={11} color={style.text} />
                    <Text style={[styles.statusBadgeText, { color: style.text }]}>
                      {style.label}
                    </Text>
                  </View>
                </View>

                {item.notes ? (
                  <View style={styles.notesBox}>
                    <Text style={styles.notesLabel}>Merchant Note:</Text>
                    <Text style={styles.notesText}>{item.notes}</Text>
                  </View>
                ) : null}

                {item.rejection_reason ? (
                  <View style={styles.rejectionBox}>
                    <Text style={styles.rejectionLabel}>Decline Reason:</Text>
                    <Text style={styles.rejectionText}>{item.rejection_reason}</Text>
                  </View>
                ) : null}

                {/* Actions for Pending Applications */}
                {isPending && (
                  <View style={styles.actionRow}>
                    {isRejecting ? (
                      <View style={styles.rejectContainer}>
                        <TextInput
                          style={styles.reasonInput}
                          placeholder="State reason for declining application..."
                          placeholderTextColor={BrandColors.grey}
                          value={rejectionReasons[item.application_id] || ''}
                          onChangeText={(text) =>
                            setRejectionReasons((prev) => ({
                              ...prev,
                              [item.application_id]: text,
                            }))
                          }
                          multiline
                        />
                        <View style={styles.rejectBtnRow}>
                          <TouchableOpacity
                            style={styles.cancelRejectBtn}
                            onPress={() => setRejectingId(null)}
                            disabled={isUpdating}
                          >
                            <Text style={styles.cancelRejectText}>Cancel</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.confirmRejectBtn}
                            onPress={() => void handleConfirmReject(item)}
                            disabled={isUpdating}
                          >
                            {isUpdating ? (
                              <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                              <Text style={styles.confirmRejectText}>Confirm Decline</Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <View style={styles.buttonGroup}>
                        <TouchableOpacity
                          style={styles.rejectBtn}
                          onPress={() => handleStartReject(item.application_id)}
                          disabled={isUpdating}
                        >
                          <Text style={styles.rejectBtnText}>Decline</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.acceptBtn}
                          onPress={() => void handleApprove(item)}
                          disabled={isUpdating}
                        >
                          {isUpdating ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <>
                              <FontAwesome name="check" size={12} color="#FFFFFF" />
                              <Text style={styles.acceptBtnText}>Accept Merchant</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: Spacing.three,
    padding: Spacing.three,
  },
  sectionHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  titleWithIcon: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
  },
  sectionTitle: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
  },
  sectionSubtitle: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 11,
    marginTop: 2,
    marginBottom: Spacing.three,
  },
  pillContainer: {
    flexDirection: 'row',
    gap: 6,
  },
  approvedPill: {
    backgroundColor: '#DCFCE7',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  approvedPillText: {
    color: '#15803D',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
  },
  pendingPill: {
    backgroundColor: '#FEF3C7',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  pendingPillText: {
    color: '#B45309',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
  },
  loadingBox: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    padding: Spacing.three,
    gap: Spacing.two,
  },
  loadingText: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
  },
  emptyBox: {
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: BorderRadius.md,
    padding: Spacing.four,
  },
  emptyTitle: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    marginTop: Spacing.two,
  },
  emptyDesc: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
    textAlign: 'center',
  },
  list: {
    gap: Spacing.two,
  },
  applicantCard: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.three,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  merchantInfo: {
    flex: 1,
  },
  merchantName: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
  },
  ownerText: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 10,
    marginTop: 1,
  },
  contactText: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 10,
    marginTop: 1,
  },
  statusBadge: {
    alignItems: 'center',
    borderRadius: BorderRadius.full,
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 4,
  },
  statusBadgeText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
  },
  notesBox: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    marginTop: Spacing.two,
    padding: Spacing.two,
  },
  notesLabel: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 9,
  },
  notesText: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 10,
    marginTop: 1,
  },
  rejectionBox: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    marginTop: Spacing.two,
    padding: Spacing.two,
  },
  rejectionLabel: {
    color: '#991B1B',
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 9,
  },
  rejectionText: {
    color: '#B91C1C',
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 10,
    marginTop: 1,
  },
  actionRow: {
    marginTop: Spacing.two,
    paddingTop: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  buttonGroup: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
  rejectBtn: {
    backgroundColor: '#FEE2E2',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: 7,
  },
  rejectBtnText: {
    color: '#DC2626',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
  },
  acceptBtn: {
    alignItems: 'center',
    backgroundColor: BrandColors.green,
    borderRadius: BorderRadius.md,
    flexDirection: 'row',
    paddingHorizontal: Spacing.three,
    paddingVertical: 7,
    gap: 5,
  },
  acceptBtnText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
  },
  rejectContainer: {
    gap: Spacing.two,
  },
  reasonInput: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D1D5DB',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 11,
    minHeight: 50,
    padding: Spacing.two,
    textAlignVertical: 'top',
  },
  rejectBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
  cancelRejectBtn: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 6,
  },
  cancelRejectText: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
  },
  confirmRejectBtn: {
    backgroundColor: '#DC2626',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
  },
  confirmRejectText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
  },
});

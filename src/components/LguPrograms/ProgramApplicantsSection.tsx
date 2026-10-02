import { FontAwesome } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import {
    fetchProgramApplicants,
    ProgramApplicant,
    updateEnrollmentStatus,
} from '@/services/enrollmentService';
import { RequirementResponsesReview } from './RequirementResponsesReview';

type ProgramApplicantsSectionProps = {
  programId: string;
};

const statusStyleFor = (status: ProgramApplicant['approvalStatus']) => {
  switch (status) {
    case 'Approved':
      return { bg: '#E8F5E9', text: BrandColors.green, icon: 'check-circle' as const };
    case 'Rejected':
      return { bg: '#FFEBEE', text: '#D32F2F', icon: 'times-circle' as const };
    default:
      return { bg: '#FFF8E1', text: BrandColors.yellow, icon: 'clock-o' as const };
  }
};

export const ProgramApplicantsSection = ({ programId }: ProgramApplicantsSectionProps) => {
  const [applicants, setApplicants] = useState<ProgramApplicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionNotesById, setRejectionNotesById] = useState<Record<string, string>>({});

  const loadApplicants = async () => {
    try {
      const data = await fetchProgramApplicants(programId);
      setApplicants(data);
    } catch (err) {
      console.error('Error fetching program applicants:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.resolve().then(() => {
      loadApplicants();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId]);

  const handleApprove = async (enrollmentId: string) => {
    setUpdatingId(enrollmentId);
    try {
      await updateEnrollmentStatus(enrollmentId, 'Approved');
      // Refetch rather than patch locally: approving also allocates a voucher_balance
      // server-side, so the list needs the updated amount, not just the new status.
      await loadApplicants();
    } catch (err) {
      console.error('Error approving applicant:', err);
      Alert.alert('Error', 'Failed to approve this application. Please try again.');
    } finally {
      setUpdatingId(null);
    }
  };

  // Rejecting requires a reason (BEN-02: the beneficiary must see a clear
  // rejection reason, and the DB now enforces this is never empty) — opens
  // an inline reason field on the applicant card rather than rejecting
  // immediately on tap.
  const handleStartReject = (enrollmentId: string) => {
    setRejectingId(enrollmentId);
  };

  const handleConfirmReject = async (enrollmentId: string) => {
    const reason = rejectionNotesById[enrollmentId]?.trim();
    if (!reason) {
      Alert.alert('Reason Required', 'Please explain why this application is being rejected.');
      return;
    }
    setUpdatingId(enrollmentId);
    try {
      await updateEnrollmentStatus(enrollmentId, 'Rejected', reason);
      setRejectingId(null);
      await loadApplicants();
    } catch (err) {
      console.error('Error rejecting applicant:', err);
      Alert.alert('Error', 'Failed to reject this application. Please try again.');
    } finally {
      setUpdatingId(null);
    }
  };

  const pendingCount = applicants.filter((a) => a.approvalStatus === 'Pending').length;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Applicants</Text>
        {pendingCount > 0 && (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeText}>{pendingCount} Pending</Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={BrandColors.navy} size="small" />
        </View>
      ) : applicants.length === 0 ? (
        <Text style={styles.emptyText}>No applications yet for this program.</Text>
      ) : (
        applicants.map((applicant) => {
          const statusStyle = statusStyleFor(applicant.approvalStatus);
          const isUpdating = updatingId === applicant.enrollmentId;

          const isExpanded = expandedId === applicant.enrollmentId;

          return (
            <View key={applicant.enrollmentId} style={styles.applicantCard}>
              <TouchableOpacity
                onPress={() => setExpandedId(isExpanded ? null : applicant.enrollmentId)}
                style={styles.applicantRow}
              >
                <View style={styles.applicantInfo}>
                  <Text style={styles.applicantName}>{applicant.fullName}</Text>
                  <Text style={styles.applicantMeta}>
                    {applicant.barangayName ?? 'No barangay on file'} · Gov ID: {applicant.govId ?? 'N/A'}
                  </Text>
                  {applicant.approvalStatus === 'Approved' && (
                    <Text style={styles.voucherText}>
                      Voucher: ₱{applicant.voucherBalance.toLocaleString()}
                    </Text>
                  )}
                </View>
                <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                  <FontAwesome color={statusStyle.text} name={statusStyle.icon} size={11} />
                  <Text style={[styles.statusBadgeText, { color: statusStyle.text }]}>
                    {applicant.approvalStatus}
                  </Text>
                </View>
                <FontAwesome
                  color={BrandColors.grey}
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={12}
                  style={styles.expandIcon}
                />
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.requirementsSection}>
                  <Text style={styles.requirementsSectionTitle}>Submitted Requirements</Text>
                  <RequirementResponsesReview enrollmentId={applicant.enrollmentId} />
                </View>
              )}

              {applicant.approvalStatus === 'Pending' && rejectingId === applicant.enrollmentId && (
                <View style={styles.rejectionReasonBox}>
                  <TextInput
                    style={styles.rejectionReasonInput}
                    placeholder="Explain why this application is being rejected (shown to the beneficiary)"
                    placeholderTextColor="#94A3B8"
                    value={rejectionNotesById[applicant.enrollmentId] ?? ''}
                    onChangeText={(text) =>
                      setRejectionNotesById((prev) => ({ ...prev, [applicant.enrollmentId]: text }))
                    }
                    multiline
                  />
                </View>
              )}

              {applicant.approvalStatus === 'Pending' && (
                <View style={styles.actionsRow}>
                  {rejectingId === applicant.enrollmentId ? (
                    <>
                      <TouchableOpacity
                        disabled={isUpdating}
                        onPress={() => setRejectingId(null)}
                        style={[styles.actionButton, styles.cancelButton]}
                      >
                        <Text style={styles.cancelButtonText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        disabled={isUpdating}
                        onPress={() => handleConfirmReject(applicant.enrollmentId)}
                        style={[styles.actionButton, styles.rejectButton]}
                      >
                        {isUpdating ? (
                          <ActivityIndicator color="#D32F2F" size="small" />
                        ) : (
                          <Text style={styles.rejectButtonText}>Confirm Reject</Text>
                        )}
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <TouchableOpacity
                        disabled={isUpdating}
                        onPress={() => handleStartReject(applicant.enrollmentId)}
                        style={[styles.actionButton, styles.rejectButton]}
                      >
                        <Text style={styles.rejectButtonText}>Reject</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        disabled={isUpdating}
                        onPress={() => handleApprove(applicant.enrollmentId)}
                        style={[styles.actionButton, styles.approveButton]}
                      >
                        {isUpdating ? (
                          <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                          <Text style={styles.approveButtonText}>Approve</Text>
                        )}
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              )}
            </View>
          );
        })
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginBottom: Spacing.four,
    backgroundColor: '#FFFFFF',
    padding: Spacing.four,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: BrandColors.lightGray,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: BrandColors.lightGray,
    paddingBottom: 6,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  pendingBadge: {
    backgroundColor: '#FFF8E1',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  pendingBadgeText: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.yellow,
  },
  loadingRow: {
    paddingVertical: Spacing.four,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#8E9AA8',
    paddingVertical: Spacing.two,
  },
  applicantCard: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BrandColors.lightGray,
    paddingVertical: Spacing.three,
  },
  applicantRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  expandIcon: {
    marginLeft: Spacing.two,
    marginTop: 4,
  },
  requirementsSection: {
    marginTop: Spacing.three,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BrandColors.lightGray,
  },
  requirementsSectionTitle: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: Spacing.two,
  },
  applicantInfo: {
    flex: 1,
    marginRight: Spacing.two,
  },
  applicantName: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
  },
  applicantMeta: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#8E9AA8',
    marginTop: 2,
  },
  voucherText: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.green,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusBadgeText: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  actionsRow: {
    flexDirection: 'row',
    marginTop: Spacing.three,
    gap: Spacing.three,
  },
  actionButton: {
    flex: 1,
    height: 38,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rejectButton: {
    backgroundColor: '#FFEBEE',
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  rejectButtonText: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#D32F2F',
  },
  approveButton: {
    backgroundColor: '#0E8B2C',
  },
  approveButtonText: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#FFFFFF',
  },
  rejectionReasonBox: {
    marginTop: Spacing.three,
  },
  rejectionReasonInput: {
    borderWidth: 1,
    borderColor: '#FFCDD2',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.three,
    paddingVertical: 8,
    fontSize: 12,
    color: '#334155',
    backgroundColor: '#FFF5F5',
    minHeight: 44,
    textAlignVertical: 'top',
  },
  cancelButton: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  cancelButtonText: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#334155',
  },
});

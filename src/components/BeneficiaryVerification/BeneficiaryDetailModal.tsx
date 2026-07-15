import { FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import {
    BeneficiaryApplication,
    fetchBeneficiaryApplications,
    updateEnrollmentStatus,
} from '@/services/enrollmentService';
import type { UserProfile } from '@/types/auth';

type Props = {
  beneficiary: UserProfile | null;
  onClose: () => void;
  onUpdateStatus: (id: string, status: 'Verified' | 'Rejected' | 'Pending') => Promise<void>;
};

export const BeneficiaryDetailModal = ({ beneficiary, onClose, onUpdateStatus }: Props) => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [applications, setApplications] = useState<BeneficiaryApplication[]>([]);
  const [loadingApplications, setLoadingApplications] = useState(false);
  const [updatingApplicationId, setUpdatingApplicationId] = useState<string | null>(null);

  const loadApplications = async (beneficiaryId: string) => {
    setLoadingApplications(true);
    try {
      const data = await fetchBeneficiaryApplications(beneficiaryId);
      setApplications(data);
    } catch (err) {
      console.error('Error fetching beneficiary applications:', err);
    } finally {
      setLoadingApplications(false);
    }
  };

  useEffect(() => {
    if (!beneficiary) return;
    void loadApplications(beneficiary.id);
  }, [beneficiary]);

  const handleApplicationDecision = async (enrollmentId: string, status: 'Approved' | 'Rejected') => {
    setUpdatingApplicationId(enrollmentId);
    try {
      await updateEnrollmentStatus(enrollmentId, status);
      if (beneficiary) await loadApplications(beneficiary.id);
    } catch (err) {
      console.error('Error updating application status:', err);
    } finally {
      setUpdatingApplicationId(null);
    }
  };

  useEffect(() => {
    let isMounted = true;
    if (!beneficiary?.gov_id_url) {
      Promise.resolve().then(() => {
        if (isMounted) setSignedUrl(null);
      });
      return;
    }
    const fetchSignedUrl = async () => {
      setLoadingUrl(true);
      try {
        const { data, error } = await supabase.storage
          .from('valid_ids')
          .createSignedUrl(beneficiary.gov_id_url!, 300);
        if (error) throw error;
        if (isMounted) setSignedUrl(data.signedUrl);
      } catch (err) {
        console.error('Error generating signed URL:', err);
      } finally {
        if (isMounted) setLoadingUrl(false);
      }
    };

    fetchSignedUrl();
    return () => {
      isMounted = false;
    };
  }, [beneficiary]);

  const handleOpenBrowser = async () => {
    if (signedUrl) {
      await WebBrowser.openBrowserAsync(signedUrl);
    }
  };

  const handleAction = async (status: 'Verified' | 'Rejected' | 'Pending') => {
    if (!beneficiary) return;
    setIsSubmitting(true);
    try {
      await onUpdateStatus(beneficiary.id, status);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!beneficiary) return null;

  const isImage = (url: string | null | undefined) => {
    if (!url) return false;
    const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
    return ext ? ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) : false;
  };

  return (
    <Modal visible={!!beneficiary} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <ThemedText style={styles.headerTitle}>Review Profile</ThemedText>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <FontAwesome name="times" size={20} color={BrandColors.navy} />
            </Pressable>
          </View>

          {/* Details Scroll */}
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {/* Profile Overview */}
            <View style={styles.card}>
              <View style={styles.avatar}>
                <FontAwesome name="user" size={32} color="white" />
              </View>
              <ThemedText style={styles.fullName}>{beneficiary.full_name}</ThemedText>
              <ThemedText style={styles.roleSub}>Beneficiary Account</ThemedText>
            </View>

            {/* Verification status */}
            <View style={styles.section}>
              <ThemedText style={styles.sectionTitle}>Verification Status</ThemedText>
              <View style={styles.statusBox}>
                <ThemedText style={styles.statusText}>
                  Current Status:{' '}
                  <ThemedText style={[styles.statusHighlight, beneficiary.verification_status === 'Verified' && { color: BrandColors.green }, beneficiary.verification_status === 'Rejected' && { color: '#D32F2F' }]}>
                    {beneficiary.verification_status || 'Pending'}
                  </ThemedText>
                </ThemedText>
              </View>
            </View>

            {/* Program Applications (Enrollments submitted by this Beneficiary) */}
            <View style={styles.section}>
              <ThemedText style={styles.sectionTitle}>Program Applications</ThemedText>
              <View style={styles.infoCard}>
                {loadingApplications ? (
                  <ActivityIndicator color={BrandColors.navy} size="small" />
                ) : applications.length === 0 ? (
                  <ThemedText style={styles.noFileText}>No program applications yet.</ThemedText>
                ) : (
                  applications.map((application) => {
                    const isUpdating = updatingApplicationId === application.enrollmentId;
                    const statusColor =
                      application.approvalStatus === 'Approved'
                        ? BrandColors.green
                        : application.approvalStatus === 'Rejected'
                          ? '#D32F2F'
                          : BrandColors.yellow;

                    return (
                      <View key={application.enrollmentId} style={styles.applicationRow}>
                        <View style={styles.applicationHeaderRow}>
                          <ThemedText style={styles.applicationProgramName}>{application.programName}</ThemedText>
                          <ThemedText style={[styles.applicationStatus, { color: statusColor }]}>
                            {application.approvalStatus}
                          </ThemedText>
                        </View>
                        {application.approvalStatus === 'Approved' && (
                          <ThemedText style={styles.applicationVoucher}>
                            Voucher: ₱{application.voucherBalance.toLocaleString()}
                          </ThemedText>
                        )}
                        {application.approvalStatus === 'Pending' && (
                          <View style={styles.applicationActionsRow}>
                            <Pressable
                              disabled={isUpdating}
                              onPress={() => handleApplicationDecision(application.enrollmentId, 'Rejected')}
                              style={[styles.applicationActionButton, styles.applicationRejectButton]}
                            >
                              <ThemedText style={styles.applicationRejectText}>Reject</ThemedText>
                            </Pressable>
                            <Pressable
                              disabled={isUpdating}
                              onPress={() => handleApplicationDecision(application.enrollmentId, 'Approved')}
                              style={[styles.applicationActionButton, styles.applicationApproveButton]}
                            >
                              {isUpdating ? (
                                <ActivityIndicator color="white" size="small" />
                              ) : (
                                <ThemedText style={styles.applicationApproveText}>Approve</ThemedText>
                              )}
                            </Pressable>
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </View>
            </View>

            {/* Personal Details */}
            <View style={styles.section}>
              <ThemedText style={styles.sectionTitle}>Personal Details</ThemedText>
              <View style={styles.infoCard}>
                <DetailRow label="First Name" value={beneficiary.first_name} />
                <DetailRow label="Middle Initial" value={beneficiary.middle_initial} />
                <DetailRow label="Last Name" value={beneficiary.last_name} />
                <DetailRow label="Birthdate" value={beneficiary.birthdate} />
                <DetailRow label="Sex" value={beneficiary.sex} />
                <DetailRow label="Civil Status" value={beneficiary.civil_status} />
                <DetailRow label="Mobile Number" value={beneficiary.mobile_number} />
              </View>
            </View>

            {/* Address */}
            <View style={styles.section}>
              <ThemedText style={styles.sectionTitle}>Address Details</ThemedText>
              <View style={styles.infoCard}>
                <DetailRow label="Complete Address" value={beneficiary.complete_address} />
                <DetailRow label="Municipality / City" value={beneficiary.municipality_city} />
                <DetailRow label="Full Location Summary" value={beneficiary.location} />
              </View>
            </View>

            {/* Wallet */}
            <View style={styles.section}>
              <ThemedText style={styles.sectionTitle}>Blockchain Wallet</ThemedText>
              <View style={styles.infoCard}>
                <DetailRow label="Stellar Public Key" value={beneficiary.stellar_pubkey} />
              </View>
            </View>

            {/* Government ID Document */}
            <View style={styles.section}>
              <ThemedText style={styles.sectionTitle}>Government ID Attachment</ThemedText>
              <View style={styles.infoCard}>
                <DetailRow label="ID Number" value={beneficiary.gov_id} />
                <DetailRow label="ID Path in Storage" value={beneficiary.gov_id_url} />

                {/* ID Preview */}
                <View style={styles.previewContainer}>
                  {loadingUrl ? (
                    <ActivityIndicator size="small" color={BrandColors.navy} />
                  ) : signedUrl ? (
                    isImage(beneficiary.gov_id_url) ? (
                      <View style={styles.imageWrapper}>
                        <Image source={{ uri: signedUrl }} style={styles.idImage} contentFit="contain" />
                        <Pressable onPress={handleOpenBrowser} style={styles.viewFullButton}>
                          <FontAwesome name="external-link" size={14} color="white" />
                          <ThemedText style={styles.viewFullText}>View Full Image</ThemedText>
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable onPress={handleOpenBrowser} style={styles.fileLinkButton}>
                        <FontAwesome name="file-pdf-o" size={24} color="#D32F2F" />
                        <ThemedText style={styles.fileLinkText}>Open ID Document (PDF/File)</ThemedText>
                      </Pressable>
                    )
                  ) : (
                    <ThemedText style={styles.noFileText}>No ID attachment found or link expired</ThemedText>
                  )}
                </View>
              </View>
            </View>
          </ScrollView>

          {/* Action Buttons Footer */}
          <View style={styles.footer}>
            {isSubmitting ? (
              <ActivityIndicator size="small" color={BrandColors.navy} style={styles.loader} />
            ) : (
              <View style={styles.buttonRow}>
                {beneficiary.verification_status !== 'Rejected' && (
                  <Pressable
                    onPress={() => handleAction('Rejected')}
                    style={[styles.actionButton, styles.btnReject]}
                  >
                    <FontAwesome name="times" size={16} color="white" />
                    <ThemedText style={styles.btnText}>Reject</ThemedText>
                  </Pressable>
                )}

                {beneficiary.verification_status !== 'Verified' && (
                  <Pressable
                    onPress={() => handleAction('Verified')}
                    style={[styles.actionButton, styles.btnVerify]}
                  >
                    <FontAwesome name="check" size={16} color="white" />
                    <ThemedText style={styles.btnText}>Verify</ThemedText>
                  </Pressable>
                )}

                {(beneficiary.verification_status === 'Verified' || beneficiary.verification_status === 'Rejected') && (
                  <Pressable
                    onPress={() => handleAction('Pending')}
                    style={[styles.actionButton, styles.btnPending]}
                  >
                    <FontAwesome name="undo" size={16} color="white" />
                    <ThemedText style={styles.btnText}>Set to Pending</ThemedText>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const DetailRow = ({ label, value }: { label: string; value: string | null | undefined }) => (
  <View style={styles.infoRow}>
    <ThemedText style={styles.infoLabel}>{label}</ThemedText>
    <ThemedText style={styles.infoValue}>{value || '—'}</ThemedText>
  </View>
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FAFAFC',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '90%',
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.four,
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: BrandColors.navy,
  },
  closeButton: {
    padding: 4,
  },
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.five,
    alignItems: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: BrandColors.navy,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  fullName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: BrandColors.navy,
  },
  roleSub: {
    fontSize: 12,
    color: BrandColors.grey,
    marginTop: 2,
  },
  section: {
    gap: Spacing.two,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: BrandColors.navy,
    paddingLeft: 4,
  },
  statusBox: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.md,
    padding: Spacing.three,
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
  },
  statusText: {
    fontSize: 14,
    color: BrandColors.navy,
    fontWeight: '500',
  },
  statusHighlight: {
    fontWeight: 'bold',
    color: BrandColors.yellow,
  },
  infoCard: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
    gap: Spacing.two,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
  },
  infoLabel: {
    fontSize: 13,
    color: BrandColors.grey,
    flex: 0.4,
  },
  infoValue: {
    fontSize: 13,
    color: BrandColors.navy,
    fontWeight: '500',
    flex: 0.6,
    textAlign: 'right',
  },
  previewContainer: {
    marginTop: Spacing.three,
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  imageWrapper: {
    width: '100%',
    alignItems: 'center',
    gap: Spacing.two,
  },
  idImage: {
    width: '100%',
    height: 180,
    borderRadius: BorderRadius.md,
    backgroundColor: '#F3F4F6',
  },
  viewFullButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BrandColors.navy,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    gap: 6,
  },
  viewFullText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  fileLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF5F5',
    borderColor: '#FEB2B2',
    borderWidth: 1,
    padding: Spacing.three,
    borderRadius: BorderRadius.md,
    gap: Spacing.two,
  },
  fileLinkText: {
    fontSize: 14,
    color: '#C53030',
    fontWeight: '600',
  },
  noFileText: {
    fontSize: 13,
    color: BrandColors.grey,
    fontStyle: 'italic',
  },
  applicationRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
    paddingVertical: Spacing.two,
  },
  applicationHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  applicationProgramName: {
    fontSize: 13,
    fontWeight: '600',
    color: BrandColors.navy,
    flex: 1,
    marginRight: Spacing.two,
  },
  applicationStatus: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  applicationVoucher: {
    fontSize: 12,
    fontWeight: 'bold',
    color: BrandColors.green,
    marginTop: 2,
  },
  applicationActionsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  applicationActionButton: {
    flex: 1,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  applicationRejectButton: {
    backgroundColor: '#FFEBEE',
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  applicationRejectText: {
    color: '#D32F2F',
    fontSize: 12,
    fontWeight: 'bold',
  },
  applicationApproveButton: {
    backgroundColor: '#0E8B2C',
  },
  applicationApproveText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  footer: {
    backgroundColor: 'white',
    padding: Spacing.four,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
  },
  loader: {
    alignSelf: 'center',
    paddingVertical: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    justifyContent: 'center',
  },
  actionButton: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  btnVerify: {
    backgroundColor: BrandColors.green,
  },
  btnReject: {
    backgroundColor: '#D32F2F',
  },
  btnPending: {
    backgroundColor: BrandColors.navy,
  },
  btnText: {
    color: 'white',
    fontSize: 15,
    fontWeight: 'bold',
  },
});

import { FontAwesome } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { FilePreviewModal } from '@/components/shared/FilePreviewModal';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { fetchProgramAppeals, resolveAppeal } from '@/services/appeal-service';
import { getSignedDocumentUrl } from '@/services/document-upload-service';
import { BeneficiaryAppeal } from '@/types/appeal';
import { isStoragePath } from '@/utils/file-preview';

type AppealsReviewSectionProps = {
  programId: string;
};

const statusStyleFor = (status: BeneficiaryAppeal['status']) => {
  switch (status) {
    case 'approved':
      return { bg: '#E8F5E9', text: BrandColors.green, label: 'Approved' };
    case 'rejected':
      return { bg: '#FFEBEE', text: '#D32F2F', label: 'Rejected' };
    case 'under_review':
      return { bg: '#EBF4FF', text: '#2563EB', label: 'Under Review' };
    default:
      return { bg: '#FFF8E1', text: BrandColors.yellow, label: 'Submitted' };
  }
};

export const AppealsReviewSection = ({ programId }: AppealsReviewSectionProps) => {
  const [appeals, setAppeals] = useState<BeneficiaryAppeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [previewTarget, setPreviewTarget] = useState<{ label: string; path: string } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const loadAppeals = async () => {
    try {
      const data = await fetchProgramAppeals(programId);
      setAppeals(data);
    } catch (err) {
      console.error('Error fetching program appeals:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.resolve().then(() => {
      loadAppeals();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId]);

  const handleDecision = async (appeal: BeneficiaryAppeal, decision: 'approved' | 'rejected') => {
    if (decision === 'rejected' && !notesById[appeal.id]?.trim()) {
      Alert.alert('Remarks Required', 'Please provide remarks explaining why this appeal is being rejected.');
      return;
    }

    setUpdatingId(appeal.id);
    try {
      await resolveAppeal(appeal.id, decision, notesById[appeal.id]?.trim() || undefined);
      await loadAppeals();
    } catch (err) {
      console.error('Error resolving appeal:', err);
      Alert.alert('Error', 'Failed to update the appeal. Please try again.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleViewDocument = async (label: string, path: string) => {
    setPreviewTarget({ label, path });
    setPreviewUrl(null);
    setPreviewLoading(true);
    try {
      const url = await getSignedDocumentUrl(path);
      setPreviewUrl(url);
    } catch (err) {
      console.error('Error opening appeal document:', err);
      Alert.alert('Error', 'Could not open this document.');
      setPreviewTarget(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    setPreviewTarget(null);
    setPreviewUrl(null);
  };

  const pendingCount = appeals.filter((a) => a.status === 'pending' || a.status === 'under_review').length;

  return (
    <View style={styles.section}>
      <FilePreviewModal
        fileName={previewTarget?.label ?? ''}
        isLoading={previewLoading}
        onClose={closePreview}
        signedUrl={previewUrl}
        visible={!!previewTarget}
      />
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Appeals</Text>
        {pendingCount > 0 && (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeText}>{pendingCount} Awaiting Review</Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={BrandColors.navy} size="small" />
        </View>
      ) : appeals.length === 0 ? (
        <Text style={styles.emptyText}>No appeals have been submitted for this program.</Text>
      ) : (
        appeals.map((appeal) => {
          const statusStyle = statusStyleFor(appeal.status);
          const isUpdating = updatingId === appeal.id;
          const isResolved = appeal.status === 'approved' || appeal.status === 'rejected';

          return (
            <View key={appeal.id} style={styles.appealCard}>
              <View style={styles.appealRow}>
                <View style={styles.appealInfo}>
                  <Text style={styles.reasonText}>{appeal.reason}</Text>
                  {appeal.documentUrls.length > 0 && (
                    <View style={styles.docsRow}>
                      {appeal.documentUrls.map((url, idx) =>
                        isStoragePath(url) ? (
                          <TouchableOpacity
                            key={idx}
                            onPress={() => handleViewDocument(`Document ${idx + 1}`, url)}
                            style={styles.docChip}
                          >
                            <FontAwesome name="paperclip" size={10} color={BrandColors.navy} />
                            <Text style={styles.docChipText}>Document {idx + 1}</Text>
                          </TouchableOpacity>
                        ) : (
                          <View key={idx} style={[styles.docChip, styles.docChipUnavailable]}>
                            <FontAwesome name="exclamation-triangle" size={10} color="#B45309" />
                            <Text style={[styles.docChipText, styles.docChipTextUnavailable]}>
                              Unavailable (legacy upload)
                            </Text>
                          </View>
                        )
                      )}
                    </View>
                  )}
                </View>
                <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                  <Text style={[styles.statusBadgeText, { color: statusStyle.text }]}>
                    {statusStyle.label}
                  </Text>
                </View>
              </View>

              {isResolved && appeal.reviewerNotes && (
                <Text style={styles.reviewerNotesText}>Remarks: {appeal.reviewerNotes}</Text>
              )}

              {!isResolved && (
                <>
                  <TextInput
                    style={styles.notesInput}
                    placeholder="Remarks (required when rejecting)"
                    placeholderTextColor="#94A3B8"
                    value={notesById[appeal.id] ?? ''}
                    onChangeText={(text) => setNotesById((prev) => ({ ...prev, [appeal.id]: text }))}
                    multiline
                  />
                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      disabled={isUpdating}
                      onPress={() => handleDecision(appeal, 'rejected')}
                      style={[styles.actionButton, styles.rejectButton]}
                    >
                      <Text style={styles.rejectButtonText}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      disabled={isUpdating}
                      onPress={() => handleDecision(appeal, 'approved')}
                      style={[styles.actionButton, styles.approveButton]}
                    >
                      {isUpdating ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={styles.approveButtonText}>Approve</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
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
  appealCard: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BrandColors.lightGray,
    paddingVertical: Spacing.three,
  },
  appealRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  appealInfo: {
    flex: 1,
    marginRight: Spacing.two,
  },
  reasonText: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: BrandColors.navy,
    lineHeight: 18,
  },
  docsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: Spacing.two,
  },
  docChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  docChipUnavailable: {
    backgroundColor: '#FFF8E1',
  },
  docChipText: {
    fontSize: 10,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: BrandColors.navy,
  },
  docChipTextUnavailable: {
    color: '#B45309',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  reviewerNotesText: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#64748B',
    marginTop: Spacing.two,
    fontStyle: 'italic',
  },
  notesInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.three,
    paddingVertical: 8,
    fontSize: 12,
    color: '#334155',
    marginTop: Spacing.three,
    minHeight: 40,
    textAlignVertical: 'top',
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
});

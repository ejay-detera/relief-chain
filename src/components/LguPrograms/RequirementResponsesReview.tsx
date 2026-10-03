import { FontAwesome } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { FilePreviewModal } from '@/components/shared/FilePreviewModal';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { getSignedDocumentUrl } from '@/services/document-upload-service';
import { fetchEnrollmentResponses, reviewRequirementResponse } from '@/services/program-requirements-service';
import { EnrollmentRequirementResponse } from '@/types/program-requirement';
import { isStoragePath } from '@/utils/file-preview';

type Props = {
  enrollmentId: string;
};

const statusStyleFor = (status: EnrollmentRequirementResponse['status']) => {
  switch (status) {
    case 'verified':
      return { bg: '#E8F5E9', text: BrandColors.green, label: 'Verified' };
    case 'rejected':
      return { bg: '#FFEBEE', text: '#D32F2F', label: 'Rejected' };
    default:
      return { bg: '#FFF8E1', text: BrandColors.yellow, label: 'Submitted' };
  }
};

/**
 * Per-requirement review panel shown inside an applicant's expanded card
 * (`ProgramApplicantsSection`). Previously an org reviewer could only
 * approve/reject the whole enrollment and had no visibility into what the
 * beneficiary actually submitted for each custom program requirement — this
 * surfaces every response (text value, or a signed-URL link to an uploaded
 * document) with its own verify/reject control.
 */
export const RequirementResponsesReview = ({ enrollmentId }: Props) => {
  const [responses, setResponses] = useState<EnrollmentRequirementResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [previewTarget, setPreviewTarget] = useState<{ label: string; path: string } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const load = async () => {
    try {
      const data = await fetchEnrollmentResponses(enrollmentId);
      setResponses(data);
    } catch (err) {
      console.error('Error fetching requirement responses:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.resolve().then(() => {
      load();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrollmentId]);

  const handleReview = async (response: EnrollmentRequirementResponse, status: 'verified' | 'rejected') => {
    if (status === 'rejected' && !notesById[response.id]?.trim()) {
      Alert.alert('Remarks Required', 'Please explain why this submission is being rejected.');
      return;
    }
    setUpdatingId(response.id);
    try {
      await reviewRequirementResponse(response.id, status, notesById[response.id]?.trim() || undefined);
      await load();
    } catch (err) {
      console.error('Error reviewing requirement response:', err);
      Alert.alert('Error', 'Failed to update this requirement. Please try again.');
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
      console.error('Error opening requirement document:', err);
      Alert.alert('Error', 'Could not open this document.');
      setPreviewTarget(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator color={BrandColors.navy} size="small" />
      </View>
    );
  }

  if (responses.length === 0) {
    return <Text style={styles.emptyText}>No custom requirements were submitted with this application.</Text>;
  }

  const closePreview = () => {
    setPreviewTarget(null);
    setPreviewUrl(null);
  };

  return (
    <View style={styles.container}>
      <FilePreviewModal
        fileName={previewTarget?.label ?? ''}
        isLoading={previewLoading}
        onClose={closePreview}
        signedUrl={previewUrl}
        visible={!!previewTarget}
      />
      {responses.map((response) => {
        const statusStyle = statusStyleFor(response.status);
        const isUpdating = updatingId === response.id;
        const isResolved = response.status === 'verified' || response.status === 'rejected';

        return (
          <View key={response.id} style={styles.responseCard}>
            <View style={styles.responseHeaderRow}>
              <Text style={styles.requirementLabel} numberOfLines={2}>
                {response.requirement?.label ?? 'Requirement'}
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                <Text style={[styles.statusBadgeText, { color: statusStyle.text }]}>{statusStyle.label}</Text>
              </View>
            </View>

            {response.value && <Text style={styles.valueText}>{response.value}</Text>}

            {response.fileUrl && (
              isStoragePath(response.fileUrl) ? (
                <TouchableOpacity
                  onPress={() => handleViewDocument(response.requirement?.label ?? 'Submitted File', response.fileUrl!)}
                  style={styles.docChip}
                >
                  <FontAwesome name="paperclip" size={10} color={BrandColors.navy} />
                  <Text style={styles.docChipText}>View Submitted File</Text>
                </TouchableOpacity>
              ) : (
                <View style={[styles.docChip, styles.docChipUnavailable]}>
                  <FontAwesome name="exclamation-triangle" size={10} color="#B45309" />
                  <Text style={[styles.docChipText, styles.docChipTextUnavailable]}>
                    Unavailable (legacy upload)
                  </Text>
                </View>
              )
            )}

            {isResolved && response.reviewerNotes && (
              <Text style={styles.reviewerNotesText}>Remarks: {response.reviewerNotes}</Text>
            )}

            {!isResolved && (
              <>
                <TextInput
                  style={styles.notesInput}
                  placeholder="Remarks (required when rejecting)"
                  placeholderTextColor="#94A3B8"
                  value={notesById[response.id] ?? ''}
                  onChangeText={(text) => setNotesById((prev) => ({ ...prev, [response.id]: text }))}
                  multiline
                />
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    disabled={isUpdating}
                    onPress={() => handleReview(response, 'rejected')}
                    style={[styles.actionButton, styles.rejectButton]}
                  >
                    <Text style={styles.rejectButtonText}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={isUpdating}
                    onPress={() => handleReview(response, 'verified')}
                    style={[styles.actionButton, styles.verifyButton]}
                  >
                    {isUpdating ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={styles.verifyButtonText}>Verify</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.three,
    rowGap: Spacing.two,
  },
  loadingRow: {
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#8E9AA8',
    paddingVertical: Spacing.two,
    fontStyle: 'italic',
  },
  responseCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: BorderRadius.md,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  responseHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  requirementLabel: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
    flex: 1,
    marginRight: Spacing.two,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusBadgeText: {
    fontSize: 10,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  valueText: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#334155',
    marginTop: 2,
  },
  docChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
    marginTop: Spacing.two,
    alignSelf: 'flex-start',
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
  reviewerNotesText: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#64748B',
    marginTop: Spacing.two,
    fontStyle: 'italic',
  },
  notesInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.two,
    paddingVertical: 6,
    fontSize: 11,
    color: '#334155',
    marginTop: Spacing.two,
    minHeight: 32,
    textAlignVertical: 'top',
    backgroundColor: 'white',
  },
  actionsRow: {
    flexDirection: 'row',
    marginTop: Spacing.two,
    gap: Spacing.two,
  },
  actionButton: {
    flex: 1,
    height: 30,
    borderRadius: BorderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rejectButton: {
    backgroundColor: '#FFEBEE',
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  rejectButtonText: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#D32F2F',
  },
  verifyButton: {
    backgroundColor: '#0E8B2C',
  },
  verifyButtonText: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#FFFFFF',
  },
});

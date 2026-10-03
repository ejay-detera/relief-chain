import React from 'react';
import { StyleSheet, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { BeneficiaryAppeal } from '@/types/appeal';
import { AppealStatusBadge } from './appeal-status-badge';

interface Props {
  appeal: BeneficiaryAppeal;
}

export function AppealCard({ appeal }: Props) {
  const formattedDate = (() => {
    try {
      return new Date(appeal.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return '—';
    }
  })();

  const isApproved = appeal.status === 'approved';
  const isRejected = appeal.status === 'rejected';
  const isUnderReview = appeal.status === 'under_review';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleCol}>
          <ThemedText style={styles.programName} numberOfLines={1}>
            {appeal.programName ?? 'Assistance Appeal'}
          </ThemedText>
          <ThemedText style={styles.dateText}>Submitted {formattedDate}</ThemedText>
        </View>
        <AppealStatusBadge status={appeal.status} />
      </View>

      {/* Stepper timeline mini tracker */}
      <View style={styles.trackerRow}>
        <View style={styles.stepCol}>
          <View style={[styles.stepDot, styles.stepDotDone]}>
            <FontAwesome name="check" size={8} color="white" />
          </View>
          <ThemedText style={styles.stepLabel}>Submitted</ThemedText>
        </View>

        <View style={[styles.stepLine, (isUnderReview || isApproved || isRejected) && styles.stepLineDone]} />

        <View style={styles.stepCol}>
          <View
            style={[
              styles.stepDot,
              (isUnderReview || isApproved || isRejected) && styles.stepDotDone,
            ]}
          >
            {(isApproved || isRejected) && <FontAwesome name="check" size={8} color="white" />}
          </View>
          <ThemedText style={styles.stepLabel}>Under Review</ThemedText>
        </View>

        <View style={[styles.stepLine, (isApproved || isRejected) && styles.stepLineDone]} />

        <View style={styles.stepCol}>
          <View
            style={[
              styles.stepDot,
              isApproved && styles.stepDotApproved,
              isRejected && styles.stepDotRejected,
            ]}
          >
            {isApproved && <FontAwesome name="check" size={8} color="white" />}
            {isRejected && <FontAwesome name="times" size={8} color="white" />}
          </View>
          <ThemedText style={styles.stepLabel}>
            {isApproved ? 'Approved' : isRejected ? 'Rejected' : 'Decision'}
          </ThemedText>
        </View>
      </View>

      <View style={styles.body}>
        <ThemedText style={styles.reasonLabel}>Your Justification:</ThemedText>
        <ThemedText style={styles.reasonText}>{appeal.reason}</ThemedText>
      </View>

      {appeal.documentUrls.length > 0 && (
        <View style={styles.docsRow}>
          <FontAwesome name="paperclip" size={12} color={BrandColors.grey} />
          <ThemedText style={styles.docsCount}>
            {appeal.documentUrls.length} attached document{appeal.documentUrls.length === 1 ? '' : 's'}
          </ThemedText>
        </View>
      )}

      {appeal.reviewerNotes && (
        <View
          style={[
            styles.reviewNotesBox,
            isApproved ? styles.reviewNotesApproved : styles.reviewNotesRejected,
          ]}
        >
          <ThemedText
            style={[
              styles.reviewNotesTitle,
              isApproved ? styles.reviewNotesTitleApproved : styles.reviewNotesTitleRejected,
            ]}
          >
            Reviewer Remarks:
          </ThemedText>
          <ThemedText style={styles.reviewNotesText}>{appeal.reviewerNotes}</ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    marginBottom: Spacing.three,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.three,
  },
  titleCol: {
    flex: 1,
    marginRight: Spacing.two,
  },
  programName: {
    fontSize: 15,
    fontWeight: '700',
    color: BrandColors.navy,
  },
  dateText: {
    fontSize: 11,
    color: BrandColors.grey,
    marginTop: 2,
  },
  trackerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.three,
  },
  stepCol: {
    alignItems: 'center',
    width: 68,
  },
  stepDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  stepDotDone: {
    backgroundColor: BrandColors.green,
  },
  stepDotApproved: {
    backgroundColor: BrandColors.green,
  },
  stepDotRejected: {
    backgroundColor: '#DC2626',
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#E2E8F0',
    marginBottom: 16,
  },
  stepLineDone: {
    backgroundColor: BrandColors.green,
  },
  stepLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
    textAlign: 'center',
  },
  body: {
    marginBottom: Spacing.two,
  },
  reasonLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: BrandColors.grey,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  reasonText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
  },
  docsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 6,
    marginBottom: Spacing.two,
  },
  docsCount: {
    fontSize: 11,
    color: BrandColors.grey,
  },
  reviewNotesBox: {
    borderRadius: BorderRadius.sm,
    padding: Spacing.three,
    marginTop: Spacing.two,
  },
  reviewNotesApproved: {
    backgroundColor: '#F0FDF4',
    borderLeftWidth: 3,
    borderLeftColor: BrandColors.green,
  },
  reviewNotesRejected: {
    backgroundColor: '#FEF2F2',
    borderLeftWidth: 3,
    borderLeftColor: '#DC2626',
  },
  reviewNotesTitle: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
  reviewNotesTitleApproved: {
    color: BrandColors.green,
  },
  reviewNotesTitleRejected: {
    color: '#DC2626',
  },
  reviewNotesText: {
    fontSize: 12,
    color: '#1E293B',
    lineHeight: 16,
  },
});

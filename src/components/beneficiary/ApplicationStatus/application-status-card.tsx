import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { ApplicationStatusDetails } from '@/types/application-status';

interface Props {
  details: ApplicationStatusDetails;
}

export function ApplicationStatusCard({ details }: Props) {
  const router = useRouter();
  const isRejected = details.approvalStatus === 'Rejected' || details.currentStage === 'rejected';
  const isApproved = details.approvalStatus === 'Approved';

  const formattedDate = (() => {
    try {
      return new Date(details.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return '—';
    }
  })();

  return (
    <View style={styles.card}>
      {/* Header with program info and badge */}
      <View style={styles.header}>
        <View style={styles.titleColumn}>
          <ThemedText style={styles.programName} numberOfLines={2}>
            {details.programName}
          </ThemedText>
          <ThemedText style={styles.orgName}>{details.organizationName}</ThemedText>
        </View>

        <View
          style={[
            styles.badge,
            isApproved && styles.badgeApproved,
            isRejected && styles.badgeRejected,
            !isApproved && !isRejected && styles.badgePending,
          ]}
        >
          <ThemedText
            style={[
              styles.badgeText,
              isApproved && styles.badgeTextApproved,
              isRejected && styles.badgeTextRejected,
              !isApproved && !isRejected && styles.badgeTextPending,
            ]}
          >
            {details.currentStageLabel}
          </ThemedText>
        </View>
      </View>

      {/* Rejection Alert Box */}
      {isRejected && (
        <View style={styles.rejectionBox}>
          <View style={styles.rejectionHeader}>
            <FontAwesome name="exclamation-circle" size={16} color="#D9383A" />
            <ThemedText style={styles.rejectionTitle}>Application Rejected</ThemedText>
          </View>
          <ThemedText style={styles.rejectionText}>
            {details.rejectionReason || 'No specific rejection reason provided by the reviewer.'}
          </ThemedText>

          <Pressable
            style={styles.appealButton}
            onPress={() =>
              router.push({
                pathname: '/(beneficiary)/submit-appeal',
                params: {
                  enrollmentId: details.enrollmentId,
                  programName: details.programName,
                  programId: details.programId,
                },
              })
            }
          >
            <FontAwesome name="gavel" size={13} color="white" />
            <ThemedText style={styles.appealButtonText}>Submit an Appeal</ThemedText>
          </Pressable>
        </View>
      )}

      {/* Meta attributes */}
      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <ThemedText style={styles.metaLabel}>Aid Category</ThemedText>
          <ThemedText style={styles.metaValue}>{details.category}</ThemedText>
        </View>

        <View style={styles.metaItem}>
          <ThemedText style={styles.metaLabel}>Submitted</ThemedText>
          <ThemedText style={styles.metaValue}>{formattedDate}</ThemedText>
        </View>

        {details.voucherBalance > 0 && (
          <View style={styles.metaItem}>
            <ThemedText style={styles.metaLabel}>Allocated Balance</ThemedText>
            <ThemedText style={styles.metaValue}>₱{details.voucherBalance.toLocaleString()}</ThemedText>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    marginBottom: Spacing.four,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.three,
  },
  titleColumn: {
    flex: 1,
    paddingRight: Spacing.two,
  },
  programName: {
    fontSize: 16,
    fontWeight: '700',
    color: BrandColors.navy,
  },
  orgName: {
    fontSize: 12,
    color: BrandColors.grey,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeApproved: {
    backgroundColor: '#E8F5E9',
  },
  badgePending: {
    backgroundColor: '#FFF8E1',
  },
  badgeRejected: {
    backgroundColor: '#FDE8E8',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  badgeTextApproved: {
    color: BrandColors.green,
  },
  badgeTextPending: {
    color: '#B8860B',
  },
  badgeTextRejected: {
    color: '#D9383A',
  },
  rejectionBox: {
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#FED7D7',
    borderRadius: BorderRadius.md,
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
  rejectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 6,
    marginBottom: 4,
  },
  rejectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#D9383A',
  },
  rejectionText: {
    fontSize: 13,
    color: '#742A2A',
    lineHeight: 18,
    marginBottom: Spacing.three,
  },
  appealButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 6,
    backgroundColor: '#C53030',
    borderRadius: BorderRadius.md,
    paddingVertical: 8,
    paddingHorizontal: Spacing.three,
    alignSelf: 'flex-start',
  },
  appealButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F3',
  },
  metaItem: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 10,
    color: BrandColors.grey,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '600',
    color: BrandColors.navy,
  },
});

import { FontAwesome } from '@expo/vector-icons';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { OrganizationProgram } from '@/types/organization';

type OrganizationProgramCardProps = {
  program: OrganizationProgram;
  disabled: boolean;
  onApply: (program: OrganizationProgram) => void;
  /** Deep-links to the beneficiary's own application status for this program. */
  onViewStatus: (program: OrganizationProgram) => void;
};

const registrationLabelStyle = (status: OrganizationProgram['registrationStatus']) => {
  if (status === 'Open') return styles.registrationOpen;
  if (status === 'Not Yet Open') return styles.registrationPending;
  return styles.registrationClosed;
};

export function OrganizationProgramCard({ program, disabled, onApply, onViewStatus }: OrganizationProgramCardProps) {
  const showRegistrationWindow = program.registrationOpen !== null || program.registrationClose !== null;
  const isApplyDisabled = disabled || !program.canApply;
  const isLocationBlocked = !program.isEligibleByLocation;
  const isApproved = program.existingEnrollmentStatus === 'Approved';
  const isPending = program.existingEnrollmentStatus === 'Pending';
  // Rejected is checked alongside Approved/Pending below, ahead of the
  // location/closed checks — any existing enrollment means the beneficiary
  // already applied, so the card routes them to their status instead of
  // back to "Apply".
  const isRejected = program.existingEnrollmentStatus === 'Rejected';
  const isClosed = program.registrationStatus === 'Closed';

  const locationText =
    program.eligibleBarangayNames.length > 0
      ? program.eligibleBarangayNames.join(', ')
      : program.eligibleAreaNames && program.eligibleAreaNames.length > 0
        ? program.eligibleAreaNames.join(', ')
        : 'Open to all locations';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <FontAwesome color="white" name="building" size={18} />
        </View>
        <View style={styles.info}>
          <ThemedText style={styles.organizationName}>{program.organizationName}</ThemedText>
          <ThemedText style={styles.programName}>{program.programName}</ThemedText>
        </View>
        {program.voucherType && (
          <View style={styles.categoryBadge}>
            <ThemedText style={styles.categoryBadgeText}>{program.voucherType}</ThemedText>
          </View>
        )}
      </View>

      {program.purpose ? <ThemedText style={styles.purpose}>{program.purpose}</ThemedText> : null}

      <View style={styles.locationRow}>
        <FontAwesome color={BrandColors.grey} name="map-marker" size={13} style={styles.locationIcon} />
        <ThemedText numberOfLines={1} style={styles.locationText}>
          {locationText}
        </ThemedText>
      </View>

      {showRegistrationWindow && (
        <ThemedText style={[styles.registrationLabel, registrationLabelStyle(program.registrationStatus)]}>
          Registration: {program.registrationStatus}
        </ThemedText>
      )}

      {isApproved ? (
        <TouchableOpacity
          accessibilityHint="View your application status for this program"
          accessibilityRole="button"
          onPress={() => onViewStatus(program)}
          style={styles.approvedPill}
        >
          <FontAwesome color="#27AE60" name="check-circle" size={13} style={styles.statusIcon} />
          <ThemedText style={styles.approvedPillLabel}>Enrolled & Approved</ThemedText>
        </TouchableOpacity>
      ) : isPending ? (
        <TouchableOpacity
          accessibilityHint="View your application status for this program"
          accessibilityRole="button"
          onPress={() => onViewStatus(program)}
          style={styles.statusPill}
        >
          <FontAwesome color={BrandColors.navy} name="clock-o" size={13} style={styles.statusIcon} />
          <ThemedText style={styles.statusPillLabel}>Application Pending</ThemedText>
        </TouchableOpacity>
      ) : isRejected ? (
        <TouchableOpacity
          accessibilityHint="View your application status for this program"
          accessibilityRole="button"
          onPress={() => onViewStatus(program)}
          style={styles.ineligiblePill}
        >
          <FontAwesome color="#C0392B" name="times-circle" size={13} style={styles.statusIcon} />
          <ThemedText style={styles.ineligiblePillLabel}>Application Rejected — View Details</ThemedText>
        </TouchableOpacity>
      ) : isLocationBlocked ? (
        <View style={styles.ineligiblePill}>
          <FontAwesome color="#C0392B" name="exclamation-circle" size={13} style={styles.statusIcon} />
          <ThemedText style={styles.ineligiblePillLabel}>
            Not available in your area
            {program.eligibleBarangayNames.length > 0
              ? ` (limited to ${program.eligibleBarangayNames.join(', ')})`
              : ''}
          </ThemedText>
        </View>
      ) : isClosed ? (
        <View style={styles.closedPill}>
          <FontAwesome color={BrandColors.grey} name="ban" size={13} style={styles.statusIcon} />
          <ThemedText style={styles.closedPillLabel}>Registration Closed</ThemedText>
        </View>
      ) : (
        <TouchableOpacity
          accessibilityRole="button"
          disabled={isApplyDisabled}
          onPress={() => onApply(program)}
          style={[styles.applyButton, isApplyDisabled && styles.applyButtonDisabled]}
        >
          <ThemedText style={styles.applyButtonLabel}>Apply</ThemedText>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.three,
    marginBottom: Spacing.three,
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: BrandColors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.three,
  },
  info: {
    flex: 1,
  },
  organizationName: {
    fontSize: 13,
    color: BrandColors.grey,
    marginBottom: 2,
  },
  programName: {
    fontSize: 15,
    fontWeight: '700',
    color: BrandColors.navy,
  },
  categoryBadge: {
    backgroundColor: '#EBF4FE',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2980B9',
  },
  purpose: {
    fontSize: 13,
    color: BrandColors.grey,
    lineHeight: 18,
    marginBottom: Spacing.two,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  locationIcon: {
    marginRight: 6,
  },
  locationText: {
    fontSize: 12,
    color: BrandColors.grey,
    flex: 1,
  },
  registrationLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: Spacing.two,
  },
  registrationOpen: {
    color: BrandColors.green,
  },
  registrationPending: {
    color: BrandColors.yellow,
  },
  registrationClosed: {
    color: BrandColors.grey,
  },
  applyButton: {
    alignSelf: 'flex-start',
    backgroundColor: BrandColors.green,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  applyButtonDisabled: {
    backgroundColor: BrandColors.lightGray,
  },
  applyButtonLabel: {
    color: 'white',
    fontSize: 13,
    fontWeight: '700',
  },
  statusIcon: {
    marginRight: 6,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: BrandColors.lightGray,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  statusPillLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: BrandColors.navy,
  },
  approvedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#EAF8EE',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  approvedPillLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#27AE60',
  },
  ineligiblePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FBEAEA',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  ineligiblePillLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#C0392B',
  },
  closedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: BrandColors.lightGray,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  closedPillLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: BrandColors.grey,
  },
});

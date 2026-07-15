import { FontAwesome } from '@expo/vector-icons';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { OrganizationProgram } from '@/types/organization';

type OrganizationProgramCardProps = {
  program: OrganizationProgram;
  disabled: boolean;
  onApply: (program: OrganizationProgram) => void;
};

const registrationLabelStyle = (status: OrganizationProgram['registrationStatus']) => {
  if (status === 'Open') return styles.registrationOpen;
  if (status === 'Not Yet Open') return styles.registrationPending;
  return styles.registrationClosed;
};

export function OrganizationProgramCard({ program, disabled, onApply }: OrganizationProgramCardProps) {
  const showRegistrationWindow = program.registrationOpen !== null || program.registrationClose !== null;
  const isApplyDisabled = disabled || !program.canApply;
  const isLocationBlocked = !program.isEligibleByLocation;

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
      </View>

      {program.purpose ? <ThemedText style={styles.purpose}>{program.purpose}</ThemedText> : null}

      {showRegistrationWindow && (
        <ThemedText style={[styles.registrationLabel, registrationLabelStyle(program.registrationStatus)]}>
          Registration: {program.registrationStatus}
        </ThemedText>
      )}

      {program.existingEnrollmentStatus ? (
        <View style={styles.statusPill}>
          <ThemedText style={styles.statusPillLabel}>
            Application {program.existingEnrollmentStatus}
          </ThemedText>
        </View>
      ) : isLocationBlocked ? (
        <View style={styles.ineligiblePill}>
          <ThemedText style={styles.ineligiblePillLabel}>
            Not available in your area
            {program.eligibleBarangayNames.length > 0
              ? ` (limited to ${program.eligibleBarangayNames.join(', ')})`
              : ''}
          </ThemedText>
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
  purpose: {
    fontSize: 13,
    color: BrandColors.grey,
    lineHeight: 18,
    marginBottom: Spacing.two,
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
  statusPill: {
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
  ineligiblePill: {
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
});

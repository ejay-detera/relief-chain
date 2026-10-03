import { FontAwesome } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { fetchEnrollmentResponses } from '@/services/program-requirements-service';
import { EnrollmentRequirementResponse } from '@/types/program-requirement';

interface Props {
  enrollmentId: string;
}

const STATUS_CONFIG: Record<
  EnrollmentRequirementResponse['status'],
  { label: string; bg: string; text: string; icon: keyof typeof FontAwesome.glyphMap }
> = {
  submitted: { label: 'Awaiting Review', bg: '#FFF8E1', text: '#B45309', icon: 'clock-o' },
  verified: { label: 'Verified', bg: '#E8F5E9', text: BrandColors.green, icon: 'check-circle' },
  rejected: { label: 'Rejected', bg: '#FFEBEE', text: '#D32F2F', icon: 'times-circle' },
};

/**
 * Read-only per-requirement status list for the beneficiary's own
 * application. Previously a beneficiary could see the overall application
 * status only — no visibility into which specific custom requirement
 * (if any) was verified or rejected individually.
 */
export function RequirementStatusList({ enrollmentId }: Props) {
  const [responses, setResponses] = useState<EnrollmentRequirementResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    Promise.resolve().then(() => {
      if (isMounted) setIsLoading(true);
    });
    fetchEnrollmentResponses(enrollmentId)
      .then((data) => {
        if (isMounted) setResponses(data);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [enrollmentId]);

  if (isLoading) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator color={BrandColors.navy} size="small" />
      </View>
    );
  }

  if (responses.length === 0) return null;

  return (
    <View style={styles.container}>
      <ThemedText style={styles.sectionTitle}>Your Submitted Requirements</ThemedText>
      {responses.map((response) => {
        const config = STATUS_CONFIG[response.status];
        return (
          <View key={response.id} style={styles.row}>
            <View style={styles.rowMain}>
              <ThemedText style={styles.label} numberOfLines={2}>
                {response.requirement?.label ?? 'Requirement'}
              </ThemedText>
              {response.status === 'rejected' && response.reviewerNotes && (
                <ThemedText style={styles.notes}>{response.reviewerNotes}</ThemedText>
              )}
            </View>
            <View style={[styles.badge, { backgroundColor: config.bg }]}>
              <FontAwesome color={config.text} name={config.icon} size={11} />
              <ThemedText style={[styles.badgeText, { color: config.text }]}>{config.label}</ThemedText>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    marginBottom: Spacing.four,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  },
  loadingRow: {
    paddingVertical: Spacing.four,
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: BrandColors.navy,
    marginBottom: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F3',
  },
  rowMain: {
    flex: 1,
    marginRight: Spacing.two,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: BrandColors.navy,
  },
  notes: {
    fontSize: 12,
    color: '#D32F2F',
    marginTop: 2,
    fontStyle: 'italic',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
});

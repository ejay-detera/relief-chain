import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { AppealStatus } from '@/types/appeal';

interface Props {
  status: AppealStatus;
}

const STATUS_CONFIG: Record<
  AppealStatus,
  { label: string; bg: string; text: string }
> = {
  pending: {
    label: 'Submitted',
    bg: '#FEF3C7',
    text: '#B45309',
  },
  under_review: {
    label: 'Under Review',
    bg: '#EBF4FF',
    text: '#2563EB',
  },
  approved: {
    label: 'Approved',
    bg: '#DCFCE7',
    text: '#16A34A',
  },
  rejected: {
    label: 'Rejected',
    bg: '#FEE2E2',
    text: '#DC2626',
  },
};

export function AppealStatusBadge({ status }: Props) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;

  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <ThemedText style={[styles.text, { color: config.text }]}>
        {config.label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
  },
});

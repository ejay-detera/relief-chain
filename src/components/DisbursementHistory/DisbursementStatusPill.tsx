import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors } from '@/constants/theme';
import type { DistributionJobStatus } from '@/types/distribution';

type Props = {
  status: DistributionJobStatus;
};

const LABEL: Record<DistributionJobStatus, string> = {
  draft: 'Draft',
  validating: 'Validating',
  awaiting_approval: 'Awaiting approval',
  queued: 'Queued',
  submitting: 'Submitting',
  reconciling: 'Confirming on-chain',
  completed: 'Completed',
  partial_failed: 'Needs review',
  cancelled: 'Cancelled',
};

const toneFor = (status: DistributionJobStatus): { background: string; text: string } => {
  if (status === 'completed') return { background: '#E7F6E0', text: BrandColors.navy };
  if (status === 'partial_failed') return { background: '#FBF3C5', text: BrandColors.navy };
  if (status === 'cancelled') return { background: BrandColors.lightGray, text: BrandColors.grey };
  return { background: '#E4EBF7', text: BrandColors.navy };
};

export const DisbursementStatusPill = ({ status }: Props) => {
  const tone = toneFor(status);
  return (
    <View accessibilityRole="text" style={[styles.pill, { backgroundColor: tone.background }]}>
      <ThemedText style={[styles.label, { color: tone.text }]}>{LABEL[status]}</ThemedText>
    </View>
  );
};

const styles = StyleSheet.create({
  pill: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
  },
});

import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { RefundStatus } from '@/types/refund';

type Props = { status: RefundStatus };

const LABELS: Record<RefundStatus, string> = {
  requested: 'Requested',
  approved: 'Approved',
  signed: 'Signed',
  submitted: 'Submitted',
  confirmed: 'Confirmed',
  failed: 'Failed',
  exception_required: 'Exception review',
};

const TONES: Record<RefundStatus, { background: string; text: string }> = {
  requested: { background: BrandColors.lightGray, text: BrandColors.navy },
  approved: { background: BrandColors.lightGray, text: BrandColors.navy },
  signed: { background: '#FBF4C9', text: '#7A6C00' },
  submitted: { background: '#FBF4C9', text: '#7A6C00' },
  confirmed: { background: '#E4F5DA', text: '#2F6B18' },
  failed: { background: '#FBEAEA', text: '#C0392B' },
  exception_required: { background: '#FBEFE0', text: '#9A5B00' },
};

/** Renders the refund workflow state, including the audited exception route (Req 15.5). */
export const RefundStatusPill = ({ status }: Props) => {
  const tone = TONES[status];
  return (
    <View style={[styles.pill, { backgroundColor: tone.background }]}>
      <ThemedText style={[styles.label, { color: tone.text }]}>{LABELS[status]}</ThemedText>
    </View>
  );
};

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
  label: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 10 },
});

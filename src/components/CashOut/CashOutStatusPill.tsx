import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { CashOutStatus } from '@/types/cashout';

type Props = { status: CashOutStatus };

const LABELS: Record<CashOutStatus, string> = {
  requested: 'Requested',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
};

const TONES: Record<CashOutStatus, { background: string; text: string }> = {
  requested: { background: BrandColors.lightGray, text: BrandColors.navy },
  processing: { background: '#FBF4C9', text: '#7A6C00' },
  completed: { background: '#E4F5DA', text: '#2F6B18' },
  failed: { background: '#FBEAEA', text: '#C0392B' },
};

/** Renders the independent simulated cash-out lifecycle state (Requirement 12.6). */
export const CashOutStatusPill = ({ status }: Props) => {
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

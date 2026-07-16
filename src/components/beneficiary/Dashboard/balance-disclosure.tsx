import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PILOT_NETWORK_LABEL, PILOT_NO_VALUE_LABEL } from '@/constants/pilot-disclosure';
import { BorderRadius, Spacing } from '@/constants/theme';

/** Non-optional pilot disclosure shown alongside every RCPHP balance surface. */
export function BalanceDisclosure() {
  return (
    <View style={styles.row}>
      <View style={styles.chip}>
        <ThemedText style={styles.chipText}>{PILOT_NETWORK_LABEL}</ThemedText>
      </View>
      <View style={styles.chip}>
        <ThemedText style={styles.chipText}>{PILOT_NO_VALUE_LABEL}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: Spacing.two,
    rowGap: Spacing.one,
    marginTop: Spacing.two,
  },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
  },
  chipText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});

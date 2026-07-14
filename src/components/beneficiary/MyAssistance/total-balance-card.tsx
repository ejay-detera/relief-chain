import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';

type Props = {
  totalBalance: string; // pre-formatted, e.g. "₱10,000.00"
  activeProgramCount: number;
};

export function TotalBalanceCard({ totalBalance, activeProgramCount }: Props) {
  return (
    <LinearGradient
      colors={[BrandColors.green, '#4A90D9']}
      style={styles.card}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <ThemedText style={styles.title}>Total Available Balance</ThemedText>
      <ThemedText style={styles.balance}>{totalBalance}</ThemedText>
      <View style={styles.subtitleRow}>
        <ThemedText style={styles.subtitle}>Across {activeProgramCount} active program{activeProgramCount === 1 ? '' : 's'}</ThemedText>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.four,
  },
  title: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    marginBottom: Spacing.two,
  },
  balance: {
    color: 'white',
    fontSize: 30,
    fontWeight: 'bold',
    marginBottom: Spacing.one,
  },
  subtitleRow: {
    flexDirection: 'row',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
  },
});

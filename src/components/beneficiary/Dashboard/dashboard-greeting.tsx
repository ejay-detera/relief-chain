import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing } from '@/constants/theme';

type Props = {
  name: string | null;
};

export function DashboardGreeting({ name }: Props) {
  return (
    <ThemedText style={styles.greeting}>Welcome Back, {name || 'there'}!</ThemedText>
  );
}

const styles = StyleSheet.create({
  greeting: {
    fontSize: 16,
    fontWeight: '700',
    color: BrandColors.navy,
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.three,
  },
});

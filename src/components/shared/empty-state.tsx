import { FontAwesome } from '@expo/vector-icons';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';

type EmptyStateProps = {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <FontAwesome color={BrandColors.navy} name="inbox" size={22} />
      </View>
      <ThemedText style={styles.title}>{title}</ThemedText>
      <ThemedText style={styles.description}>{description}</ThemedText>
      {actionLabel && onAction ? (
        <TouchableOpacity accessibilityRole="button" onPress={onAction} style={styles.action}>
          <ThemedText style={styles.actionLabel}>{actionLabel}</ThemedText>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.five,
  },
  iconCircle: {
    alignItems: 'center',
    backgroundColor: BrandColors.lightGray,
    borderRadius: 999,
    height: 56,
    justifyContent: 'center',
    marginBottom: Spacing.three,
    width: 56,
  },
  title: {
    color: BrandColors.navy,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: Spacing.one,
    textAlign: 'center',
  },
  description: {
    color: BrandColors.grey,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: Spacing.three,
    textAlign: 'center',
  },
  action: {
    backgroundColor: BrandColors.green,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  actionLabel: {
    color: 'white',
    fontSize: 13,
    fontWeight: '700',
  },
});

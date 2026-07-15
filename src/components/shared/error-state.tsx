import { FontAwesome } from '@expo/vector-icons';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, Spacing } from '@/constants/theme';

const ERROR_TINT = '#C0392B';
const ERROR_TINT_BACKGROUND = '#FBEAEA';

type ErrorStateProps = {
  message: string;
  onRetry: () => void;
};

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <FontAwesome color={ERROR_TINT} name="exclamation-triangle" size={20} />
      </View>
      <ThemedText style={styles.message}>{message}</ThemedText>
      <TouchableOpacity accessibilityRole="button" onPress={onRetry} style={styles.action}>
        <ThemedText style={styles.actionLabel}>Retry</ThemedText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: ERROR_TINT_BACKGROUND,
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.five,
  },
  iconCircle: {
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 999,
    height: 56,
    justifyContent: 'center',
    marginBottom: Spacing.three,
    width: 56,
  },
  message: {
    color: ERROR_TINT,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: Spacing.three,
    textAlign: 'center',
  },
  action: {
    backgroundColor: ERROR_TINT,
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

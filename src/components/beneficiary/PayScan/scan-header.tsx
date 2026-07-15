import { FontAwesome } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

type Props = {
  onBack: () => void;
  onFlipCamera: () => void;
  showFlipButton?: boolean;
};

export function ScanHeader({ onBack, onFlipCamera, showFlipButton = true }: Props) {
  return (
    <View style={styles.header}>
      <Pressable accessibilityLabel="Go back" onPress={onBack} style={styles.backButton}>
        <FontAwesome color="white" name="arrow-left" size={16} />
        <ThemedText style={styles.backText}>Back</ThemedText>
      </Pressable>
      {showFlipButton && (
        <Pressable accessibilityLabel="Flip camera" onPress={onFlipCamera} style={styles.flipButton}>
          <FontAwesome color="white" name="refresh" size={18} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
  },
  backText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  flipButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

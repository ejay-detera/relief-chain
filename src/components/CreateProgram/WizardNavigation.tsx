import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { BrandColors, BorderRadius, Spacing } from '@/constants/theme';

interface WizardNavigationProps {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  disableNext?: boolean;
}

export function WizardNavigation({ onBack, onNext, nextLabel = 'Next Step', disableNext = false }: WizardNavigationProps) {
  return (
    <View style={styles.container}>
      {onBack ? (
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.spacer} />
      )}

      <TouchableOpacity
        style={[styles.nextButton, disableNext && styles.disabledNextButton]}
        onPress={onNext}
        disabled={disableNext}>
        <Text style={styles.nextText}>{nextLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: BrandColors.lightGray,
    // Add safe area support for bottom tabs if needed
    paddingBottom: Spacing.four,
  },
  spacer: {
    flex: 1,
  },
  backButton: {
    flex: 1,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.two,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: BrandColors.grey,
    backgroundColor: '#FFFFFF',
  },
  backText: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
  },
  nextButton: {
    flex: 1,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    backgroundColor: BrandColors.green,
  },
  disabledNextButton: {
    backgroundColor: BrandColors.grey,
    opacity: 0.5,
  },
  nextText: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#FFFFFF',
  },
});

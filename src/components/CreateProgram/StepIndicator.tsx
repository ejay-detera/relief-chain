import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { BrandColors, BorderRadius, Spacing } from '@/constants/theme';

interface StepIndicatorProps {
  currentStep: number;
  totalSteps?: number;
  title: string;
}

export function StepIndicator({ currentStep, totalSteps = 7, title }: StepIndicatorProps) {
  const progressPercentage = (currentStep / totalSteps) * 100;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.stepText}>
          Step {currentStep} of {totalSteps}
        </Text>
        <Text style={styles.titleText}>{title}</Text>
      </View>
      <View style={styles.progressBarBg}>
        <View style={[styles.progressBarFill, { width: `${progressPercentage}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.two,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: BrandColors.lightGray,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: Spacing.two,
  },
  stepText: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.green,
    textTransform: 'uppercase',
  },
  titleText: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: BrandColors.lightGray,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: BrandColors.green,
    borderRadius: BorderRadius.full,
  },
});

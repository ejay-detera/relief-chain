import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BrandColors, Spacing, BottomTabInset, MaxContentWidth } from '@/constants/theme';

import { LogoHeader } from '@/components/LogoHeader/LogoHeader';
import { BudgetCard } from '@/components/Dashboard/BudgetCard';
import { QuickActionGrid } from '@/components/Dashboard/QuickActionGrid';
import { ProgramCard } from '@/components/Dashboard/ProgramCard';
import { ActivityRow } from '@/components/Dashboard/ActivityRow';

import { Program, ActivityItem, QuickAction } from '@/types/dashboard';

export default function HomeDashboard() {
  const [programs] = useState<Program[]>([
    {
      id: '1',
      title: 'Typhoon Recovery Assistance',
      status: 'In progress',
      completion: 65,
      budgetUsed: '₱4.2M',
      budgetTotal: '₱6.5M',
      served: '1,200 Individuals',
      estCompletion: 'Oct. 12,2027',
    },
  ]);

  const [activities] = useState<ActivityItem[]>([
    {
      id: '1',
      userName: 'Juan Dela Cruz',
      action: 'Juan Dela Cruz Verified',
      timestamp: '2 minutes ago',
      avatarVariant: 'person',
    },
    {
      id: '2',
      userName: '',
      action: '₱5,000 Aid Distributed',
      timestamp: '5 minutes ago',
      avatarVariant: 'money',
    },
  ]);

  const actions: QuickAction[] = [
    { id: '1', label: 'Create Program', iconName: 'plus' },
    { id: '2', label: 'Verify Beneficiaries', iconName: 'search' },
    { id: '3', label: 'Distribute Aids', iconName: 'heart' },
    { id: '4', label: 'Reports', iconName: 'file-text' },
  ];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <LogoHeader />

          <View style={styles.welcomeSection}>
            <ThemedText style={styles.welcomeTitle}>Welcome Back, LGU Administrator !</ThemedText>
            <ThemedText style={styles.welcomeSubtitle}>Monitor and manage aid distribution in real-time.</ThemedText>
          </View>

          <BudgetCard />
          <QuickActionGrid actions={actions} />

          <View style={styles.programSection}>
            <ProgramCard program={programs[0]} />
          </View>

          <View style={styles.activitySection}>
            <View style={styles.activityHeader}>
              <ThemedText style={styles.activityTitle}>Recent Activity</ThemedText>
              <ThemedText style={styles.viewAllText}>View All</ThemedText>
            </View>
            {activities.map(activity => (
              <ActivityRow key={activity.id} item={activity} />
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFC', // slightly off-white to let white cards pop
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  scrollContent: {
    paddingBottom: BottomTabInset + Spacing.six, // Extra padding for custom tab bar
  },
  welcomeSection: {
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.two,
  },
  welcomeTitle: {
    fontSize: 16,
    color: BrandColors.navy,
    fontWeight: '700',
    marginBottom: 4,
  },
  welcomeSubtitle: {
    fontSize: 12,
    color: BrandColors.grey,
  },
  programSection: {
    marginBottom: Spacing.three,
  },
  activitySection: {
    marginBottom: Spacing.four,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.three,
  },
  activityTitle: {
    fontSize: 16,
    color: BrandColors.navy,
    fontWeight: '700',
  },
  viewAllText: {
    fontSize: 13,
    color: BrandColors.navy,
    fontWeight: '600',
  },
});

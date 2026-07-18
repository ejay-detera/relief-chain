import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BrandColors, Spacing, BottomTabInset, MaxContentWidth } from '@/constants/theme';

import { LogoHeader } from '@/components/LogoHeader/LogoHeader';
import { BudgetCard } from '@/components/Dashboard/BudgetCard';
import { QuickActionGrid } from '@/components/Dashboard/QuickActionGrid';
import { ProgramCard } from '@/components/Dashboard/ProgramCard';
import { ActivityRow } from '@/components/Dashboard/ActivityRow';

import { useRouter } from 'expo-router';
import { Program, ActivityItem, QuickAction } from '@/types/dashboard';
import { useAuth } from '@/context/AuthContext';

export default function HomeDashboard() {
  const router = useRouter();
  const { session } = useAuth();
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

  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRecentVerifications = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('beneficiary_identities')
        .select('id, verified_at, user_id')
        .eq('verification_status', 'Verified')
        .order('verified_at', { ascending: false })
        .limit(5);

      if (error) throw error;

      const verificationActivities: ActivityItem[] = (data || []).map((p: any) => {
        let timeLabel = 'Recently';
        if (p.verified_at) {
          const diffMs = Date.now() - new Date(p.verified_at).getTime();
          const diffMins = Math.floor(diffMs / 60000);
          const diffHours = Math.floor(diffMins / 60);
          const diffDays = Math.floor(diffHours / 24);

          if (diffMins < 1) timeLabel = 'Just now';
          else if (diffMins < 60) timeLabel = `${diffMins}m ago`;
          else if (diffHours < 24) timeLabel = `${diffHours}h ago`;
          else timeLabel = `${diffDays}d ago`;
        }

        return {
          id: p.id,
          userName: 'Beneficiary',
          action: 'Beneficiary Verified',
          timestamp: timeLabel,
          avatarVariant: 'person',
        };
      });

      if (verificationActivities.length === 0) {
        setActivities([
          {
            id: 'empty',
            userName: '',
            action: 'No verified beneficiaries yet',
            timestamp: '-',
            avatarVariant: 'person',
          }
        ]);
      } else {
        setActivities(verificationActivities);
      }
    } catch (err) {
      console.error('Error fetching activities:', err);
    }
  }, []);

  useEffect(() => {
    if (session) {
      fetchRecentVerifications();
    }
  }, [fetchRecentVerifications, session]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchRecentVerifications();
    setRefreshing(false);
  }, [fetchRecentVerifications]);

  const actions: QuickAction[] = [
    {
      id: '1',
      label: 'Create Program',
      iconName: 'plus',
      onPress: () => router.push('/(lgu)/create-program' as any),
    },
    {
      id: '2',
      label: 'Verify Beneficiaries',
      iconName: 'search',
      onPress: () => router.push('/(lgu)/beneficiaries' as any),
    },
    {
      id: '3',
      label: 'Merchants',
      iconName: 'shopping-bag',
      onPress: () => router.push('/(lgu)/merchants' as any),
    },
    {
      id: '4',
      label: 'Audit Log',
      iconName: 'list-alt',
      onPress: () => router.push('/(lgu)/audit-log' as any),
    },
  ];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[BrandColors.navy]}
              tintColor={BrandColors.navy}
            />
          }
        >
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

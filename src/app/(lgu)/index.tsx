import { supabase } from '@/lib/supabase';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, BrandColors, MaxContentWidth, Spacing } from '@/constants/theme';

import { ActivityRow } from '@/components/Dashboard/ActivityRow';
import { BudgetCard } from '@/components/Dashboard/BudgetCard';
import { ProgramCard } from '@/components/Dashboard/ProgramCard';
import { QuickActionGrid } from '@/components/Dashboard/QuickActionGrid';
import { LogoHeader } from '@/components/LogoHeader/LogoHeader';
import { FadeInView } from '@/components/shared/FadeInView';

import { ActivityItem, Program, QuickAction } from '@/types/dashboard';
import { useRouter } from 'expo-router';

export default function HomeDashboard() {
  const router = useRouter();
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
        .from('profiles')
        .select('id, full_name, created_at')
        .eq('role', 'beneficiary')
        .eq('verification_status', 'Verified')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;

      const verificationActivities: ActivityItem[] = (data || []).map((p) => {
        let timeLabel = 'Recently';
        if (p.created_at) {
          const diffMs = Date.now() - new Date(p.created_at).getTime();
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
          userName: p.full_name || 'Anonymous',
          action: `${p.full_name || 'Anonymous'} Verified`,
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
    fetchRecentVerifications();
  }, [fetchRecentVerifications]);

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
      label: 'Distribute Aids',
      iconName: 'heart',
      onPress: () => router.push('/(lgu)/pay-scan' as any),
    },
    {
      id: '4',
      label: 'Reports',
      iconName: 'file-text',
      onPress: () => router.push('/(lgu)/reports' as any),
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

          <FadeInView delay={0}>
            <View style={styles.welcomeSection}>
              <ThemedText style={styles.welcomeTitle}>Welcome Back, LGU Administrator !</ThemedText>
              <ThemedText style={styles.welcomeSubtitle}>Monitor and manage aid distribution in real-time.</ThemedText>
            </View>
          </FadeInView>

          <FadeInView delay={40}>
            <BudgetCard />
          </FadeInView>

          <FadeInView delay={80}>
            <QuickActionGrid actions={actions} />
          </FadeInView>

          <FadeInView delay={120}>
            <View style={styles.programSection}>
              <ProgramCard program={programs[0]} />
            </View>
          </FadeInView>

          <FadeInView delay={160}>
            <View style={styles.activitySection}>
              <View style={styles.activityHeader}>
                <ThemedText style={styles.activityTitle}>Recent Activity</ThemedText>
                <ThemedText style={styles.viewAllText}>View All</ThemedText>
              </View>
              {activities.map((activity, index) => (
                <FadeInView delay={index * 40} key={activity.id}>
                  <ActivityRow item={activity} />
                </FadeInView>
              ))}
            </View>
          </FadeInView>
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

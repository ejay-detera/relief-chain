import { FontAwesome } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApplicationStatusCard } from '@/components/beneficiary/ApplicationStatus/application-status-card';
import { ApplicationStatusList } from '@/components/beneficiary/ApplicationStatus/application-status-list';
import { ApplicationStatusSkeleton } from '@/components/beneficiary/ApplicationStatus/application-status-skeleton';
import { RequirementStatusList } from '@/components/beneficiary/ApplicationStatus/requirement-status-list';
import { StatusTimeline } from '@/components/beneficiary/ApplicationStatus/status-timeline';
import { LogoHeader } from '@/components/LogoHeader/LogoHeader';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { FadeInView } from '@/components/shared/FadeInView';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, BrandColors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useApplicationStatus } from '@/hooks/use-application-status';
import { ApplicationStatusDetails } from '@/types/application-status';

export default function ApplicationStatusScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ enrollmentId?: string }>();
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<string | undefined>(
    params.enrollmentId
  );

  const { details, history, isLoading, error, refresh } = useApplicationStatus(selectedEnrollmentId);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const handleSelectApplication = (item: ApplicationStatusDetails) => {
    setSelectedEnrollmentId(item.enrollmentId);
  };

  const currentDetails = details ?? (history.length > 0 ? history[0] : null);

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

          {/* Navigation Bar */}
          <View style={styles.navBar}>
            <Pressable
              onPress={() => router.back()}
              style={styles.backButton}
              accessibilityLabel="Go back"
            >
              <FontAwesome name="arrow-left" size={16} color={BrandColors.navy} />
            </Pressable>
            <ThemedText style={styles.screenTitle}>Application Status</ThemedText>
            <View style={styles.placeholder} />
          </View>

          {isLoading && !refreshing && <ApplicationStatusSkeleton />}

          {!isLoading && error && (
            <ErrorState message="Could not load application status." onRetry={refresh} />
          )}

          {!isLoading && !error && !currentDetails && (
            <FadeInView delay={50}>
              <EmptyState
                title="No Applications"
                description="You don't have any registered applications yet."
                actionLabel="Explore Programs"
                onAction={() => router.push('/(beneficiary)/find-organization')}
              />
            </FadeInView>
          )}

          {!isLoading && !error && currentDetails && (
            <View style={styles.contentContainer}>
              {history.length > 1 && (
                <ApplicationStatusList
                  applications={history}
                  selectedEnrollmentId={currentDetails.enrollmentId}
                  onSelectApplication={handleSelectApplication}
                />
              )}

              <FadeInView delay={50}>
                <ApplicationStatusCard details={currentDetails} />
              </FadeInView>

              <FadeInView delay={100}>
                <StatusTimeline timeline={currentDetails.timeline} />
              </FadeInView>

              <FadeInView delay={150}>
                <RequirementStatusList enrollmentId={currentDetails.enrollmentId} />
              </FadeInView>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFC',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  scrollContent: {
    paddingBottom: BottomTabInset + Spacing.six,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.three,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  screenTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: BrandColors.navy,
  },
  placeholder: {
    width: 36,
  },
  contentContainer: {
    paddingHorizontal: Spacing.four,
  },
});

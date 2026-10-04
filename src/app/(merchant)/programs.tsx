import React, { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { MerchantBottomNavigation } from '@/components/MerchantDashboard/MerchantBottomNavigation';
import { MerchantDashboardHeader } from '@/components/MerchantDashboard/MerchantDashboardHeader';
import { ApplyProgramModal } from '@/components/MerchantPrograms/ApplyProgramModal';
import { AvailableProgramCard } from '@/components/MerchantPrograms/AvailableProgramCard';
import { MerchantProgramCard } from '@/components/MerchantPrograms/MerchantProgramCard';
import { ProgramsSummary } from '@/components/MerchantPrograms/ProgramsSummary';
import { ProgramsTabSelector } from '@/components/MerchantPrograms/ProgramsTabSelector';
import { FadeInView } from '@/components/shared/FadeInView';
import { ThemedText } from '@/components/themed-text';
import { BrandColors, FloatingTabBarGap, FloatingTabBarHeight, Spacing } from '@/constants/theme';
import { useMerchantMetrics } from '@/hooks/use-merchant-metrics';
import { useMerchantPrograms } from '@/hooks/use-merchant-programs';
import type { AvailableAidProgram } from '@/types/merchant-program';

const MerchantProgramsScreen = () => {
  const insets = useSafeAreaInsets();
  const { metrics } = useMerchantMetrics();
  const {
    error,
    isLoading,
    programs,
    availablePrograms,
    refresh,
    applyProgram,
    withdrawApplication,
  } = useMerchantPrograms();

  const [activeTab, setActiveTab] = useState<'accepted' | 'available'>('accepted');
  const [selectedProgramToApply, setSelectedProgramToApply] =
    useState<AvailableAidProgram | null>(null);

  const activeAcceptedCount = programs.filter((p) => p.status === 'active').length;

  const handleApplyPress = (program: AvailableAidProgram) => {
    setSelectedProgramToApply(program);
  };

  const handleApplySubmit = async (programId: string, notes: string) => {
    const res = await applyProgram(programId, notes);
    if (!res.success) {
      throw new Error(res.error || 'Failed to submit application.');
    }
    Alert.alert(
      'Application Submitted',
      'Your application has been submitted to the organization for review. Once approved, you will be accredited to accept vouchers for this program.',
    );
  };

  const handleWithdrawPress = (program: AvailableAidProgram) => {
    Alert.alert(
      'Withdraw Application',
      `Are you sure you want to withdraw your application for "${program.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            const res = await withdrawApplication(program.id);
            if (!res.success) {
              Alert.alert('Error', res.error || 'Failed to withdraw application.');
            }
          },
        },
      ],
    );
  };

  const renderAcceptedList = () => (
    <FlatList
      contentContainerStyle={[
        styles.content,
        {
          paddingBottom:
            insets.bottom + FloatingTabBarGap + FloatingTabBarHeight + Spacing.four,
        },
      ]}
      data={programs}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <FadeInView delay={0}>
          <View style={styles.intro}>
            <ThemedText style={styles.title}>Accepted Relief Programs</ThemedText>
            <ThemedText style={styles.subtitle}>
              Aid programs where your store is accredited to accept and redeem digital vouchers.
            </ThemedText>
            <ProgramsTabSelector
              activeTab={activeTab}
              onTabChange={setActiveTab}
              acceptedCount={programs.length}
              availableCount={availablePrograms.length}
            />
            <ProgramsSummary
              activePrograms={activeAcceptedCount}
              vouchersProcessed={metrics?.vouchersProcessed ?? null}
            />
            {error && programs.length > 0 && (
              <ThemedText style={styles.error}>
                Programs could not be refreshed. Showing the latest available list.
              </ThemedText>
            )}
          </View>
        </FadeInView>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <ThemedText style={styles.emptyTitle}>
            {isLoading
              ? 'Loading programs…'
              : 'No accepted programs yet.\nCheck "Available to Apply" to discover programs and submit an application.'}
          </ThemedText>
          {error && !isLoading && (
            <Pressable
              accessibilityRole="button"
              onPress={() => void refresh()}
              style={styles.retry}
            >
              <ThemedText style={styles.retryText}>Try Again</ThemedText>
            </Pressable>
          )}
        </View>
      }
      renderItem={({ item, index }) => (
        <FadeInView delay={Math.min(index, 4) * 40}>
          <MerchantProgramCard program={item} />
        </FadeInView>
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      refreshing={isLoading && programs.length > 0}
      onRefresh={() => void refresh()}
      showsVerticalScrollIndicator={false}
    />
  );

  const renderAvailableList = () => (
    <FlatList
      contentContainerStyle={[
        styles.content,
        {
          paddingBottom:
            insets.bottom + FloatingTabBarGap + FloatingTabBarHeight + Spacing.four,
        },
      ]}
      data={availablePrograms}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <FadeInView delay={0}>
          <View style={styles.intro}>
            <ThemedText style={styles.title}>Open Aid Programs</ThemedText>
            <ThemedText style={styles.subtitle}>
              Browse programs created by organizations (including Draft and Active stages) and apply to accept their vouchers.
            </ThemedText>
            <ProgramsTabSelector
              activeTab={activeTab}
              onTabChange={setActiveTab}
              acceptedCount={programs.length}
              availableCount={availablePrograms.length}
            />
            {error && availablePrograms.length > 0 && (
              <ThemedText style={styles.error}>
                Programs could not be refreshed. Showing latest list.
              </ThemedText>
            )}
          </View>
        </FadeInView>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <ThemedText style={styles.emptyTitle}>
            {isLoading
              ? 'Loading available programs…'
              : 'No open programs currently available for merchant applications.'}
          </ThemedText>
          {error && !isLoading && (
            <Pressable
              accessibilityRole="button"
              onPress={() => void refresh()}
              style={styles.retry}
            >
              <ThemedText style={styles.retryText}>Try Again</ThemedText>
            </Pressable>
          )}
        </View>
      }
      renderItem={({ item, index }) => (
        <FadeInView delay={Math.min(index, 4) * 40}>
          <AvailableProgramCard
            program={item}
            onApply={handleApplyPress}
            onWithdraw={handleWithdrawPress}
          />
        </FadeInView>
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      refreshing={isLoading && availablePrograms.length > 0}
      onRefresh={() => void refresh()}
      showsVerticalScrollIndicator={false}
    />
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.screen}>
        <MerchantDashboardHeader onShowQr={() => {}} />

        {activeTab === 'accepted' ? renderAcceptedList() : renderAvailableList()}

        <ApplyProgramModal
          visible={selectedProgramToApply !== null}
          program={selectedProgramToApply}
          onClose={() => setSelectedProgramToApply(null)}
          onSubmit={handleApplySubmit}
        />

        <MerchantBottomNavigation active="programs" />
      </View>
    </SafeAreaView>
  );
};

export default MerchantProgramsScreen;

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#FFFFFF',
    flex: 1,
  },
  screen: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    padding: Spacing.three,
  },
  intro: {
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  title: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 18,
  },
  subtitle: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 11,
    lineHeight: 16,
  },
  error: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 10,
  },
  empty: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 180,
    paddingHorizontal: Spacing.four,
  },
  emptyTitle: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  retry: {
    backgroundColor: BrandColors.navy,
    borderRadius: 18,
    marginTop: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  retryText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
  },
  separator: {
    height: Spacing.three,
  },
});

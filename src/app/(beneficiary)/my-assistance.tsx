import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LogoHeader } from '@/components/LogoHeader/LogoHeader';
import { ProgramVoucherCard } from '@/components/beneficiary/MyAssistance/program-voucher-card';
import { TotalBalanceCard } from '@/components/beneficiary/MyAssistance/total-balance-card';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, BrandColors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useBeneficiaryPrograms } from '@/hooks/use-beneficiary-programs';

export default function MyAssistanceScreen() {
  const router = useRouter();
  const { programs, isLoading, error, refetch } = useBeneficiaryPrograms();

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch])
  );

  const totalBalance = error
    ? 0
    : programs.reduce((acc, curr) => {
        const num = parseFloat(curr.voucherBalance.replace(/[^0-9.]/g, ''));
        return acc + (isNaN(num) ? 0 : num);
      }, 0);
  const totalBalanceLabel = `₱${totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const hasNoAssistance = !isLoading && !error && programs.length === 0;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <LogoHeader />

          <ThemedText style={styles.title}>My Assistance</ThemedText>
          <ThemedText style={styles.subtitle}>
            Manage your active relief programs and redeem your available vouchers at authorized partner centers.
          </ThemedText>

          {isLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={BrandColors.navy} size="large" />
            </View>
          )}

          {!isLoading && error && (
            <ErrorState message="We couldn't load your assistance data." onRetry={refetch} />
          )}

          {hasNoAssistance && (
            <EmptyState
              actionLabel="Find Organizations"
              description="You don't have any assistance yet. Apply to a program to get started."
              onAction={() => router.push('/(beneficiary)/find-organization')}
              title="No Assistance Yet"
            />
          )}

          {!isLoading && !error && programs.length > 0 && (
            <>
              <TotalBalanceCard activeProgramCount={programs.length} totalBalance={totalBalanceLabel} />

              {programs.map((program) => (
                <ProgramVoucherCard key={program.id} program={program} />
              ))}
            </>
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
  loadingContainer: {
    paddingVertical: Spacing.six,
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: BrandColors.navy,
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.one,
  },
  subtitle: {
    fontSize: 13,
    color: BrandColors.grey,
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.four,
    lineHeight: 18,
  },
});

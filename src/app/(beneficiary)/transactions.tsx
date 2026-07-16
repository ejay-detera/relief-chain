import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TransactionRow } from '@/components/beneficiary/Transactions/transaction-row';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, BrandColors, Spacing } from '@/constants/theme';
import { useBeneficiaryRedemptions } from '@/hooks/use-beneficiary-redemptions';

export default function TransactionsScreen() {
  const router = useRouter();
  const { redemptions, isLoading, error, refresh } = useBeneficiaryRedemptions();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backButton}>
            <FontAwesome color={BrandColors.navy} name="arrow-left" size={18} />
          </Pressable>
          <ThemedText style={styles.title}>Transaction History</ThemedText>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {isLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={BrandColors.navy} size="large" />
            </View>
          )}

          {!isLoading && error && (
            <ErrorState message="We couldn't load your transactions." onRetry={refresh} />
          )}

          {!isLoading && !error && redemptions.length === 0 && (
            <EmptyState
              description="Your confirmed transactions will appear here once you receive or spend assistance."
              title="No Transactions Yet"
            />
          )}

          {!isLoading && !error && redemptions.map(record => (
            <TransactionRow key={record.id} record={record} />
          ))}
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.six,
    paddingBottom: Spacing.four,
  },
  backButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: BrandColors.navy,
  },
  scrollContent: {
    paddingBottom: BottomTabInset + Spacing.six,
  },
  loadingContainer: {
    paddingVertical: Spacing.six,
    alignItems: 'center',
  },
});

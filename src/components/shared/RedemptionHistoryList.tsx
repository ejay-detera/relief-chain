import { FlatList, StyleSheet, View, ActivityIndicator } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { BrandColors, BorderRadius, Spacing } from '@/constants/theme';
import type { MerchantPaymentRecord } from '@/services/merchantPaymentHistoryService';

type Props = {
  payments: MerchantPaymentRecord[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  contentContainerStyle?: any;
};

export const RedemptionHistoryList = ({ payments, isLoading, error, onRefresh, contentContainerStyle }: Props) => {
  if (isLoading && payments.length === 0) {
    return (
      <View style={{ padding: Spacing.six, alignItems: 'center' }}>
        <ActivityIndicator color={BrandColors.navy} size="large" />
      </View>
    );
  }

  if (error && payments.length === 0) {
    return <ErrorState message={error} onRetry={onRefresh} />;
  }

  return (
    <FlatList
      data={payments}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.left}>
            <ThemedText style={styles.name} numberOfLines={1}>{item.beneficiaryName}</ThemedText>
            <ThemedText style={styles.date}>{item.date}</ThemedText>
            <ThemedText style={styles.hash}>{item.txHash}</ThemedText>
          </View>
          <View style={styles.right}>
            <ThemedText style={styles.amount}>+{item.amountFormatted}</ThemedText>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: item.status === 'Completed' ? BrandColors.green : item.status === 'Failed' ? '#E74C3C' : BrandColors.yellow }]} />
              <ThemedText style={styles.statusText}>{item.status}</ThemedText>
            </View>
          </View>
        </View>
      )}
      refreshing={isLoading}
      onRefresh={onRefresh}
      ListEmptyComponent={<EmptyState title="No Redemptions" description="Your completed transactions will appear here." />}
      contentContainerStyle={contentContainerStyle}
    />
  );
};

const styles = StyleSheet.create({
  card: { flexDirection: 'row', backgroundColor: '#FFF', padding: Spacing.three, marginHorizontal: Spacing.three, marginBottom: Spacing.two, borderRadius: BorderRadius.md, borderWidth: 0.5, borderColor: 'rgba(151,151,151,0.35)' },
  left: { flex: 1, gap: 2 },
  name: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: BrandColors.navy },
  date: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: BrandColors.grey },
  hash: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 10, color: '#999' },
  right: { alignItems: 'flex-end', justifyContent: 'center' },
  amount: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, color: BrandColors.green, marginBottom: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 11, color: BrandColors.grey },
});

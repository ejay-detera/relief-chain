import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { MerchantPayment } from '@/types/merchant-dashboard';

type RecentPaymentsProps = {
  onViewAll: () => void;
  payments: MerchantPayment[];
};

const formatAmount = (amount: number) =>
  `+ ₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

export const RecentPayments = ({ onViewAll, payments }: RecentPaymentsProps) => (
  <View style={styles.container}>
    <View style={styles.heading}>
      <ThemedText style={styles.title}>Recent Payments</ThemedText>
      <Pressable accessibilityLabel="View all past transactions" accessibilityRole="button" onPress={onViewAll}>
        <ThemedText style={styles.viewAll}>View All</ThemedText>
      </Pressable>
    </View>
    <FlatList
      data={payments}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <ThemedText style={styles.emptyText}>No confirmed payments yet</ThemedText>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable accessibilityRole="button" onPress={onViewAll} style={styles.row}>
          <View style={styles.detail}>
            <ThemedText numberOfLines={1} style={styles.name}>{item.payerName}</ThemedText>
            <ThemedText style={styles.date}>{item.occurredAt}</ThemedText>
          </View>
          <ThemedText style={styles.amount}>{formatAmount(item.amount)}</ThemedText>
        </Pressable>
      )}
      scrollEnabled={false}
    />
  </View>
);

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  heading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.three,
  },
  title: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
  },
  viewAll: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
  },
  row: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(151,151,151,0.25)',
    borderRadius: BorderRadius.md,
    borderWidth: 0.5,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  detail: {
    flex: 1,
    marginRight: Spacing.two,
  },
  name: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
  },
  date: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 10,
    marginTop: 2,
  },
  amount: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
  },
  separator: {
    height: Spacing.two,
  },
  emptyContainer: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(151,151,151,0.2)',
    borderRadius: BorderRadius.md,
    borderWidth: 0.5,
    justifyContent: 'center',
    paddingVertical: Spacing.four,
  },
  emptyText: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
  },
});

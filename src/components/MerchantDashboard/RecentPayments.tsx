import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { MerchantPaymentRecord } from '@/services/merchantPaymentHistoryService';

type RecentPaymentsProps = { onViewAll: () => void; payments: MerchantPaymentRecord[] };

export const RecentPayments = ({ onViewAll, payments }: RecentPaymentsProps) => (
  <View>
    <View style={styles.heading}><ThemedText style={styles.title}>Recent Payments</ThemedText><Pressable accessibilityRole="button" onPress={onViewAll}><ThemedText style={styles.viewAll}>View All</ThemedText></Pressable></View>
    <FlatList
      data={payments}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={styles.avatar} />
          <View style={styles.detail}>
            <ThemedText numberOfLines={1} style={styles.name}>{item.beneficiaryName}</ThemedText>
            <ThemedText style={styles.date}>{item.date}</ThemedText>
          </View>
          <View style={styles.right}>
            <ThemedText style={styles.amount}>+{item.amountFormatted}</ThemedText>
            <ThemedText style={[styles.date, { color: item.status === 'Completed' ? BrandColors.green : item.status === 'Failed' ? '#E74C3C' : BrandColors.grey }]}>
              {item.status}
            </ThemedText>
          </View>
        </View>
      )}
      scrollEnabled={false}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
    />
  </View>
);

const styles = StyleSheet.create({
  heading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.three },
  title: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13 },
  viewAll: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 10 },
  row: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: 'rgba(151,151,151,0.35)', borderRadius: BorderRadius.md, borderWidth: 0.5, flexDirection: 'row', minHeight: 54, paddingHorizontal: Spacing.two },
  avatar: { backgroundColor: '#91A1B7', borderRadius: BorderRadius.full, height: 36, width: 36 },
  detail: { flex: 1, marginHorizontal: Spacing.two },
  name: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 10 },
  date: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 8, marginTop: 1 },
  right: { alignItems: 'flex-end', justifyContent: 'center' },
  amount: { color: BrandColors.green, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 10 },
  separator: { height: Spacing.three },
});

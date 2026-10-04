import React from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FadeInView } from '@/components/shared/FadeInView';
import { ThemedText } from '@/components/themed-text';
import {
  BrandColors,
  FloatingTabBarGap,
  FloatingTabBarHeight,
  Spacing,
} from '@/constants/theme';
import type { AccreditedMerchant } from '@/types/merchant-management';
import { MerchantCard } from './MerchantCard';

type Props = {
  data: AccreditedMerchant[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onSelect: (merchant: AccreditedMerchant) => void;
};

export const MerchantList = ({
  data,
  loading,
  refreshing,
  onRefresh,
  onSelect,
}: Props) => {
  const insets = useSafeAreaInsets();

  if (loading && data.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={BrandColors.navy} />
      </View>
    );
  }

  const bottomInset =
    insets.bottom + FloatingTabBarHeight + FloatingTabBarGap + Spacing.four;

  const renderItem = ({
    item,
    index,
  }: {
    item: AccreditedMerchant;
    index: number;
  }) => (
    <FadeInView delay={Math.min(index, 4) * 40}>
      <MerchantCard merchant={item} onPress={() => onSelect(item)} />
    </FadeInView>
  );

  return (
    <FlatList
      data={data}
      renderItem={renderItem}
      keyExtractor={(item) => item.accreditation_id}
      contentContainerStyle={[
        styles.listContainer,
        { paddingBottom: bottomInset },
      ]}
      refreshing={refreshing}
      onRefresh={onRefresh}
      ListEmptyComponent={
        <View style={styles.centerContainer}>
          <FontAwesome
            name="shopping-bag"
            size={44}
            color={BrandColors.lightGray}
            style={styles.emptyIcon}
          />
          <ThemedText style={styles.emptyTitle}>
            No accredited merchants found
          </ThemedText>
          <ThemedText style={styles.emptySubtitle}>
            Tap &apos;+ Add&apos; above to search registered merchants and accredit them for
            your relief programs.
          </ThemedText>
        </View>
      }
    />
  );
};

const styles = StyleSheet.create({
  listContainer: {
    padding: Spacing.four,
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.six,
    paddingHorizontal: Spacing.four,
  },
  emptyIcon: {
    marginBottom: Spacing.three,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: BrandColors.navy,
    marginBottom: 4,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: BrandColors.grey,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
  },
});

import React from 'react';
import { View } from 'react-native';

import { FadeInView } from '@/components/shared/FadeInView';
import type {
  AccreditationFilterStatus,
  AccreditedMerchant,
} from '@/types/merchant-management';
import { MerchantList } from './MerchantList';
import { MerchantSearchBar } from './MerchantSearchBar';
import { MerchantStatusFilterTabs } from './MerchantStatusFilterTabs';

type Props = {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onPressAdd: () => void;
  selectedStatus: AccreditationFilterStatus;
  onStatusChange: (status: AccreditationFilterStatus) => void;
  data: AccreditedMerchant[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onSelect: (merchant: AccreditedMerchant) => void;
};

export const MerchantManagementView = ({
  searchQuery,
  onSearchChange,
  onPressAdd,
  selectedStatus,
  onStatusChange,
  data,
  loading,
  refreshing,
  onRefresh,
  onSelect,
}: Props) => {
  return (
    <View style={{ flex: 1 }}>
      {/* Search Bar + Add Button */}
      <FadeInView delay={20}>
        <MerchantSearchBar
          value={searchQuery}
          onChangeText={onSearchChange}
          onPressAdd={onPressAdd}
        />
      </FadeInView>

      {/* Status Filter Tabs */}
      <FadeInView delay={40}>
        <MerchantStatusFilterTabs
          selected={selectedStatus}
          onSelect={onStatusChange}
        />
      </FadeInView>

      {/* Merchant Cards List */}
      <MerchantList
        data={data}
        loading={loading}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onSelect={onSelect}
      />
    </View>
  );
};

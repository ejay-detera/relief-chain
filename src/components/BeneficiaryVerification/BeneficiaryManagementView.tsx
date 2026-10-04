import React from 'react';
import { View } from 'react-native';

import { DuplicateFlagsPanel } from '@/components/BeneficiaryVerification/DuplicateFlagsPanel';
import { BeneficiaryList } from '@/components/BeneficiaryVerification/BeneficiaryList';
import {
  FilterStatus,
  StatusFilterTabs,
} from '@/components/BeneficiaryVerification/StatusFilterTabs';
import { VerificationSearch } from '@/components/BeneficiaryVerification/VerificationSearch';
import { FadeInView } from '@/components/shared/FadeInView';
import type { UserProfile } from '@/types/auth';

type Props = {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedStatus: FilterStatus;
  onStatusChange: (status: FilterStatus) => void;
  data: UserProfile[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onSelect: (beneficiary: UserProfile) => void;
};

export const BeneficiaryManagementView = ({
  searchQuery,
  onSearchChange,
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
      {/* Duplicate registration flags (BEN-01) */}
      <FadeInView delay={20}>
        <DuplicateFlagsPanel />
      </FadeInView>

      {/* Search */}
      <FadeInView delay={40}>
        <VerificationSearch value={searchQuery} onChangeText={onSearchChange} />
      </FadeInView>

      {/* Status Filter Dropdown */}
      <FadeInView delay={80}>
        <StatusFilterTabs selected={selectedStatus} onSelect={onStatusChange} />
      </FadeInView>

      {/* List */}
      <BeneficiaryList
        data={data}
        loading={loading}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onSelect={onSelect}
      />
    </View>
  );
};

import React from 'react';

import {
  type StatusDropdownOption,
  StatusFilterDropdown,
} from '@/components/shared/StatusFilterDropdown';

export type FilterStatus = 'All' | 'Pending' | 'Verified' | 'Rejected';

const BENEFICIARY_STATUS_OPTIONS: StatusDropdownOption<FilterStatus>[] = [
  {
    label: 'All Statuses',
    value: 'All',
    subtitle: 'Show all beneficiary records',
  },
  {
    label: 'Pending',
    value: 'Pending',
    subtitle: 'Awaiting verification review',
  },
  {
    label: 'Verified',
    value: 'Verified',
    subtitle: 'Identity confirmed and approved',
  },
  {
    label: 'Rejected',
    value: 'Rejected',
    subtitle: 'Verification declined',
  },
];

type Props = {
  selected: FilterStatus;
  onSelect: (status: FilterStatus) => void;
};

export const StatusFilterTabs = ({ selected, onSelect }: Props) => {
  return (
    <StatusFilterDropdown<FilterStatus>
      selected={selected}
      onSelect={onSelect}
      options={BENEFICIARY_STATUS_OPTIONS}
      title="Filter Beneficiaries by Status"
    />
  );
};

export const StatusFilterDropdownMenu = StatusFilterTabs;

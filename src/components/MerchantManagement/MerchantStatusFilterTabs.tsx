import React from 'react';

import {
  type StatusDropdownOption,
  StatusFilterDropdown,
} from '@/components/shared/StatusFilterDropdown';
import type { AccreditationFilterStatus } from '@/types/merchant-management';

export type { AccreditationFilterStatus };

const MERCHANT_STATUS_OPTIONS: StatusDropdownOption<AccreditationFilterStatus>[] = [
  {
    label: 'All Statuses',
    value: 'All',
    subtitle: 'Show all accredited merchants',
  },
  {
    label: 'Active',
    value: 'Active',
    subtitle: 'Currently active partner stores',
  },
  {
    label: 'Pending',
    value: 'Pending',
    subtitle: 'Accreditation pending review',
  },
  {
    label: 'Suspended',
    value: 'Suspended',
    subtitle: 'Temporarily suspended stores',
  },
  {
    label: 'Rejected',
    value: 'Rejected',
    subtitle: 'Accreditation declined',
  },
];

type Props = {
  selected: AccreditationFilterStatus;
  onSelect: (status: AccreditationFilterStatus) => void;
};

export const MerchantStatusFilterTabs = ({ selected, onSelect }: Props) => {
  return (
    <StatusFilterDropdown<AccreditationFilterStatus>
      selected={selected}
      onSelect={onSelect}
      options={MERCHANT_STATUS_OPTIONS}
      title="Filter Merchants by Status"
    />
  );
};

export const MerchantStatusFilterDropdown = MerchantStatusFilterTabs;

export type MerchantAccreditationStatus =
  | 'active'
  | 'suspended'
  | 'pending'
  | 'rejected'
  | 'revoked';

export type AccreditationFilterStatus =
  | 'All'
  | 'Active'
  | 'Pending'
  | 'Suspended'
  | 'Rejected';

export interface AccreditedMerchant {
  accreditation_id: string;
  organization_id: string;
  merchant_id: string;
  display_name: string;
  category: string;
  status: MerchantAccreditationStatus;
  valid_from: string;
  valid_until: string;
  remarks: string | null;
  owner_name: string | null;
  mobile_number: string | null;
  stellar_pubkey: string | null;
  created_at: string;
}

export interface AvailableMerchant {
  merchant_id: string;
  display_name: string;
  owner_name: string | null;
  mobile_number: string | null;
  stellar_pubkey: string | null;
  is_already_accredited: boolean;
}

export interface AddMerchantPayload {
  merchantId: string;
  category: string;
  validUntil?: string;
}

export const ACCREDITATION_CATEGORIES = [
  'Grocery',
  'Pharmacy',
  'Food Aid',
  'General Merchandise',
  'Convenience Store',
] as const;

export type AccreditationCategory = (typeof ACCREDITATION_CATEGORIES)[number];

export type RedemptionDateFilter = 'all' | 'today' | '7days' | '30days';

export interface MerchantRedemptionTransaction {
  id: string;
  merchant_id: string;
  program_id: string | null;
  program_name: string;
  beneficiary_id: string;
  beneficiary_name: string;
  beneficiary_reference?: string;
  category: string;
  amount: number;
  status: 'Completed' | 'Pending' | 'Failed';
  remaining_balance?: number | null;
  tx_hash: string | null;
  redeemed_at: string;
}

export interface MerchantRedemptionSummary {
  totalCount: number;
  totalAmount: number;
}

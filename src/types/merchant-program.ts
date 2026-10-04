export type MerchantProgramStatus = 'active' | 'scheduled' | 'completed';

export type MerchantProgramApplicationStatus =
  | 'none'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'withdrawn';

export type MerchantProgram = {
  id: string;
  name: string;
  purpose: string;
  voucherValue: number;
  voucherTypes: string[];
  voucherExpiration: string | null;
  voucherQuantity: number;
  distributionMethod: string;
  startDate: string | null;
  endDate: string | null;
  distributionStart: string | null;
  distributionEnd: string | null;
  scope: string[];
  isOpenToAllMerchants: boolean;
  status: MerchantProgramStatus;
  createdAt: string | null;
};

export type AvailableAidProgram = {
  id: string;
  name: string;
  purpose: string;
  organizationId: string;
  organizationName: string;
  voucherValue: number;
  voucherTypes: string[];
  voucherExpiration: string | null;
  voucherQuantity: number;
  distributionMethod: string;
  startDate: string | null;
  endDate: string | null;
  distributionStart: string | null;
  distributionEnd: string | null;
  status: 'draft' | 'active' | 'scheduled' | 'funding' | string;
  applicationStatus: MerchantProgramApplicationStatus;
  applicationId: string | null;
  appliedAt: string | null;
  rejectionReason: string | null;
  notes: string | null;
  createdAt: string | null;
};
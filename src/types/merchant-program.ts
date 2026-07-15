export type MerchantProgramStatus = 'active' | 'scheduled' | 'completed';

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
export interface DocumentDraft {
  uri: string;
  name: string;
  size?: number;
}

export interface ProgramDraft {
  name: string;
  description: string;
  disasterType: string;
  disasterTypeId: number | null;
  affectedAreas: string[];
  affectedAreaIds: number[];
  implementingAgency: string;
  implementingAgencyId: number | null;
  fundingSource: string;
  fundingSourceId: number | null;
  totalBudget: number;
  aidPerHousehold: number;
  maxBeneficiaries: number;
  startDate: string;
  endDate: string;
  eligibilityCriteria: string[];
  voucherTypes: string[];
  voucherValue: number;
  voucherQuantity: number;
  voucherExpiration: string;
  redemptionType: 'cash' | 'merchant';
  selectedMerchants: string[];
  distributionMethod: 'automatic' | 'manual' | 'batch';
  walletTypeToggle: boolean;
  autoDistributeToggle: boolean;
  supportingDocuments: DocumentDraft[];
}


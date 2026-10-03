export interface DocumentDraft {
  uri: string;
  name: string;
  size?: number;
}

export interface ProgramRequirementDraft {
  label: string;
  description?: string;
  type: 'document' | 'text' | 'number' | 'boolean';
  isMandatory: boolean;
  allowedFileTypes?: string[];
}

export interface CsvBeneficiaryDraft {
  fullName: string;
  phoneNumber: string;
}

export interface ProgramDraft {
  name: string;
  description: string;
  disasterType: string;
  disasterTypeId: number | null;
  affectedAreas: string[];
  affectedAreaIds: number[];
  affectedBarangays: string[];
  affectedBarangayIds: number[];
  districtId: number | null;
  implementingAgency: string;
  implementingAgencyId: number | null;
  fundingSource: string;
  fundingSourceId: number | null;
  totalBudget: number;
  aidPerHousehold: number;
  maxBeneficiaries: number;
  startDate: string;
  endDate: string;
  registrationOpen: string;
  registrationClose: string;
  distributionStart: string;
  distributionEnd: string;
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
  isPrivate?: boolean;
  requirements?: ProgramRequirementDraft[];
  csvBeneficiaries?: CsvBeneficiaryDraft[];
}


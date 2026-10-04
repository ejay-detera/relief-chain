export type ApplicationStage =
  | 'registered'
  | 'pending_verification'
  | 'verified'
  | 'approved'
  | 'aid_released'
  | 'redeemed'
  | 'completed'
  | 'rejected';

export interface StatusHistoryEntry {
  stage: ApplicationStage;
  label: string;
  description: string;
  timestamp: string | null;
  isCompleted: boolean;
  isCurrent: boolean;
}

export interface ApplicationStatusDetails {
  enrollmentId: string;
  programId: string;
  programName: string;
  organizationName: string;
  currentStage: ApplicationStage;
  currentStageLabel: string;
  approvalStatus: 'Pending' | 'Approved' | 'Rejected';
  rejectionReason: string | null;
  category: string;
  voucherBalance: number;
  timeline: StatusHistoryEntry[];
  createdAt: string;
  updatedAt: string | null;
  accreditedMerchants?: string[];
  redemptionInstructions?: string | null;
  purpose?: string | null;
  expiresAt?: string | null;
  isDeadlineDue?: boolean;
}

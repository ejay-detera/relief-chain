export type AppealStatus = 'pending' | 'under_review' | 'approved' | 'rejected';

export interface BeneficiaryAppeal {
  id: string;
  enrollmentId: string;
  beneficiaryId: string;
  programId: string;
  programName?: string;
  reason: string;
  documentUrls: string[];
  status: AppealStatus;
  reviewerNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAppealInput {
  enrollmentId: string;
  programId: string;
  reason: string;
  documentUrls?: string[];
}

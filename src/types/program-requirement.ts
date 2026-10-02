export type RequirementType = 'document' | 'text' | 'number' | 'boolean';

export interface ProgramRequirement {
  id: string;
  programId: string;
  label: string;
  description?: string | null;
  type: RequirementType;
  isMandatory: boolean;
  allowedFileTypes?: string[];
  createdAt?: string;
}

export interface RequirementResponseInput {
  requirementId: string;
  value?: string;
  fileUrl?: string;
}

export type RequirementResponseStatus = 'submitted' | 'verified' | 'rejected';

export interface EnrollmentRequirementResponse {
  id: string;
  enrollmentId: string;
  requirementId: string;
  value: string | null;
  fileUrl: string | null;
  createdAt: string;
  /** Per-requirement review verdict, independent of the enrollment's overall approval_status. */
  status: RequirementResponseStatus;
  reviewerNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  requirement?: ProgramRequirement;
}

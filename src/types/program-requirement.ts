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

export interface EnrollmentRequirementResponse {
  id: string;
  enrollmentId: string;
  requirementId: string;
  value: string | null;
  fileUrl: string | null;
  createdAt: string;
  requirement?: ProgramRequirement;
}

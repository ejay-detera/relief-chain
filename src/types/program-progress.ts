/**
 * Program Progress Types (ORG-06: Monitor distribution progress in real time).
 *
 * Mirrors the beneficiary application progress architecture (StatusHistoryEntry,
 * ApplicationStage) to deliver a unified, consistent lifecycle monitoring
 * experience for organization administrators.
 */

export type ProgramProgressStage =
  | 'created'
  | 'funded'
  | 'enrolling'
  | 'distributing'
  | 'completed';

export interface ProgramProgressStageEntry {
  stage: ProgramProgressStage;
  label: string;
  description: string;
  timestamp: string | null;
  isCompleted: boolean;
  isCurrent: boolean;
}

export interface ProgramProgressMetrics {
  programId: string;
  totalBudget: number;
  distributedBudget: number;
  remainingBudget: number;
  budgetUtilizationPercent: number;
  maxBeneficiaries: number;
  enrolledCount: number;
  verifiedCount: number;
  approvedCount: number;
  remainingBeneficiaries: number;
  distributionCompletionPercent: number;
  currentStage: ProgramProgressStage;
  currentStageLabel: string;
  timeline: ProgramProgressStageEntry[];
  voucherTypes: string[];
  affectedAreas: string[];
}

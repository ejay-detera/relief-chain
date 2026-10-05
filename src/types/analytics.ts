import type { DateRangePreset } from './reports';

export type AidTypeFilter = 'all' | 'food' | 'medicine' | 'cash' | 'supplies';

export interface DisasterAnalyticsFilter {
  programId: string; // 'all' or program UUID
  aidType: AidTypeFilter;
  datePreset: DateRangePreset;
}

export interface DistributionTimeMetric {
  valueDays: number;
  formattedText: string;
  slaStatus: 'optimal' | 'acceptable' | 'delayed';
  slaLabel: string;
  benchmarkDescription: string;
}

export interface RedemptionRateMetric {
  percentage: number;
  redeemedCount: number;
  distributedCount: number;
  redeemedVolumePhp: number;
  distributedVolumePhp: number;
  formattedPercentage: string;
  subtext: string;
}

export interface BudgetUtilizationMetric {
  percentage: number;
  utilizedPhp: number;
  totalBudgetPhp: number;
  remainingPhp: number;
  formattedUtilized: string;
  formattedTotal: string;
  formattedPercentage: string;
  subtext: string;
}

export interface GeographicCoverageMetric {
  coveredCount: number;
  totalTargetCount: number;
  percentage: number;
  coveredBarangays: string[];
  coverageBadge: string;
  subtext: string;
}

export interface OrganizationPerformanceMetric {
  scorePercentage: number;
  ratingGrade: string;
  slaComplianceRate: number;
  onchainSettlementRate: number;
  subtext: string;
  isLedgerReconciled: boolean;
}

export interface DisasterAnalyticsSummary {
  distributionTime: DistributionTimeMetric;
  redemptionRate: RedemptionRateMetric;
  budgetUtilization: BudgetUtilizationMetric;
  geographicCoverage: GeographicCoverageMetric;
  organizationPerformance: OrganizationPerformanceMetric;
  totalProgramsEvaluated: number;
  activeProgramsCount: number;
  completedOrArchivedCount: number;
  isReadOnlyLedger: boolean;
  ledgerProofReference: string;
  lastCalculatedAt: string;
}

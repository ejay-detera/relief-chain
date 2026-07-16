import type { PilotAssetCode, StellarNetwork, StroopAmount } from './blockchain';

export type ProjectionMetadata = Readonly<{
  asOfLedger: number;
  reconciledAt: string;
}>;

/** A projection can expose data only when its provenance and trust state are explicit. */
export type ProjectionState<T> =
  | { status: 'loading' }
  | { status: 'empty'; checkedAt: string }
  | { status: 'current'; data: T; metadata: ProjectionMetadata }
  | { status: 'stale'; data: T; metadata: ProjectionMetadata; reason: string }
  | { status: 'unavailable'; reason: string; retryable: boolean; correlationId?: string }
  | {
      status: 'quarantined';
      data: T | null;
      metadata: ProjectionMetadata | null;
      issueId: string;
      reason: string;
    };


export type BalanceKind = 'voucher_entitlement' | 'unrestricted_cash' | 'merchant_settled';

/**
 * Aggregated, reconciliation-backed pilot balance for a beneficiary. Cash and
 * voucher entitlements are kept distinct (Requirement 21.7) and are always
 * expressed as canonical integer stroops of the non-monetary RCPHP test asset.
 */
export type PilotBalanceSummary = Readonly<{
  cashAvailableStroops: StroopAmount;
  voucherAvailableStroops: StroopAmount;
  assetCode: PilotAssetCode;
  network: StellarNetwork;
  confirmedTransactionCount: number;
}>;

export type BalanceProjection<TBalance> = ProjectionState<Readonly<{
  balance: TBalance;
  kind: BalanceKind;
  ownerId: string;
  assetCode: 'RCPHP';
}>>;

/**
 * Per-program reconciled entitlement for a beneficiary, sourced from
 * `beneficiary_balance_projection`. Cash and voucher aid are kept distinct
 * (Requirement 21.7) and expressed as canonical integer stroops of RCPHP.
 */
export type BeneficiaryProgramEntitlement = Readonly<{
  programId: string;
  programName: string;
  purpose: string | null;
  aidType: BalanceAidType;
  availableStroops: StroopAmount;
  allocatedStroops: StroopAmount;
  distributedStroops: StroopAmount;
  redeemedStroops: StroopAmount;
  refundedStroops: StroopAmount;
  confirmedTransactionCount: number;
  latestTransactionHash: string | null;
  assetCode: PilotAssetCode;
  network: StellarNetwork;
}>;

export type BalanceAidType = 'cash' | 'voucher';

/**
 * Reconciled merchant financial position sourced from
 * `merchant_balance_projection`. Settled assets, gross settlement, refunds, and
 * cash-out are surfaced distinctly (Requirements 12.3, 21.7).
 */
export type MerchantBalanceSummary = Readonly<{
  settledBalanceStroops: StroopAmount;
  grossSettledStroops: StroopAmount;
  refundedStroops: StroopAmount;
  pendingCashoutStroops: StroopAmount;
  completedCashoutStroops: StroopAmount;
  confirmedSettlementCount: number;
  latestTransactionHash: string | null;
  assetCode: PilotAssetCode;
  network: StellarNetwork;
}>;

/**
 * Reconciled program-level financial position sourced from
 * `program_financial_projection`. Every conserved bucket is surfaced separately
 * so funded value can be reconciled at a glance (Requirements 18.2, 19.3).
 */
export type ProgramFinancialSummary = Readonly<{
  programId: string;
  aidType: BalanceAidType;
  programStatus: string;
  fundingStatus: string;
  budgetStroops: StroopAmount;
  fundedStroops: StroopAmount;
  distributedStroops: StroopAmount;
  redeemedStroops: StroopAmount;
  refundedStroops: StroopAmount;
  returnedStroops: StroopAmount;
  escrowBalanceStroops: StroopAmount;
  contractId: string | null;
  latestTransactionHash: string | null;
  assetCode: PilotAssetCode;
  network: StellarNetwork;
}>;

/**
 * Reconciled distribution-job status sourced from `distribution_job_projection`.
 * Recipient counts and confirmed/failed amounts are never derived from client
 * state or timers (Requirements 8.7, 22.3).
 */
export type DistributionJobSummary = Readonly<{
  distributionJobId: string;
  programId: string;
  status: string;
  totalAmountStroops: StroopAmount;
  confirmedAmountStroops: StroopAmount;
  failedAmountStroops: StroopAmount;
  recipientCount: number;
  pendingCount: number;
  submittedCount: number;
  confirmedCount: number;
  failedCount: number;
  cancelledCount: number;
  latestTransactionHash: string | null;
}>;

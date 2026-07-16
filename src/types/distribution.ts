import type { AssetDescriptor, LedgerEvidence, StroopAmount } from '@/types/blockchain';
import type { FinancialError } from '@/types/errors';

export type DistributionJobStatus =
  | 'draft' | 'validating' | 'awaiting_approval' | 'queued'
  | 'submitting' | 'reconciling' | 'completed' | 'partial_failed' | 'cancelled';

export type DistributionRecipient = Readonly<{
  id: string;
  beneficiaryIdentityId: string;
  walletAddress: string;
  amountStroops: StroopAmount;
  idempotencyKey: string;
}> & (
  | { status: 'pending' | 'prepared' }
  | { status: 'submitted'; attemptId: string; transactionHash: string | null }
  | { status: 'confirmed'; evidence: LedgerEvidence }
  | { status: 'failed'; error: FinancialError; safeToRetry: boolean }
  | { status: 'cancelled'; reason: string }
);

export type DistributionJob = Readonly<{
  id: string;
  organizationId: string;
  programId: string;
  asset: AssetDescriptor;
  totalAmountStroops: StroopAmount;
  recipientCount: number;
  status: DistributionJobStatus;
  createdAt: string;
  updatedAt: string;
}>;

/** Terminal or in-flight state of a single recipient transfer. */
export type DistributionRecipientStatus =
  | 'pending' | 'prepared' | 'submitted' | 'confirmed' | 'failed' | 'cancelled';

/**
 * PII-safe per-recipient outcome for organization distribution surfaces. It
 * intentionally omits names, government IDs, and identity-to-wallet mappings;
 * recipients are referenced only by a short pseudonymous correlation reference
 * (Requirements 8.8, 19.1).
 */
export type DistributionRecipientOutcome = Readonly<{
  id: string;
  reference: string;
  amountStroops: StroopAmount;
  status: DistributionRecipientStatus;
  transactionHash: string | null;
  confirmedLedger: number | null;
  failureCode: string | null;
  failureReason: string | null;
  safeToRetry: boolean;
}>;

/**
 * Reconciled, indexed distribution-job projection (public.distribution_job_projection).
 * Confirmed counts and the latest verifiable ledger reference originate only
 * from reconciliation evidence, never from client-supplied values.
 */
export type DistributionJobProjection = Readonly<{
  distributionJobId: string;
  organizationId: string;
  programId: string;
  status: DistributionJobStatus;
  recipientCount: number;
  pendingCount: number;
  submittedCount: number;
  confirmedCount: number;
  failedCount: number;
  cancelledCount: number;
  totalAmountStroops: StroopAmount;
  confirmedAmountStroops: StroopAmount;
  failedAmountStroops: StroopAmount;
  confirmedTransactionCount: number;
  latestTransactionHash: string | null;
}>;

/** Reconciliation provenance attached to an observed projection. */
export type ReconciliationMetadata = Readonly<{
  asOfLedger: number;
  reconciledAt: string;
  isStale: boolean;
  staleSince: string | null;
  isQuarantined: boolean;
  quarantineIssueId: string | null;
}>;

/**
 * Honest observation of a server-managed distribution job. Early lifecycle
 * states are read from the authoritative workflow table; confirmed, stale, and
 * quarantined states are read from the reconciled projection. A dependency
 * failure is surfaced as `unavailable` and is never converted into a populated
 * success (Requirements 18.1, 21.2, 21.4).
 */
export type DistributionJobObservation =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'unavailable'; reason: string; retryable: boolean }
  | {
      status: 'observed';
      job: DistributionJobProjection;
      reconciliation: ReconciliationMetadata | null;
    };

/** One recipient intent the organization user selected before authorization. */
export type DistributionRecipientRequest = Readonly<{
  beneficiaryProfileId: string;
  amountStroops: StroopAmount;
}>;

/** Inputs the wizard collects before requesting a server-prepared distribution. */
export type DistributionPrepareRequest = Readonly<{
  programId: string;
  recipients: readonly DistributionRecipientRequest[];
}>;

/**
 * A server-prepared distribution awaiting explicit authorization. The server
 * owns the job identity and idempotency key; the client never supplies a
 * transaction hash (Requirement 21.1).
 */
export type PreparedDistribution = Readonly<{
  jobId: string;
  programId: string;
  recipientCount: number;
  totalAmountStroops: StroopAmount;
  status: DistributionJobStatus;
}>;

/** Explicit organization authorization that starts a prepared job. */
export type DistributionAuthorization = Readonly<{
  jobId: string;
  authorizedAt: string;
}>;

/**
 * A relayed request to safely retry a job that partially failed. The client
 * never decides which transfers to resend and never resends anything itself; it
 * only relays this request. The server re-validates, classifies retryability,
 * and retries only eligible unconfirmed or failed transfers under their existing
 * deterministic idempotency keys — confirmed transfers are preserved and can
 * never be duplicated (Requirements 8.5, 8.6).
 */
export type DistributionRetryRequest = Readonly<{
  jobId: string;
  requestedAt: string;
}>;

// Resumable bulk-distribution validation, batching, and queue execution.
//
// This module is the composition layer that turns an approved cash-distribution
// job into durable, resumable, per-recipient work. It sits between the
// distribution Edge Functions (Task 10.3) and the two shared spines it composes:
//
//   - work-queue.ts  — bounded concurrency and PER-ITEM FAILURE ISOLATION, so
//     one invalid or failing recipient never blocks the rest of a 2,000-strong
//     job (Requirements 8.9, 22.2, 22.4).
//   - stellar/protocol.ts — the deterministic business idempotency keys and the
//     prepare/build/submit spine each recipient transfer flows through, so a
//     retry can never duplicate aid (Requirement 8.5). This module BINDS the
//     keys and shapes the per-recipient work; the actual per-transfer protocol
//     call is injected by Task 10.3.
//
// It owns three pure, injectable concerns (design "State Machines → Distribution"
// and "Components → Transaction Orchestration"):
//
//   1. VALIDATION — for every candidate recipient, verify enrollment approval, a
//      current verified beneficiary wallet, a positive integer allocation, the
//      remaining program budget, duplicate-payment status, and the configured
//      network (Requirement 8.2). Validation partitions candidates into valid
//      work and per-recipient failures WITHOUT letting one bad recipient reject
//      the batch (Requirements 8.8, 8.9).
//   2. BATCHING — split valid work into bounded batches compatible with the
//      Stellar per-transaction operation limit (Requirement 8.3), and expose the
//      batching math so a >=2,000-recipient job is provably bounded
//      (Requirement 22.2).
//   3. RESUMABLE EXECUTION — the distribution_recipients rows ARE the durable
//      per-recipient store; resumption preserves already-confirmed recipients and
//      re-drives only eligible unconfirmed/failed work (Requirements 8.6, 8.7),
//      processing each bounded batch with bounded concurrency and per-item
//      isolation via the work queue.
//
// All state and I/O are injected, so this module reads no Deno globals and stays
// inside the project-wide type check and the unit-test harness. Deno.serve
// entrypoints live in the per-function index.ts files, not here.
//
// Validates: Requirements 4.5, 8.1, 8.2, 8.3, 8.9, 22.2, 22.4

import type { Database } from '../../../../src/types/database.types.ts';

import { FinancialErrorException } from '../errors.ts';
import { mapWithConcurrency } from '../work-queue.ts';

// ---------------------------------------------------------------------------
// Domain row/enum aliases.
// ---------------------------------------------------------------------------

export type WalletRecord = Database['public']['Tables']['wallets']['Row'];
export type EnrollmentRecord = Database['public']['Tables']['enrollments']['Row'];
export type DistributionRecipientRecord =
  Database['public']['Tables']['distribution_recipients']['Row'];
export type DistributionRecipientStatus =
  Database['public']['Enums']['distribution_recipient_status'];
export type DistributionJobStatus = Database['public']['Enums']['distribution_job_status'];
export type WalletNetwork = Database['public']['Enums']['wallet_network'];

/** The single pilot network; every recipient wallet must be bound to it. */
export const PILOT_WALLET_NETWORK: WalletNetwork = 'stellar_testnet';

/** The enrollment approval value the database treats as approved. */
export const APPROVED_ENROLLMENT_STATUS = 'Approved';

// ---------------------------------------------------------------------------
// Batching bounds.
// ---------------------------------------------------------------------------

/**
 * The maximum number of operations a single classic Stellar transaction may
 * carry. A distribution batch maps one recipient payment to one operation, so a
 * batch can never exceed this without producing an invalid transaction. The
 * `distribution_jobs.batch_size` column is additionally constrained to 1..100.
 */
export const MAX_OPERATIONS_PER_STELLAR_TRANSACTION = 100;

/** The default batch size, matching the `distribution_jobs.batch_size` default. */
export const DEFAULT_DISTRIBUTION_BATCH_SIZE = 100;

/** The municipal-pilot floor a distribution job must be able to contain. */
export const MIN_SUPPORTED_RECIPIENTS = 2_000;

/**
 * Asserts a batch size is a positive integer within the network operation limit.
 * A batch larger than {@link MAX_OPERATIONS_PER_STELLAR_TRANSACTION} could never
 * be submitted as one transaction, so it fails closed rather than being clamped.
 */
export const assertValidBatchSize = (batchSize: number): number => {
  if (
    !Number.isInteger(batchSize) ||
    batchSize <= 0 ||
    batchSize > MAX_OPERATIONS_PER_STELLAR_TRANSACTION
  ) {
    throw new RangeError(
      `batchSize must be an integer between 1 and ${MAX_OPERATIONS_PER_STELLAR_TRANSACTION}.`,
    );
  }
  return batchSize;
};

// ---------------------------------------------------------------------------
// Deterministic idempotency key.
// ---------------------------------------------------------------------------

/**
 * Builds the deterministic per-recipient business idempotency key. This mirrors
 * the database function `private.make_distribution_recipient_key` EXACTLY so the
 * key the orchestrator claims is identical to the one the schema derives. Because
 * the key is a pure function of `(program, beneficiary, policy version)`, a retry
 * of the same logical transfer always reuses the same key and can never create a
 * second payment (Requirement 8.5, design Property 2).
 */
export const makeDistributionRecipientKey = (
  programId: string,
  beneficiaryIdentityId: string,
  policyVersion: number,
): string => {
  if (!Number.isInteger(policyVersion) || policyVersion < 0) {
    throw new RangeError('policyVersion must be a non-negative integer.');
  }
  return (
    `distribution:${programId}` +
    `:beneficiary:${beneficiaryIdentityId}` +
    `:policy:${policyVersion}`
  );
};

// ---------------------------------------------------------------------------
// Per-recipient validation.
// ---------------------------------------------------------------------------

/** The stable machine reasons a recipient can fail pre-submission validation. */
export type RecipientFailureCode =
  | 'enrollment_missing'
  | 'enrollment_not_approved'
  | 'enrollment_scope_mismatch'
  | 'wallet_missing'
  | 'wallet_not_beneficiary_owned'
  | 'wallet_wrong_purpose'
  | 'wallet_not_verified'
  | 'wallet_inactive'
  | 'wallet_wrong_network'
  | 'amount_invalid'
  | 'budget_exceeded'
  | 'duplicate_recipient';

/** One recipient the orchestrator wants to include in a distribution job. */
export interface RecipientCandidate {
  readonly beneficiaryIdentityId: string;
  /** The approved enrollment linking the beneficiary to the program, if any. */
  readonly enrollment: EnrollmentRecord | null;
  /** The wallet the transfer would credit, if a candidate wallet was found. */
  readonly wallet: WalletRecord | null;
  /** The requested transfer amount in integer stroops. */
  readonly amountStroops: number;
}

/** Read-only context shared across a single validation pass. */
export interface RecipientValidationContext {
  readonly organizationId: string;
  readonly programId: string;
  readonly policyVersion: number;
  /** The network every recipient wallet must be bound to. */
  readonly network: WalletNetwork;
  /** Remaining funded program budget available to this job, in stroops. */
  readonly availableBudgetStroops: number;
  /**
   * Deterministic recipient keys already claimed for this program (e.g. a prior
   * job or a duplicate submission). A candidate whose key is already claimed is a
   * duplicate payment and is rejected.
   */
  readonly claimedRecipientKeys?: ReadonlySet<string>;
}

export interface ValidatedRecipient {
  readonly beneficiaryIdentityId: string;
  readonly enrollmentId: string;
  readonly destinationWalletId: string;
  readonly amountStroops: number;
  /** The deterministic business idempotency key bound to this recipient. */
  readonly idempotencyKey: string;
}

export interface RejectedRecipient {
  readonly beneficiaryIdentityId: string;
  readonly failureCode: RecipientFailureCode;
  readonly failureReason: string;
}

export interface RecipientValidationResult {
  readonly valid: readonly ValidatedRecipient[];
  readonly rejected: readonly RejectedRecipient[];
  /** Total stroops the valid recipients would move; never exceeds the budget. */
  readonly totalValidAmountStroops: number;
}

const REASONS: Readonly<Record<RecipientFailureCode, string>> = {
  enrollment_missing: 'No enrollment was found linking this beneficiary to the program.',
  enrollment_not_approved: 'The beneficiary enrollment is not approved.',
  enrollment_scope_mismatch: 'The enrollment does not match this program and beneficiary.',
  wallet_missing: 'The beneficiary has no candidate wallet to receive the transfer.',
  wallet_not_beneficiary_owned: 'The wallet is not owned by this beneficiary identity.',
  wallet_wrong_purpose: 'The wallet is not a beneficiary payout wallet.',
  wallet_not_verified: 'The beneficiary wallet is not verified.',
  wallet_inactive: 'The beneficiary wallet is not the currently active wallet.',
  wallet_wrong_network: 'The beneficiary wallet is not on the configured network.',
  amount_invalid: 'The allocation amount must be a positive whole number of stroops.',
  budget_exceeded: 'The remaining program budget cannot cover this allocation.',
  duplicate_recipient: 'This beneficiary already has a transfer for this program.',
};

const reject = (
  beneficiaryIdentityId: string,
  failureCode: RecipientFailureCode,
): RejectedRecipient => ({
  beneficiaryIdentityId,
  failureCode,
  failureReason: REASONS[failureCode],
});

/**
 * Classifies a single candidate against enrollment, wallet, allocation, and
 * network rules. Returns a failure code for the first rule violated, or `null`
 * when the candidate is structurally payable. Budget and duplicate checks are
 * stateful and handled by {@link validateRecipients}, which threads the running
 * budget and the set of keys already seen.
 *
 * The wallet checks mirror the database trigger
 * `private.validate_financial_workflow_scope` so a recipient that would be
 * rejected by the schema is caught here first with a user-safe reason.
 */
export const classifyRecipientStructure = (
  candidate: RecipientCandidate,
  context: RecipientValidationContext,
): RecipientFailureCode | null => {
  const { enrollment, wallet } = candidate;

  // Enrollment: approved and scoped to this exact program and beneficiary.
  if (enrollment === null) {
    return 'enrollment_missing';
  }
  if (
    enrollment.program_id !== context.programId ||
    enrollment.beneficiary_identity_id !== candidate.beneficiaryIdentityId
  ) {
    return 'enrollment_scope_mismatch';
  }
  if (enrollment.approval_status !== APPROVED_ENROLLMENT_STATUS) {
    return 'enrollment_not_approved';
  }

  // Wallet: the current verified, active, beneficiary-owned payout wallet on the
  // configured network.
  if (wallet === null) {
    return 'wallet_missing';
  }
  if (
    wallet.owner_type !== 'beneficiary_identity' ||
    wallet.owner_id !== candidate.beneficiaryIdentityId
  ) {
    return 'wallet_not_beneficiary_owned';
  }
  if (wallet.purpose !== 'beneficiary') {
    return 'wallet_wrong_purpose';
  }
  if (wallet.network !== context.network) {
    return 'wallet_wrong_network';
  }
  if (wallet.verification_status !== 'verified') {
    return 'wallet_not_verified';
  }
  if (!wallet.is_active) {
    return 'wallet_inactive';
  }

  // Allocation amount: a positive whole number of stroops.
  if (!Number.isInteger(candidate.amountStroops) || candidate.amountStroops <= 0) {
    return 'amount_invalid';
  }

  return null;
};

/**
 * Validates every candidate, partitioning them into payable work and
 * per-recipient failures. Budget is consumed in order: once the running
 * remaining budget cannot cover a candidate it is rejected as `budget_exceeded`
 * WITHOUT consuming budget, so later smaller allocations can still succeed.
 * Duplicate detection spans both keys already claimed for the program and repeat
 * beneficiaries within this same candidate set. One rejected recipient never
 * rejects the others (Requirements 8.2, 8.8, 8.9).
 */
export const validateRecipients = (
  candidates: readonly RecipientCandidate[],
  context: RecipientValidationContext,
): RecipientValidationResult => {
  const valid: ValidatedRecipient[] = [];
  const rejected: RejectedRecipient[] = [];
  const claimed = context.claimedRecipientKeys ?? new Set<string>();
  const seenKeys = new Set<string>();
  let remainingBudget = context.availableBudgetStroops;
  let totalValidAmountStroops = 0;

  for (const candidate of candidates) {
    const structural = classifyRecipientStructure(candidate, context);
    if (structural !== null) {
      rejected.push(reject(candidate.beneficiaryIdentityId, structural));
      continue;
    }

    // Structural validity guarantees a non-null enrollment/wallet and a valid
    // positive integer amount.
    const enrollment = candidate.enrollment as EnrollmentRecord;
    const wallet = candidate.wallet as WalletRecord;
    const key = makeDistributionRecipientKey(
      context.programId,
      candidate.beneficiaryIdentityId,
      context.policyVersion,
    );

    // Duplicate payment: already claimed elsewhere, or a repeat in this set.
    if (claimed.has(key) || seenKeys.has(key)) {
      rejected.push(reject(candidate.beneficiaryIdentityId, 'duplicate_recipient'));
      continue;
    }

    // Budget: reject without consuming so a later smaller allocation may fit.
    if (candidate.amountStroops > remainingBudget) {
      rejected.push(reject(candidate.beneficiaryIdentityId, 'budget_exceeded'));
      continue;
    }

    seenKeys.add(key);
    remainingBudget -= candidate.amountStroops;
    totalValidAmountStroops += candidate.amountStroops;
    valid.push({
      beneficiaryIdentityId: candidate.beneficiaryIdentityId,
      enrollmentId: enrollment.id,
      destinationWalletId: wallet.id,
      amountStroops: candidate.amountStroops,
      idempotencyKey: key,
    });
  }

  return { valid, rejected, totalValidAmountStroops };
};

// ---------------------------------------------------------------------------
// Bounded batching.
// ---------------------------------------------------------------------------

/** How a recipient count splits into bounded transaction batches. */
export interface BatchingPlan {
  readonly batchSize: number;
  readonly recipientCount: number;
  readonly batchCount: number;
  /** The size of the final (possibly smaller) batch; 0 when there is no work. */
  readonly lastBatchSize: number;
}

/**
 * Computes the batching math for a recipient count without materializing the
 * batches. Used to prove a >=2,000-recipient job is bounded into
 * `ceil(count / batchSize)` transactions, each no larger than the network limit
 * (Requirements 8.3, 22.2).
 */
export const computeBatchingPlan = (
  recipientCount: number,
  batchSize: number = DEFAULT_DISTRIBUTION_BATCH_SIZE,
): BatchingPlan => {
  assertValidBatchSize(batchSize);
  if (!Number.isInteger(recipientCount) || recipientCount < 0) {
    throw new RangeError('recipientCount must be a non-negative integer.');
  }
  const batchCount = Math.ceil(recipientCount / batchSize);
  const remainder = recipientCount % batchSize;
  const lastBatchSize = recipientCount === 0 ? 0 : remainder === 0 ? batchSize : remainder;
  return { batchSize, recipientCount, batchCount, lastBatchSize };
};

/**
 * Splits items into bounded, order-preserving batches, each no larger than
 * `batchSize` (and therefore never exceeding the network operation limit). The
 * concatenation of the batches equals the input, so no recipient is dropped or
 * duplicated by batching (Requirement 8.3).
 */
export const planBatches = <T>(
  items: readonly T[],
  batchSize: number = DEFAULT_DISTRIBUTION_BATCH_SIZE,
): T[][] => {
  assertValidBatchSize(batchSize);
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }
  return batches;
};

// ---------------------------------------------------------------------------
// Resumable per-recipient execution.
// ---------------------------------------------------------------------------

/** Recipient statuses that are safe to (re-)drive in a resume pass. */
export const RESUMABLE_RECIPIENT_STATUSES: readonly DistributionRecipientStatus[] = Object.freeze([
  'pending',
  'failed',
]);

/**
 * Statuses that must NOT be re-driven: `confirmed`/`cancelled` are terminal and
 * `submitted` is in flight and owned by reconciliation. Preserving them is the
 * core resumption guarantee (Requirements 8.6, 8.7).
 */
export const isResumableRecipientStatus = (status: DistributionRecipientStatus): boolean =>
  (RESUMABLE_RECIPIENT_STATUSES as readonly string[]).includes(status);

/**
 * Selects the recipients a resume pass may re-drive, preserving every confirmed
 * (and every in-flight submitted) recipient untouched. Order is preserved so a
 * resumed job continues deterministically.
 */
export const selectResumableRecipients = <T extends { readonly status: DistributionRecipientStatus }>(
  recipients: readonly T[],
): T[] => recipients.filter((recipient) => isResumableRecipientStatus(recipient.status));

/** A durable per-recipient unit of work handed to the processor. */
export interface RecipientWork {
  readonly recipientId: string;
  readonly beneficiaryIdentityId: string;
  readonly destinationWalletId: string;
  readonly amountStroops: number;
  readonly idempotencyKey: string;
}

/** The outcome a per-recipient processor reports for one transfer. */
export type RecipientOutcome =
  | { readonly kind: 'submitted'; readonly transactionHash: string }
  | { readonly kind: 'failed'; readonly failureCode: string; readonly failureReason: string };

/**
 * Processes one recipient transfer. Implemented by Task 10.3 by composing the
 * prepare/build/authorize/submit protocol under the recipient's deterministic
 * idempotency key. A business failure SHOULD be returned as a `failed` outcome;
 * a thrown error is isolated by the engine and recorded as a failed recipient so
 * one failure never blocks the batch.
 */
export type RecipientProcessor = (work: RecipientWork) => Promise<RecipientOutcome>;

export interface SubmittedRecipient {
  readonly recipientId: string;
  readonly transactionHash: string;
}

export interface FailedRecipient {
  readonly recipientId: string;
  readonly failureCode: string;
  readonly failureReason: string;
}

/** The result of draining one bounded batch of recipient work. */
export interface BatchExecutionReport {
  readonly submitted: readonly SubmittedRecipient[];
  readonly failed: readonly FailedRecipient[];
}

const FAILURE_CODE_MAX_LENGTH = 100;
const FAILURE_REASON_MAX_LENGTH = 1000;

const clamp = (value: string, max: number): string =>
  value.length > max ? value.slice(0, max) : value;

const outcomeToFailure = (recipientId: string, error: unknown): FailedRecipient => {
  if (error instanceof FinancialErrorException) {
    return {
      recipientId,
      failureCode: clamp(error.financialError.code, FAILURE_CODE_MAX_LENGTH),
      failureReason: clamp(error.financialError.message, FAILURE_REASON_MAX_LENGTH),
    };
  }
  return {
    recipientId,
    failureCode: 'processing_error',
    failureReason: 'An unexpected error prevented this transfer from being submitted.',
  };
};

/**
 * Drives one bounded batch of recipient work under the injected concurrency
 * bound. Every recipient runs through the work queue's per-item isolation: a
 * `failed` outcome or a thrown error is captured against that recipient and
 * never propagated, so the remaining recipients in the batch always run to
 * completion (Requirements 8.9, 22.4).
 */
export const executeRecipientBatch = async (
  works: readonly RecipientWork[],
  maxConcurrency: number,
  processor: RecipientProcessor,
): Promise<BatchExecutionReport> => {
  const submitted: SubmittedRecipient[] = [];
  const failed: FailedRecipient[] = [];

  const { succeeded, failed: thrown } = await mapWithConcurrency(
    works,
    maxConcurrency,
    (work) => processor(work),
  );

  for (const success of succeeded) {
    const outcome = success.value;
    if (outcome.kind === 'submitted') {
      submitted.push({ recipientId: success.item.recipientId, transactionHash: outcome.transactionHash });
    } else {
      failed.push({
        recipientId: success.item.recipientId,
        failureCode: clamp(outcome.failureCode, FAILURE_CODE_MAX_LENGTH),
        failureReason: clamp(outcome.failureReason, FAILURE_REASON_MAX_LENGTH),
      });
    }
  }

  // A thrown error is isolated by the queue and recorded as a failed recipient,
  // eligible to be retried on a later resume pass.
  for (const failure of thrown) {
    failed.push(outcomeToFailure(failure.item.recipientId, failure.error));
  }

  return { submitted, failed };
};

export interface DistributionExecutionParams {
  readonly works: readonly RecipientWork[];
  readonly processor: RecipientProcessor;
  readonly batchSize?: number;
  readonly maxConcurrency?: number;
}

/**
 * Runs a full distribution pass: the work is split into bounded batches (each no
 * larger than the network operation limit) and each batch is drained with
 * bounded concurrency and per-item isolation. Batches run sequentially so the
 * number of in-flight transactions stays bounded; within a batch, recipients run
 * concurrently up to `maxConcurrency`. The aggregate report never hides a
 * failure as a success (Requirement 8.7 is enforced by the caller using
 * {@link summarizeRecipientStatuses}).
 */
export const runDistributionExecution = async (
  params: DistributionExecutionParams,
): Promise<BatchExecutionReport> => {
  const batchSize = assertValidBatchSize(params.batchSize ?? DEFAULT_DISTRIBUTION_BATCH_SIZE);
  const maxConcurrency = params.maxConcurrency ?? Math.min(batchSize, 10);
  if (!Number.isInteger(maxConcurrency) || maxConcurrency <= 0) {
    throw new RangeError('maxConcurrency must be a positive integer.');
  }

  const submitted: SubmittedRecipient[] = [];
  const failed: FailedRecipient[] = [];

  for (const batch of planBatches(params.works, batchSize)) {
    const report = await executeRecipientBatch(batch, maxConcurrency, params.processor);
    submitted.push(...report.submitted);
    failed.push(...report.failed);
  }

  return { submitted, failed };
};

// ---------------------------------------------------------------------------
// Job status roll-up.
// ---------------------------------------------------------------------------

export interface RecipientStatusCounts {
  readonly total: number;
  readonly pending: number;
  readonly prepared: number;
  readonly submitted: number;
  readonly confirmed: number;
  readonly failed: number;
  readonly cancelled: number;
}

/** Tallies recipient rows by status for job roll-up and progress surfaces. */
export const summarizeRecipientStatuses = (
  recipients: readonly { readonly status: DistributionRecipientStatus }[],
): RecipientStatusCounts => {
  const counts = {
    total: recipients.length,
    pending: 0,
    prepared: 0,
    submitted: 0,
    confirmed: 0,
    failed: 0,
    cancelled: 0,
  };
  for (const recipient of recipients) {
    counts[recipient.status] += 1;
  }
  return counts;
};

/**
 * True when any recipient still requires attention before the job is finished:
 * a pending, prepared, submitted, or failed recipient means the job cannot be
 * reported as fully successful (Requirement 8.7).
 */
export const hasUnfinishedRecipients = (counts: RecipientStatusCounts): boolean =>
  counts.pending > 0 || counts.prepared > 0 || counts.submitted > 0 || counts.failed > 0;

/**
 * Resolves the terminal job status once reconciliation has observed every
 * in-flight recipient. A job is `completed` ONLY when every recipient is
 * confirmed; if any recipient failed it is `partial_failed`; otherwise there is
 * still unfinished work and the job stays in `reconciling`. This mirrors the
 * database trigger's completion guard (Requirements 8.6, 8.7).
 */
export const resolveTerminalJobStatus = (
  counts: RecipientStatusCounts,
): DistributionJobStatus => {
  if (counts.total > 0 && counts.confirmed === counts.total) {
    return 'completed';
  }
  if (counts.submitted === 0 && counts.pending === 0 && counts.prepared === 0 && counts.failed > 0) {
    return 'partial_failed';
  }
  return 'reconciling';
};

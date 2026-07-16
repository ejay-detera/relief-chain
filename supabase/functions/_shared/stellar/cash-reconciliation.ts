// Cash-rail reconciliation: observers, projectors, partial-failure recovery,
// finality, and MVP boundaries (Task 10.4).
//
// This module adds the CLASSIC CASH RAIL observer and projector to the shared
// reconciliation worker and projection writer built by Task 6.4
// (`reconciliation.ts`). Confirmed financial ownership lives on the Stellar
// ledger, never in a submission response, so — exactly like the worker — nothing
// here turns a submission into a confirmation. The worker still owns the
// confirmation invariants (network/hash verification, append-only evidence,
// attempt transitions); this module supplies the two rail-specific pieces the
// worker's design leaves to Task 10.4:
//
//   1. OBSERVER  — {@link createCashTransactionObserver} reads an in-flight
//      classic cash attempt's transaction on the guarded testnet Horizon and
//      reports exact ledger evidence (settled success/failure, still pending, or
//      never landed). It never confirms; it only reports what the ledger shows
//      (Requirements 6.4, 18.5, 18.8).
//   2. PROJECTOR — {@link createCashDistributionProjector} reflects that ledger
//      truth into the durable per-recipient row (`submitted -> confirmed`) while
//      PRESERVING every already-confirmed recipient, and reports a mismatch to be
//      quarantined when the observed evidence disagrees with the recorded intent
//      (it never invents ownership — Requirement 18.6).
//
// Around those it composes the resumable-distribution primitives from
// `distribution.ts` and the worker from `reconciliation.ts` into a cash
// reconciliation pass ({@link createCashDistributionReconciler}) that enforces
// the finality and partial-failure guarantees Task 10.4 requires:
//
//   - PRESERVE CONFIRMED RECIPIENTS. A confirmed (or in-flight `submitted`)
//     recipient is reconciliation-owned and never re-driven or rewritten
//     (Requirement 8.6). Only reconciliation transitions `submitted` forward.
//   - RETRY ONLY ELIGIBLE UNRESOLVED WORK. A resume pass re-drives only `pending`
//     / `failed` recipients (`selectResumableRecipients`); an observed on-chain
//     failure moves a `submitted` recipient to `failed` so it becomes eligible
//     again, without ever abandoning a real settlement (Requirement 8.6).
//   - NEVER COMPLETE WITH REQUIRED PENDING/FAILED RECIPIENTS. The job roll-up
//     uses {@link resolveTerminalJobStatus}: `completed` requires every recipient
//     confirmed; any pending/prepared/submitted/failed recipient keeps the job
//     `reconciling`/`partial_failed` (Requirements 8.7).
//   - NEVER EXPIRE OR RECLAIM CONFIRMED CASH. Confirmed unrestricted cash and
//     confirmed merchant settlement are final; {@link assertConfirmedCashNotReclaimed}
//     and {@link cashReclaimableStroopsOnClosure} fail closed against any attempt
//     to expire or claw back confirmed cash (Requirements 6.5, 15.8).
//   - EXPOSE NO GENERAL P2P. The cash rail only ever moves value along the two
//     permitted paths (org treasury -> beneficiary, beneficiary -> merchant
//     settlement); {@link assertNoGeneralP2PTransfer} rejects any arbitrary
//     wallet-to-wallet transfer, and {@link GENERAL_P2P_TRANSFERS_ENABLED} stays
//     `false` (Requirement 6.8).
//
// Because the reconciled read models are guarded by a database trigger that
// REQUIRES a completed reconciliation run (a projection's `reconciled_at` must
// equal the run's `completed_at` and its `as_of_ledger` must not exceed the run's
// end ledger), this module writes the cash read models AFTER the worker completes
// its run — never mid-run — with the completed run's evidence. Recipient-row
// transitions (a core table, not a projection) happen during the run.
//
// All configuration, clients, and stores are injected, so this module reads no
// Deno globals and stays inside the project-wide type check and the unit-test
// harness. Deno.serve entrypoints live in per-function index.ts files.
//
// Validates: Requirements 6.4, 6.5, 6.8, 8.6, 8.7, 8.8, 15.8, 18.5, 18.8

import type { StellarTestnetConfig } from '../../../../shared/stellar-config.ts';
import type { Database } from '../../../../src/types/database.types.ts';

import { FinancialErrorException, newCorrelationId } from '../errors.ts';
import { safeLog } from '../redaction.ts';

import {
    type DistributionJobStatus,
    type DistributionRecipientRecord,
    type DistributionRecipientStatus,
    type RecipientStatusCounts,
    resolveTerminalJobStatus,
    summarizeRecipientStatuses,
} from './distribution.ts';
import { createNetworkGuard, type NetworkGuard } from './network-guard.ts';
import {
    type AttemptStatus,
    type FinancialIntentRecord,
    PILOT_WALLET_NETWORK,
    type TransactionAttemptRecord,
    type WalletNetwork,
} from './protocol.ts';
import {
    type AttemptObservation,
    isInFlightAttempt,
    type ObservedLedgerTransaction,
    type ProjectionInput,
    type ProjectionResult,
    type ProjectionWriterPort,
    type ReconciliationObserver,
    type ReconciliationProjector,
    type ReconciliationRunParams,
    type ReconciliationRunRecord,
    type ReconciliationRunSummary,
    type ReconciliationWorker,
} from './reconciliation.ts';

// ---------------------------------------------------------------------------
// Domain row aliases.
// ---------------------------------------------------------------------------

export type DistributionJobProjectionInsert =
  Database['public']['Tables']['distribution_job_projection']['Insert'];
export type BeneficiaryBalanceProjectionInsert =
  Database['public']['Tables']['beneficiary_balance_projection']['Insert'];
export type FinancialOperationType = Database['public']['Enums']['financial_operation_type'];
export type ReconciliationIssueType = Database['public']['Enums']['reconciliation_issue_type'];

const HEX_64 = /^[0-9a-f]{64}$/;

/** Default read-model staleness window (seconds) after a reconciliation time. */
export const DEFAULT_STALE_WINDOW_SECONDS = 3_600;

/**
 * The financial operation types that flow over the classic cash rail. Every one
 * moves the configured `RCPHP` asset with classic Stellar payments and is
 * observed on Horizon (never a Soroban contract). The voucher rail
 * (`voucher_allocation` / `voucher_redemption`) is reconciled by Task 11.5.
 */
export const CASH_RAIL_OPERATION_TYPES: readonly FinancialOperationType[] = Object.freeze([
  'program_activation',
  'cash_distribution',
  'cash_payment',
]);

export const isCashRailOperation = (operationType: FinancialOperationType): boolean =>
  (CASH_RAIL_OPERATION_TYPES as readonly string[]).includes(operationType);

// ---------------------------------------------------------------------------
// MVP boundary: no general peer-to-peer transfers (Requirement 6.8).
// ---------------------------------------------------------------------------

/**
 * The pilot never exposes general wallet-to-wallet sending. Cash only ever moves
 * along the two audited paths (a distribution from the cash-program treasury to a
 * beneficiary, or a beneficiary payment to a verified merchant settlement
 * wallet). This constant makes that boundary explicit and testable.
 */
export const GENERAL_P2P_TRANSFERS_ENABLED = false as const;

/**
 * The only cash transfer paths the pilot permits. An arbitrary wallet-to-wallet
 * transfer is not one of them.
 */
export type PermittedCashTransferKind = 'cash_distribution' | 'cash_payment' | 'program_activation';

const PERMITTED_CASH_TRANSFER_OPERATIONS: ReadonlySet<string> = new Set(CASH_RAIL_OPERATION_TYPES);

/**
 * True only for a cash transfer bound to a permitted, audited path. A general
 * peer-to-peer transfer (no distribution job and no signed invoice) is never
 * permitted while {@link GENERAL_P2P_TRANSFERS_ENABLED} is `false`.
 */
export const isPermittedCashTransfer = (operationType: FinancialOperationType): boolean =>
  GENERAL_P2P_TRANSFERS_ENABLED || PERMITTED_CASH_TRANSFER_OPERATIONS.has(operationType);

/**
 * Fails closed when a request is not one of the permitted cash transfer paths,
 * so no general P2P transfer can be initiated through any cash-rail surface
 * (Requirement 6.8). This is the server-side backstop behind the deliberate
 * absence of any P2P API/UI.
 */
export const assertNoGeneralP2PTransfer = (
  operationType: FinancialOperationType,
  correlationId: string = newCorrelationId(),
): void => {
  if (!isPermittedCashTransfer(operationType)) {
    throw FinancialErrorException.of(
      'validation_failed',
      'General wallet-to-wallet transfers are outside the pilot scope.',
      { correlationId },
    );
  }
};

// ---------------------------------------------------------------------------
// Finality: confirmed cash is never expired or reclaimed (Req 6.5, 15.8).
// ---------------------------------------------------------------------------

/** Confirmed unrestricted cash is final: it is never expired or auto-reclaimed. */
export const CONFIRMED_CASH_IS_FINAL = true as const;

/** The kinds of confirmed value a closure/expiry routine might try to reclaim. */
export type ConfirmedCashReclaimKind =
  | 'confirmed_unrestricted_cash'
  | 'confirmed_merchant_settlement';

/**
 * Fails closed if any routine attempts to expire or claw back confirmed cash or
 * confirmed merchant settlement. Confirmed cash is final (Requirement 6.5) and
 * program closure returns only unallocated/expired ESCROW — never confirmed cash
 * or confirmed settlement (Requirement 15.8).
 */
export const assertConfirmedCashNotReclaimed = (
  kind: ConfirmedCashReclaimKind,
  correlationId: string = newCorrelationId(),
): never => {
  throw FinancialErrorException.of(
    'validation_failed',
    kind === 'confirmed_merchant_settlement'
      ? 'Confirmed merchant settlement is final and cannot be reclaimed.'
      : 'Confirmed unrestricted cash is final and cannot be expired or reclaimed.',
    { correlationId },
  );
};

/**
 * The reclaimable value of a CASH program at closure is always zero: a cash
 * program reserves its budget as spendable balances, and confirmed cash /
 * settlement is final, so closure never returns confirmed cash to the treasury
 * (Requirement 15.8). Only the voucher rail returns unused escrow (Task 9/11).
 */
export const cashReclaimableStroopsOnClosure = (): 0 => 0;

// ---------------------------------------------------------------------------
// Cash observer (classic rail).
// ---------------------------------------------------------------------------

/**
 * Exact, untrusted evidence for one classic transaction as read from Horizon.
 * The observer maps this into the worker's {@link ObservedLedgerTransaction}; the
 * worker re-verifies the network and hash before anything can confirm.
 */
export interface CashLedgerLookupResult {
  /** Whether the transaction was found in a closed ledger at all. */
  readonly found: boolean;
  /** Whether the ledger recorded the transaction as successful. */
  readonly successful: boolean;
  /** Lowercase-hex transaction hash (64 chars). */
  readonly transactionHash: string;
  readonly ledgerSequence: number;
  /** ISO-8601 ledger close time. */
  readonly ledgerClosedAt: string;
  readonly envelopeXdr: string;
  readonly resultCode?: string | null;
  readonly resultXdr?: string | null;
  readonly errorCode?: string | null;
  readonly errorMessage?: string | null;
}

/**
 * Reads a submitted classic transaction by hash from the guarded testnet
 * Horizon. Returns `null` when the transaction is not found (has not landed in a
 * ledger). Implementations must talk ONLY to the allowlisted testnet origin.
 */
export interface CashTransactionLookup {
  lookup(transactionHash: string): Promise<CashLedgerLookupResult | null>;
}

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

/** Lowercase-hex SHA-256 of a UTF-8 string (used for the envelope digest). */
export const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return toHex(digest);
};

export interface CashObserverDependencies {
  readonly config: StellarTestnetConfig;
  /** Defaults to a guard built from `config`; kept for defence-in-depth only. */
  readonly guard?: NetworkGuard;
  readonly lookup: CashTransactionLookup;
}

/**
 * Builds the classic cash-rail {@link ReconciliationObserver}. For an in-flight
 * attempt that has a submitted transaction hash it reads that transaction from
 * Horizon and reports EXACT ledger evidence:
 *
 *   - found + successful  -> `settled_success` (the worker verifies network/hash
 *     before it may confirm; the cash rail carries no contract events);
 *   - found + unsuccessful -> `settled_failure`;
 *   - not found           -> `not_found` (never landed; the worker moves a
 *     submitted attempt to `unknown` so it is reconciled again, not re-sent);
 *   - no submitted hash yet -> `still_pending` (nothing to observe).
 *
 * The observer NEVER confirms and NEVER fabricates evidence: a lookup failure
 * throws, and the worker isolates it as a failed observation that leaves the
 * attempt in flight (Requirements 18.5, 18.8).
 */
export const createCashTransactionObserver = (
  deps: CashObserverDependencies,
): ReconciliationObserver => {
  const guard = deps.guard ?? createNetworkGuard(deps.config);
  guard.assertTestnetConfig();

  return {
    async observeAttempt(attempt: TransactionAttemptRecord): Promise<AttemptObservation> {
      // Only in-flight (submitted/unknown) attempts are observed; the worker
      // no-ops terminal attempts, but guard here too.
      if (!isInFlightAttempt(attempt.status)) {
        return { kind: 'still_pending' };
      }
      // Nothing has been submitted to the network yet — there is no ledger
      // evidence to read, so make no transition.
      if (attempt.transaction_hash === null || !HEX_64.test(attempt.transaction_hash)) {
        return { kind: 'still_pending' };
      }

      const result = await deps.lookup.lookup(attempt.transaction_hash);
      if (result === null || !result.found) {
        return { kind: 'not_found' };
      }

      const ledger: ObservedLedgerTransaction = {
        // The guarded Horizon client is pinned to the configured testnet origin;
        // the worker re-asserts this passphrase before it may confirm.
        networkPassphrase: deps.config.networkPassphrase,
        transactionHash: result.transactionHash,
        successful: result.successful,
        ledgerSequence: result.ledgerSequence,
        ledgerClosedAt: result.ledgerClosedAt,
        envelopeXdr: result.envelopeXdr,
        envelopeSha256: await sha256Hex(result.envelopeXdr),
        resultCode: result.resultCode ?? null,
        resultXdr: result.resultXdr ?? null,
        errorCode: result.errorCode ?? null,
        errorMessage: result.errorMessage ?? null,
      };

      // Classic cash payments emit no contract events.
      return result.successful
        ? { kind: 'settled_success', ledger, events: [] }
        : { kind: 'settled_failure', ledger };
    },
  };
};

// ---------------------------------------------------------------------------
// Recipient outcome + job roll-up (pure).
// ---------------------------------------------------------------------------

/** The recipient transition an observed terminal attempt status implies. */
export type RecipientReconciliationOutcome = 'confirm' | 'fail' | 'none';

/**
 * Maps a reconciled attempt status to the recipient transition it implies:
 *   - `observed_success` -> `confirm` (reflect ledger truth);
 *   - `observed_failure` -> `fail`   (becomes eligible for a resume retry);
 *   - anything still in flight (`submitted`/`unknown`) -> `none` (never abandon a
 *     real settlement; reconcile again instead — Requirement 8.6).
 */
export const recipientOutcomeFor = (status: AttemptStatus): RecipientReconciliationOutcome => {
  if (status === 'observed_success') return 'confirm';
  if (status === 'observed_failure') return 'fail';
  return 'none';
};

/** Recipient status counts limited to the columns the job projection tracks. */
export interface JobProjectionCounts {
  readonly recipientCount: number;
  readonly pendingCount: number;
  readonly submittedCount: number;
  readonly confirmedCount: number;
  readonly failedCount: number;
  readonly cancelledCount: number;
}

/**
 * Folds the transient `prepared` count into `pending` so the five projection
 * counts sum to the recipient total (the `distribution_job_projection` has no
 * `prepared` column, and both states are "not yet in flight"). This never loses
 * a recipient: the sum is conserved.
 */
export const toJobProjectionCounts = (counts: RecipientStatusCounts): JobProjectionCounts => ({
  recipientCount: counts.total,
  pendingCount: counts.pending + counts.prepared,
  submittedCount: counts.submitted,
  confirmedCount: counts.confirmed,
  failedCount: counts.failed,
  cancelledCount: counts.cancelled,
});

/**
 * True when the job still has required recipients that are pending or failed (or
 * in flight), so it must NOT be reported as fully successful. Mirrors the
 * database completion guard (Requirement 8.7).
 */
export const jobHasRequiredUnfinishedRecipients = (counts: RecipientStatusCounts): boolean =>
  counts.pending > 0 || counts.prepared > 0 || counts.submitted > 0 || counts.failed > 0;

/** ISO time `seconds` after `reconciledAt`, used for the read-model stale window. */
export const staleAfterIso = (
  reconciledAt: string,
  seconds: number = DEFAULT_STALE_WINDOW_SECONDS,
): string => new Date(Date.parse(reconciledAt) + seconds * 1000).toISOString();

// ---------------------------------------------------------------------------
// Distribution stores (injected).
// ---------------------------------------------------------------------------

export interface ConfirmRecipientParams {
  readonly recipientId: string;
  readonly transactionHash: string;
  readonly confirmedLedger: number;
  readonly correlationId: string;
}

export interface FailRecipientParams {
  readonly recipientId: string;
  readonly failureCode: string;
  readonly failureReason: string;
  readonly correlationId: string;
}

export interface RollUpJobParams {
  readonly jobId: string;
  readonly counts: JobProjectionCounts;
  readonly confirmedAmountStroops: number;
  readonly failedAmountStroops: number;
  readonly status: DistributionJobStatus;
  readonly correlationId: string;
}

/**
 * The durable per-recipient / per-job store. `distribution_recipients` and
 * `distribution_jobs` are CORE tables (not read-model projections), so their
 * transitions go through this store, not the narrow projection writer. Every
 * transition is guarded by the database status-transition triggers, so an
 * out-of-order or duplicate call fails closed rather than corrupting state.
 */
export interface DistributionRecipientStore {
  /** Loads one recipient row (the per-recipient terminal outcome record). */
  getRecipient(recipientId: string): Promise<DistributionRecipientRecord | null>;
  /**
   * Transitions a `submitted` recipient to `confirmed`, stamping the confirmed
   * transaction hash and ledger. Guarded by `status = 'submitted'` so it is
   * idempotent and never rewrites an already-confirmed recipient (Requirement 8.6).
   */
  confirmRecipient(params: ConfirmRecipientParams): Promise<void>;
  /**
   * Transitions a `submitted` recipient to `failed` with a PII-safe reason so it
   * becomes eligible for a later resume retry (Requirements 8.6, 8.8). Guarded by
   * `status = 'submitted'`.
   */
  failRecipient(params: FailRecipientParams): Promise<void>;
  /** All recipient rows for a job (for the job roll-up). */
  listJobRecipients(jobId: string): Promise<DistributionRecipientRecord[]>;
  /** Rolls up the core `distribution_jobs` counts and status after reconciliation. */
  rollUpJob(params: RollUpJobParams): Promise<void>;
  /** Current `distribution_job_projection.projection_version`, or null if unwritten. */
  currentJobProjectionVersion(jobId: string): Promise<number | null>;
}

// ---------------------------------------------------------------------------
// Cash distribution projector.
// ---------------------------------------------------------------------------

/**
 * Detects whether a recipient row's immutable identity disagrees with the
 * immutable intent it should belong to. A disagreement is an integrity problem
 * that must be quarantined rather than confirmed (never invent ownership).
 */
export const recipientDisagreesWithIntent = (
  recipient: DistributionRecipientRecord,
  intent: FinancialIntentRecord,
): boolean =>
  recipient.organization_id !== intent.organization_id ||
  recipient.program_id !== intent.program_id ||
  recipient.distribution_job_id !== intent.distribution_job_id ||
  recipient.beneficiary_identity_id !== intent.beneficiary_identity_id ||
  intent.amount_stroops === null ||
  recipient.amount_stroops !== intent.amount_stroops;

const mismatchResult = (
  recipientId: string,
  intent: FinancialIntentRecord,
  observed: ObservedLedgerTransaction,
  detail: string,
): ProjectionResult => ({
  kind: 'mismatch',
  mismatch: {
    issueType: 'projection_mismatch',
    severity: 'critical',
    subjectType: 'distribution_recipient',
    subjectIdentifier: recipientId,
    projectionTable: 'distribution_job_projection',
    programId: intent.program_id,
    projectionKey: { distribution_recipient_id: recipientId },
    expectedState: { detail, intent_amount_stroops: intent.amount_stroops },
    observedState: { transaction_hash: observed.transactionHash, successful: observed.successful },
  },
});

export interface CashDistributionProjectorDependencies {
  readonly recipients: DistributionRecipientStore;
}

/**
 * Builds the classic cash-rail {@link ReconciliationProjector} for per-recipient
 * DISTRIBUTIONS. On a confirmed-success observation of a `cash_distribution`
 * intent it reflects ledger truth into the durable recipient row
 * (`submitted -> confirmed`) while preserving every already-confirmed recipient,
 * and reports a mismatch — never inventing ownership — when the recipient row is
 * missing, disagrees with the intent, or is already confirmed against a
 * different transaction (Requirements 8.6, 18.6).
 *
 * It returns `unchanged` for the read-model WRITES: the reconciled
 * `distribution_job_projection` is written AFTER the run completes by
 * {@link createCashDistributionReconciler} (the projection trigger requires a
 * completed run's evidence). Non-distribution or non-cash intents are left to
 * their own projectors.
 */
export const createCashDistributionProjector = (
  deps: CashDistributionProjectorDependencies,
): ReconciliationProjector => ({
  async project(input: ProjectionInput): Promise<ProjectionResult> {
    const { intent, ledger, attempt, run } = input;

    // Only per-recipient cash distributions are handled here; other cash
    // operations (activation, payment) and the voucher rail have their own
    // projectors.
    if (intent === null || intent.operation_type !== 'cash_distribution') {
      return { kind: 'unchanged' };
    }
    const recipientId = intent.distribution_recipient_id;
    if (recipientId === null) {
      return { kind: 'unchanged' };
    }

    const recipient = await deps.recipients.getRecipient(recipientId);
    if (recipient === null) {
      return mismatchResult(recipientId, intent, ledger, 'recipient_row_missing');
    }
    if (recipientDisagreesWithIntent(recipient, intent)) {
      return mismatchResult(recipientId, intent, ledger, 'recipient_intent_disagreement');
    }

    // Preserve confirmed recipients: an already-confirmed recipient bound to the
    // SAME transaction is idempotent; a DIFFERENT hash is an integrity problem.
    if (recipient.status === 'confirmed') {
      if (recipient.transaction_hash === ledger.transactionHash) {
        return { kind: 'unchanged' };
      }
      return mismatchResult(recipientId, intent, ledger, 'confirmed_hash_conflict');
    }

    // Only a submitted recipient may be confirmed by reconciliation. Any other
    // state against a successful ledger is an integrity problem to quarantine.
    if (recipient.status !== 'submitted') {
      return mismatchResult(recipientId, intent, ledger, `recipient_not_submittable:${recipient.status}`);
    }

    await deps.recipients.confirmRecipient({
      recipientId,
      transactionHash: ledger.transactionHash,
      confirmedLedger: ledger.ledgerSequence,
      correlationId: run.correlationId,
    });
    safeLog('cash recipient confirmed by reconciliation', {
      correlationId: run.correlationId,
      recipientId,
      attemptId: attempt.id,
    });

    // The read-model job projection is written post-run with completed-run
    // evidence; the recipient row above is the durable per-recipient truth.
    return { kind: 'unchanged' };
  },
});

// ---------------------------------------------------------------------------
// Pure projection-row builders.
// ---------------------------------------------------------------------------

export interface DistributionJobProjectionInput {
  readonly jobId: string;
  readonly organizationId: string;
  readonly programId: string;
  readonly counts: JobProjectionCounts;
  readonly status: DistributionJobStatus;
  readonly totalAmountStroops: number;
  readonly confirmedAmountStroops: number;
  readonly failedAmountStroops: number;
  readonly confirmedTransactionCount: number;
  readonly reconciliationRunId: string;
  readonly asOfLedger: number;
  /** The run's `completed_at`; the projection's `reconciled_at` MUST equal it. */
  readonly reconciledAt: string;
  readonly network: WalletNetwork;
  /** The completed run's health; a `partial` run marks the read model stale. */
  readonly runStatus: 'completed' | 'partial';
  readonly projectionVersion: number;
  readonly staleWindowSeconds?: number;
}

/**
 * Builds the reconciled `distribution_job_projection` upsert row. It enforces the
 * database read-model invariants in the shape it produces: the five counts sum
 * to the recipient total, confirmed+failed amounts never exceed the total, the
 * stale window is strictly after the reconciliation time, and a `partial` run
 * always yields a stale read model (so the projection trigger accepts it).
 */
export const buildDistributionJobProjectionRow = (
  input: DistributionJobProjectionInput,
): DistributionJobProjectionInsert => {
  const isStale = input.runStatus === 'partial';
  return {
    distribution_job_id: input.jobId,
    organization_id: input.organizationId,
    program_id: input.programId,
    status: input.status,
    recipient_count: input.counts.recipientCount,
    pending_count: input.counts.pendingCount,
    submitted_count: input.counts.submittedCount,
    confirmed_count: input.counts.confirmedCount,
    failed_count: input.counts.failedCount,
    cancelled_count: input.counts.cancelledCount,
    total_amount_stroops: input.totalAmountStroops,
    confirmed_amount_stroops: input.confirmedAmountStroops,
    failed_amount_stroops: input.failedAmountStroops,
    confirmed_transaction_count: input.confirmedTransactionCount,
    latest_transaction_hash: null,
    latest_ledger_transaction_id: null,
    reconciliation_run_id: input.reconciliationRunId,
    as_of_ledger: input.asOfLedger,
    reconciled_at: input.reconciledAt,
    stale_after: staleAfterIso(input.reconciledAt, input.staleWindowSeconds),
    is_stale: isStale,
    stale_since: isStale ? input.reconciledAt : null,
    is_quarantined: false,
    quarantine_issue_id: null,
    projection_version: input.projectionVersion,
  };
};

export interface BeneficiaryCashBalanceInput {
  readonly organizationId: string;
  readonly programId: string;
  readonly beneficiaryIdentityId: string;
  readonly assetCode: string;
  readonly assetIssuer: string;
  /** Confirmed cash allocated to the beneficiary in this program (from enrollment). */
  readonly allocatedStroops: number;
  /** Sum of CONFIRMED cash distributed to the beneficiary in this program. */
  readonly distributedStroops: number;
  /** Confirmed cash the beneficiary has spent (redeemed) via merchant payments. */
  readonly redeemedStroops?: number;
  readonly refundedStroops?: number;
  readonly confirmedTransactionCount: number;
  readonly reconciliationRunId: string;
  readonly asOfLedger: number;
  readonly reconciledAt: string;
  readonly network: WalletNetwork;
  readonly runStatus: 'completed' | 'partial';
  readonly projectionVersion: number;
  readonly staleWindowSeconds?: number;
}

/**
 * Builds the reconciled `beneficiary_balance_projection` row for the CASH rail
 * from confirmed source totals (idempotent — computed from confirmed rows, never
 * incremented). Available balance is confirmed distributed minus confirmed
 * spend/refund, and is clamped at zero so the non-negative invariant always
 * holds. Provided as a pure helper so the reconciled-read task (14.1) reuses the
 * same computation the reconciler applies.
 */
export const buildBeneficiaryCashBalanceRow = (
  input: BeneficiaryCashBalanceInput,
): BeneficiaryBalanceProjectionInsert => {
  const redeemed = input.redeemedStroops ?? 0;
  const refunded = input.refundedStroops ?? 0;
  // A refunded merchant payment returns spendable cash to the beneficiary.
  const available = Math.max(0, input.distributedStroops - redeemed + refunded);
  const isStale = input.runStatus === 'partial';
  return {
    organization_id: input.organizationId,
    program_id: input.programId,
    beneficiary_identity_id: input.beneficiaryIdentityId,
    network: input.network,
    aid_type: 'cash',
    asset_code: input.assetCode,
    asset_issuer: input.assetIssuer,
    available_balance_stroops: available,
    allocated_stroops: input.allocatedStroops,
    distributed_stroops: input.distributedStroops,
    redeemed_stroops: redeemed,
    refunded_stroops: refunded,
    confirmed_transaction_count: input.confirmedTransactionCount,
    latest_transaction_hash: null,
    latest_ledger_transaction_id: null,
    latest_contract_event_id: null,
    reconciliation_run_id: input.reconciliationRunId,
    as_of_ledger: input.asOfLedger,
    reconciled_at: input.reconciledAt,
    stale_after: staleAfterIso(input.reconciledAt, input.staleWindowSeconds),
    is_stale: isStale,
    stale_since: isStale ? input.reconciledAt : null,
    is_quarantined: false,
    quarantine_issue_id: null,
    projection_version: input.projectionVersion,
  };
};

// ---------------------------------------------------------------------------
// Cash distribution reconciler (orchestration).
// ---------------------------------------------------------------------------


/** PII-safe failure recorded against a recipient whose on-chain transfer failed. */
export const OBSERVED_FAILURE_CODE = 'transfer_failed';
export const OBSERVED_FAILURE_REASON =
  'The on-chain transfer failed and is eligible for retry.';

/** Re-reads a completed reconciliation run for its projection evidence. */
export interface ReconciliationRunReader {
  load(runId: string): Promise<ReconciliationRunRecord | null>;
}

export interface CashDistributionReconcilerDependencies {
  /**
   * A reconciliation worker constructed with the cash observer
   * ({@link createCashTransactionObserver}) and the cash distribution projector
   * ({@link createCashDistributionProjector}).
   */
  readonly worker: ReconciliationWorker;
  readonly recipients: DistributionRecipientStore;
  /** Loads the immutable intent behind a failed attempt (to map it to a recipient). */
  readonly intents: { loadIntent(intentId: string): Promise<FinancialIntentRecord | null> };
  /** The narrow projection writer; used to write the job read model POST-run. */
  readonly projections: ProjectionWriterPort;
  /** Re-reads the completed run for its `completed_at` / `end_ledger_sequence`. */
  readonly runReader?: ReconciliationRunReader;
  readonly defaultStaleWindowSeconds?: number;
}

export interface CashDistributionReconcileRequest {
  readonly jobId: string;
  readonly organizationId: string;
  readonly programId: string;
  /** The job's total planned amount, in stroops (for the job read model). */
  readonly totalAmountStroops: number;
  /** The in-flight (`submitted`/`unknown`) attempts to reconcile for this job. */
  readonly attempts: readonly TransactionAttemptRecord[];
  readonly cursorValue?: string | null;
  readonly streamName?: string;
  readonly correlationId?: string;
  readonly staleWindowSeconds?: number;
  readonly network?: WalletNetwork;
}

export interface CashDistributionReconcileResult {
  readonly summary: ReconciliationRunSummary;
  /** The resolved terminal/interim job status (never `completed` while unfinished). */
  readonly jobStatus: DistributionJobStatus;
  readonly counts: RecipientStatusCounts;
  readonly confirmedAmountStroops: number;
  readonly failedAmountStroops: number;
  /** Recipients transitioned to `failed` by this pass. */
  readonly failedRecipientIds: readonly string[];
  /** Whether the reconciled job read model was written this pass. */
  readonly projectionWritten: boolean;
}

const sumAmountByStatus = (
  recipients: readonly DistributionRecipientRecord[],
  status: DistributionRecipientStatus,
): number =>
  recipients.reduce((total, recipient) => (recipient.status === status ? total + recipient.amount_stroops : total), 0);

/**
 * Builds the cash distribution reconciliation orchestrator. One pass:
 *
 *   1. runs the shared worker over the job's in-flight attempts (the injected
 *      cash observer reads Horizon; the cash projector confirms recipients on
 *      exact ledger success while preserving confirmed ones);
 *   2. transitions recipients whose attempt was observed to have FAILED on-chain
 *      to `failed`, so they become eligible for a later resume retry WITHOUT ever
 *      abandoning a real settlement (Requirement 8.6);
 *   3. rolls up the core job counts and status — `completed` ONLY when every
 *      recipient is confirmed, `partial_failed` when failures remain, otherwise
 *      still `reconciling` (Requirement 8.7);
 *   4. writes the reconciled `distribution_job_projection` read model with the
 *      completed run's evidence (a `partial` run yields a stale read model).
 *
 * It never re-drives confirmed or in-flight `submitted` recipients, and never
 * expires or reclaims confirmed cash.
 */
export const createCashDistributionReconciler = (deps: CashDistributionReconcilerDependencies) => {
  const reconcileJob = async (
    request: CashDistributionReconcileRequest,
  ): Promise<CashDistributionReconcileResult> => {
    const correlationId = request.correlationId ?? newCorrelationId();
    const network = request.network ?? PILOT_WALLET_NETWORK;
    const streamName = request.streamName ?? 'cash_distribution';

    // 1. Observe in-flight attempts. The projector confirms recipients on exact
    //    successful ledger evidence; the worker owns the confirmation invariants.
    const summary = await deps.worker.runStream({
      attempts: request.attempts,
      streamName,
      network,
      organizationId: request.organizationId,
      programId: request.programId,
      cursorValue: request.cursorValue ?? null,
      correlationId,
    } satisfies ReconciliationRunParams);

    // 2. Fail recipients whose attempt was observed to fail on-chain, so they are
    //    eligible for a resume retry. A confirmed/in-flight recipient is untouched.
    const failedRecipientIds: string[] = [];
    for (const attempt of request.attempts) {
      if (recipientOutcomeFor(summary.resolvedStatuses.get(attempt.id) ?? attempt.status) !== 'fail') {
        continue;
      }
      if (attempt.financial_intent_id === null) continue;
      const intent = await deps.intents.loadIntent(attempt.financial_intent_id);
      if (intent === null || intent.operation_type !== 'cash_distribution') continue;
      const recipientId = intent.distribution_recipient_id;
      if (recipientId === null) continue;
      await deps.recipients.failRecipient({
        recipientId,
        failureCode: OBSERVED_FAILURE_CODE,
        failureReason: OBSERVED_FAILURE_REASON,
        correlationId,
      });
      failedRecipientIds.push(recipientId);
    }

    // 3. Roll up the core job from the fresh recipient truth. `resolveTerminalJobStatus`
    //    never returns `completed` while any recipient is unfinished.
    const recipients = await deps.recipients.listJobRecipients(request.jobId);
    const counts = summarizeRecipientStatuses(recipients);
    const jobStatus = resolveTerminalJobStatus(counts);
    const confirmedAmountStroops = sumAmountByStatus(recipients, 'confirmed');
    const failedAmountStroops = sumAmountByStatus(recipients, 'failed');
    const projectionCounts = toJobProjectionCounts(counts);

    await deps.recipients.rollUpJob({
      jobId: request.jobId,
      counts: projectionCounts,
      confirmedAmountStroops,
      failedAmountStroops,
      status: jobStatus,
      correlationId,
    });

    // 4. Write the reconciled job read model with the COMPLETED run's evidence.
    let projectionWritten = false;
    const completedRun = deps.runReader ? await deps.runReader.load(summary.run.id) : null;
    if (
      completedRun !== null &&
      completedRun.completed_at !== null &&
      completedRun.end_ledger_sequence !== null &&
      completedRun.end_ledger_sequence > 0
    ) {
      const version = (await deps.recipients.currentJobProjectionVersion(request.jobId)) ?? 0;
      const row = buildDistributionJobProjectionRow({
        jobId: request.jobId,
        organizationId: request.organizationId,
        programId: request.programId,
        counts: projectionCounts,
        status: jobStatus,
        totalAmountStroops: request.totalAmountStroops,
        confirmedAmountStroops,
        failedAmountStroops,
        confirmedTransactionCount: counts.confirmed,
        reconciliationRunId: completedRun.id,
        asOfLedger: completedRun.end_ledger_sequence,
        reconciledAt: completedRun.completed_at,
        network,
        runStatus: summary.status === 'completed' ? 'completed' : 'partial',
        projectionVersion: version + 1,
        staleWindowSeconds: request.staleWindowSeconds ?? deps.defaultStaleWindowSeconds,
      });
      await deps.projections.write([
        { table: 'distribution_job_projection', rows: row, onConflict: 'distribution_job_id' },
      ]);
      projectionWritten = true;
    }

    return {
      summary,
      jobStatus,
      counts,
      confirmedAmountStroops,
      failedAmountStroops,
      failedRecipientIds,
      projectionWritten,
    };
  };

  return Object.freeze({ reconcileJob });
};

// ---------------------------------------------------------------------------
// Re-exports of the resumable-distribution finality primitives (Task 10.2).
// ---------------------------------------------------------------------------
//
// These are surfaced here so a cash reconciliation caller has the finality and
// partial-failure-recovery primitives in one place: which recipients a resume
// pass may re-drive (only `pending`/`failed`), and how the job status rolls up
// (never `completed` while any recipient is unfinished).

export { CASH_DISBURSEMENT_SCOPE } from './cash-disbursement.ts';
export {
    hasUnfinishedRecipients,
    isResumableRecipientStatus,
    resolveTerminalJobStatus,
    selectResumableRecipients,
    summarizeRecipientStatuses
} from './distribution.ts';


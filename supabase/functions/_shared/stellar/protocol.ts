// Reusable prepare / build / authorize / submit protocol.
//
// This module is the shared orchestration spine that every financial operation
// (cash activation, disbursement, merchant payment, voucher redemption, wallet
// rotation, refund) runs through. It composes the Task 6.1 security utilities
// (typed errors, redaction, the narrow append-only service writer, the
// idempotency claim) and the Task 6.2 clients/adapters (network guard, exact
// XDR parsing, isolated institutional signers) around the append-only
// `financial_intents` / `transaction_attempts` tables, and enforces — in one
// place — the invariants the design's "Prepare/Sign/Submit Protocol" requires:
//
//   1. Prepare   — validate and persist an IMMUTABLE financial intent bound to a
//                  canonical payload hash, through the narrow service writer,
//                  behind a business idempotency key. A replayed key never
//                  transfers value a second time; it reconciles the prior
//                  outcome instead.
//   2. Build     — construct the exact transaction (fresh ledger/sequence, and a
//                  Soroban simulation for the voucher rail), persist its prepared
//                  payload hash and ledger bounds as an `accepted` attempt bound
//                  to the intent's payload hash.
//   3. Authorize — return ONLY the exact beneficiary/merchant signing package.
//                  The client signs locally; the server never returns an
//                  institutional secret or a pre-assembled submittable envelope.
//   4. Submit    — parse the returned signed object bound to the configured
//                  network, verify every operation/auth field against the stored
//                  intent, add ONLY permitted institutional/sponsor signatures,
//                  submit through the guarded client, and mark the attempt
//                  `submitted` — NEVER `confirmed`. Only the reconciler may
//                  observe ledger evidence and transition to a terminal state.
//   5. Retry     — an unknown/pending submission is reconciled BEFORE any retry.
//                  A retry reuses the same intent (hence the same business
//                  idempotency key) and builds a fresh attempt with new
//                  sequence/auth data, so it either observes the original result
//                  or creates exactly one fresh equivalent attempt.
//
// Operation-specific transaction construction and field-by-field verification
// differ between the classic cash rail (fee-bump-wrapped, envelope signing) and
// the Soroban voucher rail (sponsor-sourced, auth-entry signing). Those details
// are provided by an injected {@link OperationProtocol} strategy; this module
// owns the invariants that must hold regardless of rail. Configuration and all
// I/O are injected, so the module reads no Deno globals and stays inside the
// project-wide type check and the unit-test harness.
//
// Validates: Requirements 3.6, 18.3, 18.4, 18.8, 20.6

import type { StellarTestnetConfig } from '../../../../shared/stellar-config.ts';
import type { Database, Json } from '../../../../src/types/database.types.ts';

import type { ServiceWriter, TypedSupabaseClient } from '../auth.ts';
import { FinancialErrorException, makeFinancialError, newCorrelationId } from '../errors.ts';
import { safeLog } from '../redaction.ts';

import {
    claimIdempotencyKey,
    type ClaimIdempotencyKeyParams,
    type FinancialOperationType,
    type IdempotencyClaim,
} from './idempotency.ts';
import { createNetworkGuard, type NetworkGuard } from './network-guard.ts';
import type { InstitutionalSignerRegistry } from './signers.ts';
import { parseTransactionEnvelope, type ParsedEnvelope } from './xdr.ts';

// ---------------------------------------------------------------------------
// Domain row/enum aliases.
// ---------------------------------------------------------------------------

export type FinancialIntentRecord = Database['public']['Tables']['financial_intents']['Row'];
export type FinancialIntentInsert = Database['public']['Tables']['financial_intents']['Insert'];
export type TransactionAttemptRecord = Database['public']['Tables']['transaction_attempts']['Row'];
export type TransactionAttemptInsert = Database['public']['Tables']['transaction_attempts']['Insert'];
export type AttemptStatus = Database['public']['Enums']['transaction_attempt_status'];
export type WalletNetwork = Database['public']['Enums']['wallet_network'];

export { type FinancialOperationType } from './idempotency.ts';

/** The single pilot network; attempts are always bound to it. */
export const PILOT_WALLET_NETWORK: WalletNetwork = 'stellar_testnet';

// A 32-byte hash rendered as 64 lowercase hex characters. Intent payload hashes
// and prepared payload hashes share this shape (mirrors the DB check).
const HEX_32_BYTES = /^[0-9a-f]{64}$/;

// ---------------------------------------------------------------------------
// Attempt state helpers (pure).
// ---------------------------------------------------------------------------

/** Statuses that represent a fully resolved attempt owned by the reconciler. */
export const TERMINAL_ATTEMPT_STATUSES: readonly AttemptStatus[] = Object.freeze([
  'observed_success',
  'observed_failure',
]);

/** Statuses that mean a submission is in flight and must be reconciled. */
export const PENDING_SUBMISSION_STATUSES: readonly AttemptStatus[] = Object.freeze([
  'submitted',
  'unknown',
]);

export const isTerminalAttemptStatus = (status: AttemptStatus): boolean =>
  (TERMINAL_ATTEMPT_STATUSES as readonly string[]).includes(status);

export const isPendingSubmissionStatus = (status: AttemptStatus): boolean =>
  (PENDING_SUBMISSION_STATUSES as readonly string[]).includes(status);

/** The attempt number for the next attempt of an intent (1-based, gap-free). */
export const nextAttemptNumber = (priorAttempts: readonly { attempt_number: number }[]): number => {
  let highest = 0;
  for (const attempt of priorAttempts) {
    if (attempt.attempt_number > highest) {
      highest = attempt.attempt_number;
    }
  }
  return highest + 1;
};

/**
 * Only an `accepted` attempt may be submitted. Submitting anything else would
 * either double-submit a live attempt or resurrect a resolved one, so this fails
 * closed with a typed error rather than proceeding.
 */
export const assertAttemptSubmittable = (
  attempt: Pick<TransactionAttemptRecord, 'status'>,
  correlationId: string,
): void => {
  if (attempt.status !== 'accepted') {
    throw FinancialErrorException.of(
      'validation_failed',
      'This transaction attempt is no longer awaiting submission.',
      { correlationId },
    );
  }
};

/**
 * Asserts a transaction's ledger bounds have not lapsed. A prepared transaction
 * whose `max_ledger` is at or below the current ledger can never be included, so
 * it must be rebuilt rather than submitted.
 */
export const assertWithinLedgerBounds = (
  bounds: Pick<TransactionAttemptRecord, 'min_ledger' | 'max_ledger'>,
  currentLedger: number,
  correlationId: string,
): void => {
  if (bounds.max_ledger !== null && currentLedger >= bounds.max_ledger) {
    throw FinancialErrorException.of(
      'validation_failed',
      'This prepared transaction has expired. Please prepare it again.',
      { correlationId },
    );
  }
};

export type RetryAction = 'build_fresh' | 'reconcile_first' | 'already_settled' | 'pending';

export interface RetryDecision {
  readonly action: RetryAction;
  /** The latest attempt the decision is based on, when one exists. */
  readonly latest: TransactionAttemptRecord | null;
}

/**
 * Classifies whether a retry may build a fresh attempt now, must reconcile a
 * prior in-flight submission first, or is already settled. This is the gate that
 * keeps retries safe (design Property 8): a submitted/unknown attempt is never
 * abandoned and re-sent without first observing its real outcome.
 */
export const classifyRetry = (latest: TransactionAttemptRecord | null): RetryDecision => {
  if (latest === null) {
    return { action: 'build_fresh', latest };
  }
  if (latest.status === 'observed_success') {
    return { action: 'already_settled', latest };
  }
  if (latest.status === 'observed_failure') {
    return { action: 'build_fresh', latest };
  }
  if (isPendingSubmissionStatus(latest.status)) {
    return { action: 'reconcile_first', latest };
  }
  // `accepted` — built but never submitted; it is safe to supersede.
  return { action: 'build_fresh', latest };
};

// ---------------------------------------------------------------------------
// Signing packages (the exact thing the client signs — never a secret).
// ---------------------------------------------------------------------------

export interface ClassicSigningPackage {
  readonly kind: 'classic_envelope';
  /** The unsigned inner transaction the beneficiary/merchant must sign. */
  readonly unsignedEnvelopeXdr: string;
  /** The transaction hash the client signs; binds the exact operations. */
  readonly transactionHash: string;
  /** The network the client must sign against. */
  readonly networkPassphrase: string;
}

export interface SorobanSigningPackage {
  readonly kind: 'soroban_auth_entry';
  /** The exact Soroban authorization entry the beneficiary must sign. */
  readonly unsignedAuthEntryXdr: string;
  readonly contractId: string;
  readonly functionName: string;
  /** The address that must authorize the invocation (the beneficiary wallet). */
  readonly authorizer: string;
  readonly signatureExpirationLedger: number;
  readonly networkPassphrase: string;
}

/** The exact client signing package returned by `authorize`. Carries no secret. */
export type SigningPackage = ClassicSigningPackage | SorobanSigningPackage;

/** The signed object a client returns for submission. */
export type SignedSubmission =
  | { readonly kind: 'classic_envelope'; readonly signedEnvelopeXdr: string }
  | { readonly kind: 'soroban_auth_entry'; readonly signedAuthEntryXdr: string };

// ---------------------------------------------------------------------------
// Build/verify strategy (operation-specific; injected).
// ---------------------------------------------------------------------------

/** Shared read-only context handed to a strategy for every step. */
export interface StrategyContext {
  readonly intent: FinancialIntentRecord;
  readonly config: StellarTestnetConfig;
  readonly guard: NetworkGuard;
  readonly signers: InstitutionalSignerRegistry;
  readonly correlationId: string;
}

/** The output of the build step: the exact transaction and its signing package. */
export interface BuildResult {
  readonly network: WalletNetwork;
  /** The full transaction envelope the server will ultimately submit. */
  readonly envelopeXdr: string;
  /** Lowercase-hex hash of the exact prepared payload (64 hex chars). */
  readonly preparedPayloadHash: string;
  readonly minLedger: number | null;
  readonly maxLedger: number | null;
  /** ONLY the client-signable portion; never institutional material. */
  readonly signingPackage: SigningPackage;
  /** Optional non-secret auth metadata persisted for reconciliation. */
  readonly authorizationPayload?: Json;
}

/** The fully-assembled, ready-to-submit transaction plus its submit thunk. */
export interface AssembledSubmission {
  /** The transaction hash that will appear on the ledger. */
  readonly transactionHash: string;
  /**
   * Submits the assembled transaction through the guarded client and resolves
   * once the network has ACCEPTED it. Resolving does not mean confirmed.
   */
  submit(): Promise<SubmissionAcceptance>;
}

export interface SubmissionAcceptance {
  readonly transactionHash: string;
  /** Optional provider result code, stored for diagnosis (never a secret). */
  readonly resultCode?: string | null;
}

export interface VerifyContext extends StrategyContext {
  readonly attempt: TransactionAttemptRecord;
  /** The parsed transaction the server built and will submit (network-bound). */
  readonly parsedBuiltEnvelope: ParsedEnvelope;
  readonly signed: SignedSubmission;
}

/**
 * Operation-specific transaction construction and verification. The engine calls
 * `build` during the build step and `verifyAndAssemble` during submit. A
 * strategy MUST:
 *   - in `build`, construct the exact transaction from fresh ledger/sequence
 *     (simulating Soroban operations for the voucher rail) and return only the
 *     client-signable package;
 *   - in `verifyAndAssemble`, compare EVERY operation/auth field of the returned
 *     signed object against the stored intent, reject any mismatch, add ONLY the
 *     permitted institutional/sponsor signatures, and return the submit thunk.
 * A strategy must never turn a submission into a confirmation.
 */
export interface OperationProtocol {
  readonly operationType: FinancialOperationType;
  build(context: StrategyContext): Promise<BuildResult>;
  verifyAndAssemble(context: VerifyContext): Promise<AssembledSubmission>;
}

// ---------------------------------------------------------------------------
// Persistence ports (injected; a default service-backed adapter is provided).
// ---------------------------------------------------------------------------

export interface IntentStore {
  /** Persists a new immutable financial intent and returns the stored row. */
  insertIntent(row: FinancialIntentInsert): Promise<FinancialIntentRecord>;
  /** Finds the intent already bound to an idempotency key, for replay. */
  findByIdempotencyKeyId(idempotencyKeyId: string): Promise<FinancialIntentRecord | null>;
}

export interface AttemptStore {
  /** Persists a new `accepted` attempt and returns the stored row. */
  insertAttempt(row: TransactionAttemptInsert): Promise<TransactionAttemptRecord>;
  /** All attempts for an intent, ordered by ascending attempt number. */
  listAttempts(intentId: string): Promise<TransactionAttemptRecord[]>;
  /** Transitions an `accepted` attempt to `submitted` after network acceptance. */
  markSubmitted(params: MarkSubmittedParams): Promise<void>;
}

export interface MarkSubmittedParams {
  readonly attemptId: string;
  readonly transactionHash: string;
  readonly resultCode?: string | null;
  readonly correlationId: string;
}

export interface ReconciliationGateway {
  /**
   * Observes ledger evidence for an in-flight attempt and returns its resolved
   * status. Implemented by the Task 6.4 reconciliation worker; injected here so
   * the retry gate can reconcile before building a fresh attempt.
   */
  reconcileAttempt(attempt: TransactionAttemptRecord): Promise<AttemptStatus>;
}

// ---------------------------------------------------------------------------
// Engine dependencies and result shapes.
// ---------------------------------------------------------------------------

export interface TransactionProtocolDependencies {
  readonly config: StellarTestnetConfig;
  /** Defaults to a guard built from `config`. */
  readonly guard?: NetworkGuard;
  readonly signers: InstitutionalSignerRegistry;
  readonly claim: (params: ClaimIdempotencyKeyParams) => Promise<IdempotencyClaim>;
  readonly intents: IntentStore;
  readonly attempts: AttemptStore;
  readonly reconciler: ReconciliationGateway;
  /** Injected clock; defaults to `Date`. */
  readonly clock?: () => Date;
  /** Injected id factory; defaults to `crypto.randomUUID`. */
  readonly newId?: () => string;
}

export interface PrepareRequest {
  readonly organizationId: string;
  readonly programId?: string | null;
  readonly operationType: FinancialOperationType;
  /** Idempotency namespace, e.g. `cash_distribution` or `voucher_redemption`. */
  readonly scope: string;
  /** Deterministic business idempotency key for the logical operation. */
  readonly idempotencyKey: string;
  /** Canonical payload hash of the requested operation (64 lowercase hex). */
  readonly payloadHash: string;
  readonly correlationId?: string;
  readonly amountStroops?: number | null;
  readonly assetCode?: string | null;
  readonly assetIssuer?: string | null;
  readonly beneficiaryIdentityId?: string | null;
  readonly distributionJobId?: string | null;
  readonly distributionRecipientId?: string | null;
  readonly requestedBy?: string | null;
  readonly requestMetadata?: Json;
}

export interface PreparedIntent {
  readonly intent: FinancialIntentRecord;
  readonly idempotency: IdempotencyClaim;
  /**
   * True when the idempotency key already existed for an identical request. The
   * intent is the prior one; callers must reconcile / return the prior outcome
   * rather than building a second transfer.
   */
  readonly isReplay: boolean;
}

export interface BuiltAttempt {
  readonly attempt: TransactionAttemptRecord;
  readonly build: BuildResult;
  /** ONLY the client-signable package. */
  readonly signingPackage: SigningPackage;
}

export interface SubmitResult {
  /** Always `submitted`; confirmation is reconciliation-owned. */
  readonly status: 'submitted';
  readonly attemptId: string;
  readonly transactionHash: string;
}

export type RetryOutcome =
  | { readonly settled: true; readonly attempt: TransactionAttemptRecord; readonly status: AttemptStatus }
  | { readonly settled: false; readonly built: BuiltAttempt };

export interface TransactionProtocol {
  prepare(request: PrepareRequest): Promise<PreparedIntent>;
  build(intent: FinancialIntentRecord, strategy: OperationProtocol): Promise<BuiltAttempt>;
  authorize(built: BuiltAttempt): SigningPackage;
  submit(
    context: { readonly intent: FinancialIntentRecord; readonly attempt: TransactionAttemptRecord },
    signed: SignedSubmission,
    strategy: OperationProtocol,
  ): Promise<SubmitResult>;
  retry(intent: FinancialIntentRecord, strategy: OperationProtocol): Promise<RetryOutcome>;
}

// ---------------------------------------------------------------------------
// Pure row builders.
// ---------------------------------------------------------------------------

const assertHex32 = (value: string, field: string, correlationId: string): void => {
  if (!HEX_32_BYTES.test(value)) {
    throw FinancialErrorException.of('validation_failed', `Invalid ${field}.`, {
      correlationId,
      fieldErrors: { [field]: ['must be a 64-character lowercase hex hash'] },
    });
  }
};

/**
 * Builds the immutable financial-intent insert row from a prepare request. The
 * intent captures the requested operation and its canonical payload hash and is
 * never mutated after insert (enforced by a DB trigger).
 */
export const buildIntentInsert = (
  request: PrepareRequest,
  idempotencyKeyId: string,
  correlationId: string,
  id: string,
  now: Date,
): FinancialIntentInsert => {
  assertHex32(request.payloadHash, 'payloadHash', correlationId);
  return {
    id,
    correlation_id: correlationId,
    idempotency_key_id: idempotencyKeyId,
    operation_type: request.operationType,
    organization_id: request.organizationId,
    payload_hash: request.payloadHash,
    program_id: request.programId ?? null,
    amount_stroops: request.amountStroops ?? null,
    asset_code: request.assetCode ?? null,
    asset_issuer: request.assetIssuer ?? null,
    beneficiary_identity_id: request.beneficiaryIdentityId ?? null,
    distribution_job_id: request.distributionJobId ?? null,
    distribution_recipient_id: request.distributionRecipientId ?? null,
    requested_by: request.requestedBy ?? null,
    request_metadata: request.requestMetadata ?? {},
    created_at: now.toISOString(),
  };
};

/**
 * Builds an `accepted` transaction-attempt insert row from a build result. The
 * attempt binds itself to the intent's payload hash (`intent_payload_hash`) and
 * records the exact prepared payload hash and ledger bounds — all immutable
 * after insert (enforced by a DB trigger). Confirmation stays reconciler-owned.
 */
export const buildAcceptedAttemptInsert = (
  intent: FinancialIntentRecord,
  build: BuildResult,
  attemptNumber: number,
  correlationId: string,
  id: string,
): TransactionAttemptInsert => {
  assertHex32(build.preparedPayloadHash, 'preparedPayloadHash', correlationId);
  assertHex32(intent.payload_hash, 'intentPayloadHash', correlationId);
  return {
    id,
    financial_intent_id: intent.id,
    organization_id: intent.organization_id,
    program_id: intent.program_id,
    distribution_job_id: intent.distribution_job_id,
    beneficiary_identity_id: intent.beneficiary_identity_id,
    correlation_id: correlationId,
    attempt_number: attemptNumber,
    status: 'accepted',
    network: build.network,
    intent_payload_hash: intent.payload_hash,
    prepared_payload_hash: build.preparedPayloadHash,
    envelope_xdr: build.envelopeXdr,
    authorization_payload: build.authorizationPayload ?? null,
    min_ledger: build.minLedger,
    max_ledger: build.maxLedger,
  };
};

// ---------------------------------------------------------------------------
// Engine.
// ---------------------------------------------------------------------------

const dependencyError = (correlationId: string, message: string): FinancialErrorException =>
  new FinancialErrorException(
    makeFinancialError('dependency_unavailable', message, { correlationId, retryable: true }),
  );

/**
 * Builds the reusable transaction protocol bound to a set of dependencies. The
 * returned object exposes the five protocol steps; operation-specific building
 * and verification are supplied per call via an {@link OperationProtocol}.
 */
export const createTransactionProtocol = (
  deps: TransactionProtocolDependencies,
): TransactionProtocol => {
  const guard = deps.guard ?? createNetworkGuard(deps.config);
  const clock = deps.clock ?? (() => new Date());
  const newId = deps.newId ?? (() => crypto.randomUUID());

  // Defense in depth: the injected configuration must be testnet before any
  // financial work is orchestrated.
  guard.assertTestnetConfig();

  const strategyContextFor = (
    intent: FinancialIntentRecord,
    correlationId: string,
  ): StrategyContext => ({
    intent,
    config: deps.config,
    guard,
    signers: deps.signers,
    correlationId,
  });

  const prepare = async (request: PrepareRequest): Promise<PreparedIntent> => {
    const correlationId = request.correlationId ?? newCorrelationId();
    assertHex32(request.payloadHash, 'payloadHash', correlationId);

    // The claim is the authoritative dedupe: an identical replay returns the
    // existing key; a reused key with different content throws a typed conflict.
    const idempotency = await deps.claim({
      organizationId: request.organizationId,
      programId: request.programId ?? null,
      scope: request.scope,
      idempotencyKey: request.idempotencyKey,
      payloadHash: request.payloadHash,
      operationType: request.operationType,
      correlationId,
    });

    if (idempotency.isReplay) {
      // Never persist a second intent for the same key; reconcile the prior one.
      const existing = await deps.intents.findByIdempotencyKeyId(idempotency.record.id);
      if (existing === null) {
        safeLog('idempotency replay without a persisted intent', {
          correlationId,
          idempotencyKeyId: idempotency.record.id,
        });
        throw dependencyError(correlationId, 'Unable to load the prior request right now.');
      }
      return { intent: existing, idempotency, isReplay: true };
    }

    const row = buildIntentInsert(request, idempotency.record.id, correlationId, newId(), clock());
    const intent = await deps.intents.insertIntent(row);
    return { intent, idempotency, isReplay: false };
  };

  const build = async (
    intent: FinancialIntentRecord,
    strategy: OperationProtocol,
  ): Promise<BuiltAttempt> => {
    const correlationId = intent.correlation_id;
    if (strategy.operationType !== intent.operation_type) {
      throw FinancialErrorException.of(
        'validation_failed',
        'The build strategy does not match the intent operation.',
        { correlationId },
      );
    }

    const priorAttempts = await deps.attempts.listAttempts(intent.id);
    const attemptNumber = nextAttemptNumber(priorAttempts);

    const result = await strategy.build(strategyContextFor(intent, correlationId));

    // The submitted transaction must be bound to the configured testnet; reject
    // anything else before it is ever persisted as submittable.
    guard.assertNetworkPassphrase(
      parseTransactionEnvelope(result.envelopeXdr, deps.config.networkPassphrase).networkPassphrase,
    );

    const row = buildAcceptedAttemptInsert(intent, result, attemptNumber, correlationId, newId());
    const attempt = await deps.attempts.insertAttempt(row);
    return { attempt, build: result, signingPackage: result.signingPackage };
  };

  // Authorize returns ONLY the exact client signing package. It is a pure
  // selection: the package carries no institutional secret and is never a
  // pre-assembled submittable envelope.
  const authorize = (built: BuiltAttempt): SigningPackage => built.signingPackage;

  const submit = async (
    context: { readonly intent: FinancialIntentRecord; readonly attempt: TransactionAttemptRecord },
    signed: SignedSubmission,
    strategy: OperationProtocol,
  ): Promise<SubmitResult> => {
    const { intent, attempt } = context;
    const correlationId = attempt.correlation_id;

    if (strategy.operationType !== intent.operation_type) {
      throw FinancialErrorException.of(
        'validation_failed',
        'The submit strategy does not match the intent operation.',
        { correlationId },
      );
    }
    // Only an attempt still awaiting submission may be submitted.
    assertAttemptSubmittable(attempt, correlationId);

    if (attempt.envelope_xdr === null) {
      throw dependencyError(correlationId, 'This attempt has no prepared transaction to submit.');
    }

    // Bind the transaction the server will submit to the configured network. A
    // foreign-network envelope is rejected here rather than reaching a host.
    const parsedBuiltEnvelope = parseTransactionEnvelope(
      attempt.envelope_xdr,
      deps.config.networkPassphrase,
    );

    // The strategy compares every operation/auth field to the stored intent and
    // adds ONLY institutional/sponsor signatures. It never adds client signing
    // material and never marks the attempt confirmed.
    const assembled = await strategy.verifyAndAssemble({
      ...strategyContextFor(intent, correlationId),
      attempt,
      parsedBuiltEnvelope,
      signed,
    });

    const acceptance = await assembled.submit();

    // Mark `submitted` ONLY after the network has accepted the transaction.
    // Confirmation remains reconciliation-owned.
    await deps.attempts.markSubmitted({
      attemptId: attempt.id,
      transactionHash: acceptance.transactionHash,
      resultCode: acceptance.resultCode ?? null,
      correlationId,
    });

    return { status: 'submitted', attemptId: attempt.id, transactionHash: acceptance.transactionHash };
  };

  const retry = async (
    intent: FinancialIntentRecord,
    strategy: OperationProtocol,
  ): Promise<RetryOutcome> => {
    const correlationId = intent.correlation_id;
    const priorAttempts = await deps.attempts.listAttempts(intent.id);
    const latest = priorAttempts.length === 0 ? null : priorAttempts[priorAttempts.length - 1];
    const decision = classifyRetry(latest);

    if (decision.action === 'already_settled' && decision.latest !== null) {
      return { settled: true, attempt: decision.latest, status: decision.latest.status };
    }

    if (decision.action === 'reconcile_first' && decision.latest !== null) {
      // A submitted/unknown attempt MUST be reconciled before any retry so a
      // real settlement is never abandoned and re-sent (design Property 8).
      const resolved = await deps.reconciler.reconcileAttempt(decision.latest);
      if (resolved === 'observed_success') {
        return { settled: true, attempt: decision.latest, status: resolved };
      }
      if (resolved !== 'observed_failure') {
        // Still in flight: the caller must wait and reconcile again, not retry.
        throw new FinancialErrorException(
          makeFinancialError(
            'submission_unknown',
            'The previous submission is still pending confirmation. Please try again shortly.',
            { correlationId, retryable: true },
          ),
        );
      }
      // observed_failure falls through to a fresh build.
    }

    // A retry reuses the same intent — and therefore the same business
    // idempotency key — and builds a fresh attempt with new sequence/auth data.
    const built = await build(intent, strategy);
    return { settled: false, built };
  };

  return Object.freeze({ prepare, build, authorize, submit, retry });
};

// ---------------------------------------------------------------------------
// Default service-backed adapters.
// ---------------------------------------------------------------------------
//
// These wire the injected ports to real persistence:
//   - immutable intent inserts and `accepted` attempt inserts go through the
//     Task 6.1 narrow append-only service writer (least privilege);
//   - read-backs and the `accepted -> submitted` transition use the service
//     client directly. That transition is the only permitted pre-confirmation
//     mutation (a DB trigger enforces the exact allowed status transitions and
//     keeps prepared-payload / intent links immutable), and confirmation stays
//     reconciler-owned.
//
// The service client bypasses RLS, so both are constructed server-side only and
// never handed to a caller.

export interface ServiceStoreDependencies {
  readonly serviceClient: TypedSupabaseClient;
  readonly serviceWriter: ServiceWriter;
  readonly correlationId?: string;
}

/** Builds an {@link IntentStore} backed by the narrow service writer + client. */
export const createServiceIntentStore = (deps: ServiceStoreDependencies): IntentStore => {
  const correlationId = deps.correlationId ?? newCorrelationId();

  const insertIntent = async (row: FinancialIntentInsert): Promise<FinancialIntentRecord> => {
    await deps.serviceWriter.appendRows('financial_intents', row);
    if (row.id === undefined) {
      throw dependencyError(correlationId, 'A financial intent id was not generated.');
    }
    const { data, error } = await deps.serviceClient
      .from('financial_intents')
      .select('*')
      .eq('id', row.id)
      .single();
    if (error || !data) {
      safeLog('failed to read back persisted financial intent', { correlationId, error });
      throw dependencyError(correlationId, 'Unable to record this request right now.');
    }
    return data;
  };

  const findByIdempotencyKeyId = async (
    idempotencyKeyId: string,
  ): Promise<FinancialIntentRecord | null> => {
    const { data, error } = await deps.serviceClient
      .from('financial_intents')
      .select('*')
      .eq('idempotency_key_id', idempotencyKeyId)
      .maybeSingle();
    if (error) {
      safeLog('failed to find intent by idempotency key', { correlationId, error });
      throw dependencyError(correlationId, 'Unable to load the prior request right now.');
    }
    return data ?? null;
  };

  return { insertIntent, findByIdempotencyKeyId };
};

/** Builds an {@link AttemptStore} backed by the narrow service writer + client. */
export const createServiceAttemptStore = (deps: ServiceStoreDependencies): AttemptStore => {
  const correlationId = deps.correlationId ?? newCorrelationId();

  const insertAttempt = async (
    row: TransactionAttemptInsert,
  ): Promise<TransactionAttemptRecord> => {
    await deps.serviceWriter.appendRows('transaction_attempts', row);
    if (row.id === undefined) {
      throw dependencyError(correlationId, 'A transaction attempt id was not generated.');
    }
    const { data, error } = await deps.serviceClient
      .from('transaction_attempts')
      .select('*')
      .eq('id', row.id)
      .single();
    if (error || !data) {
      safeLog('failed to read back persisted transaction attempt', { correlationId, error });
      throw dependencyError(correlationId, 'Unable to record this attempt right now.');
    }
    return data;
  };

  const listAttempts = async (intentId: string): Promise<TransactionAttemptRecord[]> => {
    const { data, error } = await deps.serviceClient
      .from('transaction_attempts')
      .select('*')
      .eq('financial_intent_id', intentId)
      .order('attempt_number', { ascending: true });
    if (error) {
      safeLog('failed to list transaction attempts', { correlationId, error });
      throw dependencyError(correlationId, 'Unable to load prior attempts right now.');
    }
    return data ?? [];
  };

  const markSubmitted = async (params: MarkSubmittedParams): Promise<void> => {
    // Guarded by `.eq('status', 'accepted')` so the transition is idempotent and
    // can only ever move an accepted attempt to submitted; the DB trigger sets
    // `submitted_at`/`updated_at` and rejects any other transition.
    const { error } = await deps.serviceClient
      .from('transaction_attempts')
      .update({
        status: 'submitted',
        transaction_hash: params.transactionHash,
        result_code: params.resultCode ?? null,
      })
      .eq('id', params.attemptId)
      .eq('status', 'accepted');
    if (error) {
      safeLog('failed to mark transaction attempt submitted', {
        correlationId: params.correlationId,
        error,
      });
      throw dependencyError(params.correlationId, 'Unable to record submission right now.');
    }
  };

  return { insertAttempt, listAttempts, markSubmitted };
};

/**
 * Convenience: builds the idempotency claim port bound to a service client. The
 * `claim_financial_idempotency_key` RPC is service-role only.
 */
export const createServiceIdempotencyClaim = (
  serviceClient: TypedSupabaseClient,
): ((params: ClaimIdempotencyKeyParams) => Promise<IdempotencyClaim>) =>
  (params: ClaimIdempotencyKeyParams) => claimIdempotencyKey(serviceClient, params);

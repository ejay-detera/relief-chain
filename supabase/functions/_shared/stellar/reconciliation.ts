// Shared reconciliation worker and projection writer.
//
// This module is the reconciliation spine described in the design's
// "Reconciliation Worker" and "State Machines" sections. Confirmed financial
// ownership lives on the ledger, never in a submission response, so this worker
// is the ONLY place that transitions an in-flight `transaction_attempts` row to a
// terminal `observed_success` / `observed_failure` state, and it does so ONLY
// after observing exact, successful, configured-network ledger evidence for the
// exact attempt (design Property 4 / Requirements 18.1, 18.8):
//
//   1. Observe   — a rail-specific {@link ReconciliationObserver} (the classic
//                  cash observer is added by Task 10.4, the Soroban voucher
//                  observer by Task 11.5) reports ledger evidence for a
//                  submitted/unknown attempt. A missing result never confirms; a
//                  submission alone never confirms.
//   2. Verify    — the observed network passphrase must equal the configured
//                  testnet passphrase and the observed transaction hash must
//                  equal the exact hash the attempt submitted. Any deviation
//                  raises a reconciliation issue and refuses to confirm.
//   3. Append    — observed transactions land in append-only
//                  `ledger_transactions` (deduplicated by `(network, tx_hash)`)
//                  and contract events land in append-only `contract_events`
//                  (deduplicated by `(contract_id, ledger, event_index)`), both
//                  through the Task 6.1 narrow service writer.
//   4. Transition— the attempt moves to `observed_success` / `observed_failure`
//                  (a submitted/unknown attempt that never lands becomes
//                  `unknown` so the retry gate reconciles again rather than
//                  re-sending).
//   5. Project   — a rail-specific {@link ReconciliationProjector} repairs the
//                  beneficiary/merchant/program/distribution read models, or
//                  reports a mismatch which is QUARANTINED: an issue is recorded
//                  through `record_reconciliation_issue` and the projection is
//                  written with `is_quarantined` referencing that issue. A
//                  mismatch never invents ownership (design Requirement 18.6).
//   6. Advance   — the reconciliation cursor advances monotonically through the
//                  `advance_reconciliation_cursor` RPC and every run is recorded
//                  in `reconciliation_runs` with lag and counts, driving the
//                  health/lag alerts (Requirements 18.5, 22.5, 22.6).
//
// This module implements the {@link ReconciliationGateway} that Task 6.3's
// protocol consumes, so a retry can reconcile an in-flight attempt before
// building a fresh one. It reads no Deno globals — configuration, clients, and
// every store are injected — so it stays inside the project-wide type check and
// the unit-test harness, and rail-specific observation/projection is supplied by
// the callers built in Tasks 10.4 and 11.5.
//
// Reconciliation stays readable during kill switches and dependency outages: it
// only READS ledger evidence and WRITES read models, so it never consults a
// submit-side kill switch, and an observer/dependency failure is caught per
// attempt — the run degrades to `partial`/`failed` and the attempt stays pending
// rather than ever being fabricated into a confirmation.
//
// Validates: Requirements 18.1, 18.5, 18.6, 18.7, 18.8, 22.5, 22.6

import type { StellarTestnetConfig } from '../../../../shared/stellar-config.ts';
import type { Database, Json } from '../../../../src/types/database.types.ts';

import type { ProjectionTable, ServiceWriter, TypedSupabaseClient } from '../auth.ts';
import { FinancialErrorException, makeFinancialError, newCorrelationId } from '../errors.ts';
import { safeLog } from '../redaction.ts';

import { createNetworkGuard, type NetworkGuard } from './network-guard.ts';
import {
    PILOT_WALLET_NETWORK,
    type AttemptStatus,
    type FinancialIntentRecord,
    type ReconciliationGateway,
    type TransactionAttemptRecord,
    type WalletNetwork,
} from './protocol.ts';

export { PILOT_WALLET_NETWORK } from './protocol.ts';
export type {
    AttemptStatus,
    FinancialIntentRecord,
    ReconciliationGateway,
    TransactionAttemptRecord,
    WalletNetwork
} from './protocol.ts';

// ---------------------------------------------------------------------------
// Domain row/enum aliases.
// ---------------------------------------------------------------------------

export type LedgerTransactionRecord = Database['public']['Tables']['ledger_transactions']['Row'];
export type LedgerTransactionInsert = Database['public']['Tables']['ledger_transactions']['Insert'];
export type ContractEventRecord = Database['public']['Tables']['contract_events']['Row'];
export type ContractEventInsert = Database['public']['Tables']['contract_events']['Insert'];
export type ReconciliationRunRecord = Database['public']['Tables']['reconciliation_runs']['Row'];
export type ReconciliationRunInsert = Database['public']['Tables']['reconciliation_runs']['Insert'];

export type ReconciliationRunStatus = Database['public']['Enums']['reconciliation_run_status'];
export type ReconciliationIssueType = Database['public']['Enums']['reconciliation_issue_type'];
export type ReconciliationIssueSeverity = Database['public']['Enums']['reconciliation_issue_severity'];

// A 32-byte value rendered as 64 lowercase hex characters (mirrors the DB check).
const HEX_64 = /^[0-9a-f]{64}$/;
const STELLAR_CONTRACT_ID = /^C[A-Z2-7]{55}$/;
// Contract event type / stream-name slug (mirrors the DB check).
const EVENT_TYPE_SLUG = /^[a-z0-9]+(?:[._:-][a-z0-9]+)*$/;

/** Statuses an in-flight attempt can carry into reconciliation. */
const IN_FLIGHT_STATUSES: ReadonlySet<AttemptStatus> = new Set(['submitted', 'unknown']);

export const isInFlightAttempt = (status: AttemptStatus): boolean => IN_FLIGHT_STATUSES.has(status);

const DEFAULT_MAX_LAG_SECONDS = 300;

// ---------------------------------------------------------------------------
// Observed ledger evidence (produced by an injected rail-specific observer).
// ---------------------------------------------------------------------------

/** Exact, untrusted ledger evidence for one observed transaction. */
export interface ObservedLedgerTransaction {
  /** The network passphrase the endpoint reported; verified against config. */
  readonly networkPassphrase: string;
  /** Lowercase-hex transaction hash (64 chars). */
  readonly transactionHash: string;
  readonly successful: boolean;
  readonly ledgerSequence: number;
  /** ISO-8601 ledger close time. */
  readonly ledgerClosedAt: string;
  readonly envelopeXdr: string;
  /** Lowercase-hex SHA-256 of the envelope (64 chars). */
  readonly envelopeSha256: string;
  readonly resultCode?: string | null;
  readonly resultXdr?: string | null;
  readonly errorCode?: string | null;
  readonly errorMessage?: string | null;
  readonly errorDetails?: Json;
}

/** Exact, untrusted evidence for one observed contract event. */
export interface ObservedContractEvent {
  readonly contractId: string;
  readonly ledgerSequence: number;
  readonly eventIndex: number;
  readonly eventType: string;
  readonly eventTopics: Json;
  readonly eventPayload: Json;
  readonly eventXdr: string;
  /** Lowercase-hex SHA-256 of the event (64 chars). */
  readonly eventSha256: string;
}

/**
 * The result of observing an in-flight attempt. `settled_success` is the ONLY
 * disposition that can confirm, and only after network/hash verification. A
 * `not_found` observation (never landed) becomes `unknown`; `still_pending`
 * leaves the attempt untouched. A submission response alone is never observed.
 */
export type AttemptObservation =
  | { readonly kind: 'settled_success'; readonly ledger: ObservedLedgerTransaction; readonly events: readonly ObservedContractEvent[] }
  | { readonly kind: 'settled_failure'; readonly ledger: ObservedLedgerTransaction }
  | { readonly kind: 'still_pending' }
  | { readonly kind: 'not_found' };

export type ObservationDisposition = 'observed_success' | 'observed_failure' | 'unknown' | 'pending';

/**
 * Pure classification of an observation into the attempt transition it implies.
 * `pending` means "make no transition". This is the invariant that keeps a
 * submission from ever confirming: only `settled_success` yields
 * `observed_success`.
 */
export const dispositionFor = (
  observation: AttemptObservation,
  current: AttemptStatus,
): ObservationDisposition => {
  switch (observation.kind) {
    case 'settled_success':
      return 'observed_success';
    case 'settled_failure':
      return 'observed_failure';
    case 'not_found':
      return current === 'submitted' ? 'unknown' : 'pending';
    case 'still_pending':
      return 'pending';
  }
};

// ---------------------------------------------------------------------------
// Pure helpers (fingerprint, lag, run health, row builders).
// ---------------------------------------------------------------------------

/** Deterministic canonical JSON with sorted object keys, for fingerprinting. */
export const stableStringify = (value: Json): string => {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item ?? null)).join(',')}]`;
  }
  const entries = Object.entries(value as { [key: string]: Json | undefined })
    .filter((entry): entry is [string, Json] => entry[1] !== undefined)
    .sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(',')}}`;
};

export interface MismatchFingerprintInput {
  readonly network: WalletNetwork;
  readonly issueType: ReconciliationIssueType;
  readonly subjectType: string;
  readonly subjectIdentifier: string;
  readonly projectionTable?: string | null;
  readonly projectionKey?: Json;
  readonly expectedState?: Json;
  readonly observedState?: Json;
}

/**
 * A stable 64-hex fingerprint deduplicating an issue by its evidence, so a
 * recurring mismatch increments an occurrence rather than spawning duplicates
 * (mirrors the `record_reconciliation_issue` dedupe key).
 */
export const computeMismatchFingerprint = async (
  input: MismatchFingerprintInput,
): Promise<string> => {
  const canonical = stableStringify({
    network: input.network,
    issue_type: input.issueType,
    subject_type: input.subjectType,
    subject_identifier: input.subjectIdentifier,
    projection_table: input.projectionTable ?? null,
    projection_key: input.projectionKey ?? {},
    expected_state: input.expectedState ?? {},
    observed_state: input.observedState ?? {},
  } as Json);
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

/**
 * Reconciliation lag in whole seconds between the newest observed ledger close
 * time and now. Returns null when nothing was observed and clamps negatives (a
 * ledger close in the near future from clock skew) to zero.
 */
export const computeLagSeconds = (
  newestLedgerClosedAt: string | null,
  now: Date,
): number | null => {
  if (newestLedgerClosedAt === null) {
    return null;
  }
  const closed = Date.parse(newestLedgerClosedAt);
  if (Number.isNaN(closed)) {
    return null;
  }
  return Math.max(0, Math.floor((now.getTime() - closed) / 1000));
};

export interface ReconciliationCounts {
  observedTransactions: number;
  observedEvents: number;
  confirmedIntents: number;
  failedIntents: number;
  mismatches: number;
  quarantined: number;
  /** Observations that threw or failed verification; the attempt stayed pending. */
  failedObservations: number;
}

export const emptyCounts = (): ReconciliationCounts => ({
  observedTransactions: 0,
  observedEvents: 0,
  confirmedIntents: 0,
  failedIntents: 0,
  mismatches: 0,
  quarantined: 0,
  failedObservations: 0,
});

export interface RunHealthOptions {
  readonly lagSeconds: number | null;
  readonly maxLagSeconds: number;
}

export interface RunHealth {
  /** Normal-path status; a fatal error is classified `failed` by the worker. */
  readonly status: Extract<ReconciliationRunStatus, 'completed' | 'partial'>;
  readonly alert: RunAlert | null;
}

export interface RunAlert {
  readonly severity: ReconciliationIssueSeverity;
  readonly reasons: readonly string[];
  readonly lagSeconds: number | null;
  readonly mismatchCount: number;
  readonly quarantinedCount: number;
  readonly failedObservations: number;
}

/**
 * Classifies run health from its counts and lag. Any mismatch, quarantine, or
 * failed observation degrades the run to `partial`; excess lag or any of those
 * conditions raises an alert (critical for mismatch/quarantine or lag beyond
 * twice the threshold, otherwise a warning).
 */
export const classifyRunHealth = (
  counts: ReconciliationCounts,
  options: RunHealthOptions,
): RunHealth => {
  const lag = options.lagSeconds;
  const overLag = lag !== null && lag > options.maxLagSeconds;
  const degraded = counts.mismatches > 0 || counts.quarantined > 0 || counts.failedObservations > 0;

  const reasons: string[] = [];
  if (overLag) reasons.push('reconciliation_lag');
  if (counts.mismatches > 0) reasons.push('projection_mismatch');
  if (counts.quarantined > 0) reasons.push('projection_quarantined');
  if (counts.failedObservations > 0) reasons.push('observation_failure');

  const critical =
    counts.mismatches > 0 ||
    counts.quarantined > 0 ||
    (lag !== null && lag > options.maxLagSeconds * 2);

  const alert: RunAlert | null =
    reasons.length === 0
      ? null
      : {
          severity: critical ? 'critical' : 'warning',
          reasons,
          lagSeconds: lag,
          mismatchCount: counts.mismatches,
          quarantinedCount: counts.quarantined,
          failedObservations: counts.failedObservations,
        };

  return { status: degraded ? 'partial' : 'completed', alert };
};

const assertHex64 = (value: string, field: string, correlationId: string): void => {
  if (!HEX_64.test(value)) {
    throw FinancialErrorException.of('reconciliation_failed', `Invalid ${field}.`, {
      correlationId,
      fieldErrors: { [field]: ['must be a 64-character lowercase hex value'] },
    });
  }
};

/**
 * Builds the append-only `ledger_transactions` insert from observed evidence.
 * Enforces the DB result invariant: a successful transaction carries no error,
 * and a failed transaction always carries an error code.
 */
export const buildLedgerTransactionInsert = (
  attempt: TransactionAttemptRecord,
  observed: ObservedLedgerTransaction,
  id: string,
  correlationId: string,
): LedgerTransactionInsert => {
  assertHex64(observed.transactionHash, 'transactionHash', correlationId);
  assertHex64(observed.envelopeSha256, 'envelopeSha256', correlationId);
  if (!Number.isInteger(observed.ledgerSequence) || observed.ledgerSequence <= 0) {
    throw FinancialErrorException.of('reconciliation_failed', 'Invalid ledger sequence.', {
      correlationId,
    });
  }
  const successful = observed.successful;
  return {
    id,
    organization_id: attempt.organization_id,
    program_id: attempt.program_id,
    financial_intent_id: attempt.financial_intent_id,
    transaction_attempt_id: attempt.id,
    network: attempt.network,
    transaction_hash: observed.transactionHash,
    envelope_xdr: observed.envelopeXdr,
    envelope_sha256: observed.envelopeSha256,
    ledger_sequence: observed.ledgerSequence,
    ledger_closed_at: observed.ledgerClosedAt,
    successful,
    result_code: observed.resultCode ?? null,
    result_xdr: observed.resultXdr ?? null,
    // A failed transaction must record an error code; default when the observer
    // could not classify one so the DB invariant always holds.
    error_code: successful ? null : observed.errorCode ?? 'tx_failed',
    error_message: successful ? null : observed.errorMessage ?? null,
    error_details: observed.errorDetails ?? {},
    correlation_id: correlationId,
  };
};

/** Builds the append-only `contract_events` insert bound to its ledger evidence. */
export const buildContractEventInsert = (
  attempt: TransactionAttemptRecord,
  observed: ObservedLedgerTransaction,
  event: ObservedContractEvent,
  ledgerTransactionId: string,
  id: string,
  correlationId: string,
): ContractEventInsert => {
  if (!STELLAR_CONTRACT_ID.test(event.contractId)) {
    throw FinancialErrorException.of('reconciliation_failed', 'Invalid contract id.', { correlationId });
  }
  if (!EVENT_TYPE_SLUG.test(event.eventType) || event.eventType.length > 100) {
    throw FinancialErrorException.of('reconciliation_failed', 'Invalid contract event type.', {
      correlationId,
    });
  }
  assertHex64(event.eventSha256, 'eventSha256', correlationId);
  if (!Number.isInteger(event.ledgerSequence) || event.ledgerSequence <= 0 || event.eventIndex < 0) {
    throw FinancialErrorException.of('reconciliation_failed', 'Invalid contract event position.', {
      correlationId,
    });
  }
  return {
    id,
    organization_id: attempt.organization_id,
    program_id: attempt.program_id,
    ledger_transaction_id: ledgerTransactionId,
    network: attempt.network,
    transaction_hash: observed.transactionHash,
    contract_id: event.contractId,
    ledger_sequence: event.ledgerSequence,
    event_index: event.eventIndex,
    event_type: event.eventType,
    event_topics: event.eventTopics,
    event_payload: event.eventPayload,
    event_xdr: event.eventXdr,
    event_sha256: event.eventSha256,
    correlation_id: correlationId,
  };
};

// ---------------------------------------------------------------------------
// Projection writes and the rail-specific projector.
// ---------------------------------------------------------------------------

/** A single projection upsert the worker will apply through the service writer. */
export interface ProjectionWrite {
  readonly table: ProjectionTable;
  readonly rows: Record<string, unknown> | readonly Record<string, unknown>[];
  readonly onConflict?: string;
}

/** Read-only run context handed to the projector for stamping reconciled rows. */
export interface ReconciliationRunContext {
  readonly runId: string;
  readonly network: WalletNetwork;
  /** ISO-8601 reconciliation time. */
  readonly reconciledAt: string;
  readonly asOfLedger: number;
  readonly correlationId: string;
}

export interface ProjectionInput {
  readonly attempt: TransactionAttemptRecord;
  /** The immutable intent, when it can be loaded; the projector may skip if null. */
  readonly intent: FinancialIntentRecord | null;
  readonly ledger: ObservedLedgerTransaction;
  readonly ledgerTransactionId: string;
  readonly events: readonly ObservedContractEvent[];
  readonly contractEventIds: readonly string[];
  readonly run: ReconciliationRunContext;
}

/** A projection disagreement with observed evidence — quarantined, never invented. */
export interface ProjectionMismatch {
  readonly issueType: ReconciliationIssueType;
  /** Defaults to `critical` when omitted, matching balance/projection mismatches. */
  readonly severity?: ReconciliationIssueSeverity;
  readonly subjectType: string;
  readonly subjectIdentifier: string;
  readonly projectionTable?: ProjectionTable | null;
  readonly programId?: string | null;
  readonly projectionKey?: Json;
  readonly expectedState?: Json;
  readonly observedState?: Json;
  /**
   * Builds the quarantine projection writes once the recorded issue id is known,
   * so the read model is written with `is_quarantined` / `quarantine_issue_id`
   * pointing at the issue that quarantined it.
   */
  readonly quarantine?: (issueId: string) => readonly ProjectionWrite[];
}

export type ProjectionResult =
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'repaired'; readonly writes: readonly ProjectionWrite[] }
  | { readonly kind: 'mismatch'; readonly mismatch: ProjectionMismatch };

/**
 * Rail-specific projector. The classic cash projector is added by Task 10.4 and
 * the Soroban voucher projector by Task 11.5; both repair the reconciled read
 * models or report a mismatch to be quarantined. A projector MUST NOT invent
 * ownership: when observed evidence disagrees with a projection it returns a
 * `mismatch` rather than overwriting confirmed value.
 */
export interface ReconciliationProjector {
  project(input: ProjectionInput): Promise<ProjectionResult>;
}

/**
 * Rail-specific observer. The classic cash observer is added by Task 10.4 and
 * the Soroban voucher observer by Task 11.5; both read Horizon/RPC through the
 * guarded clients and report exact evidence. An observer never confirms — it
 * only reports what the ledger shows.
 */
export interface ReconciliationObserver {
  observeAttempt(attempt: TransactionAttemptRecord): Promise<AttemptObservation>;
}

// ---------------------------------------------------------------------------
// Persistence ports (injected; default service-backed adapters provided below).
// ---------------------------------------------------------------------------

export interface EvidenceStore {
  /**
   * Appends observed ledger evidence, deduplicated by `(network, tx_hash)`.
   * Returns the stored row id and whether it was created by this call.
   */
  upsertLedgerTransaction(insert: LedgerTransactionInsert): Promise<{ id: string; created: boolean }>;
  /**
   * Appends an observed contract event, deduplicated by
   * `(network, contract_id, ledger, event_index)`.
   */
  upsertContractEvent(insert: ContractEventInsert): Promise<{ id: string; created: boolean }>;
}

export interface MarkObservedParams {
  readonly attemptId: string;
  readonly status: Extract<AttemptStatus, 'observed_success' | 'observed_failure' | 'unknown'>;
  readonly transactionHash?: string | null;
  readonly resultCode?: string | null;
  readonly errorCode?: string | null;
  readonly errorDetail?: string | null;
  readonly correlationId: string;
}

export interface ReconciliationStores {
  /** Lists in-flight (`submitted`/`unknown`) attempts to reconcile for a stream. */
  listPending(params: { readonly streamName: string; readonly limit: number }): Promise<TransactionAttemptRecord[]>;
  /** Loads the immutable intent behind an attempt (for projection). */
  loadIntent(intentId: string): Promise<FinancialIntentRecord | null>;
  /** Transitions an in-flight attempt to its observed terminal (or `unknown`) state. */
  markObserved(params: MarkObservedParams): Promise<void>;
  /** Inserts a `running` reconciliation run and returns it. */
  startRun(insert: ReconciliationRunInsert): Promise<ReconciliationRunRecord>;
  /** Completes a run with its final status, counts, cursor, lag, and any error. */
  completeRun(params: CompleteRunParams): Promise<void>;
}

export interface CompleteRunParams {
  readonly runId: string;
  readonly status: ReconciliationRunStatus;
  readonly counts: ReconciliationCounts;
  readonly cursorBefore?: string | null;
  readonly cursorAfter?: string | null;
  readonly startLedgerSequence?: number | null;
  readonly endLedgerSequence?: number | null;
  readonly lagSeconds?: number | null;
  readonly completedAt: string;
  readonly errorCode?: string | null;
  readonly errorMessage?: string | null;
  readonly errorDetails?: Json;
  readonly correlationId: string;
}

export interface AdvanceCursorParams {
  readonly network: WalletNetwork;
  readonly streamName: string;
  readonly cursorValue: string;
  readonly lastLedgerSequence: number;
  readonly lastLedgerClosedAt: string;
  readonly correlationId: string;
}

export interface CursorGateway {
  /** Advances the monotonic reconciliation cursor via the service-only RPC. */
  advance(params: AdvanceCursorParams): Promise<void>;
}

export interface RecordIssueParams {
  readonly reconciliationRunId: string;
  readonly organizationId: string;
  readonly programId?: string | null;
  readonly ledgerTransactionId?: string | null;
  readonly contractEventId?: string | null;
  readonly network: WalletNetwork;
  readonly issueType: ReconciliationIssueType;
  readonly severity: ReconciliationIssueSeverity;
  readonly subjectType: string;
  readonly subjectIdentifier: string;
  readonly projectionTable?: string | null;
  readonly projectionKey?: Json;
  readonly expectedState?: Json;
  readonly observedState?: Json;
  readonly mismatchFingerprint: string;
  readonly detectedAt: string;
  readonly correlationId: string;
}

export interface IssueGateway {
  /** Records (or dedupes) a reconciliation issue and returns its id. */
  record(params: RecordIssueParams): Promise<string>;
}

export interface ProjectionWriterPort {
  /** Applies projection upserts through the narrow service writer. */
  write(writes: readonly ProjectionWrite[]): Promise<void>;
}

export interface ReconciliationAlert extends RunAlert {
  readonly runId: string;
  readonly streamName: string;
  readonly network: WalletNetwork;
  readonly correlationId: string;
}

export interface AlertSink {
  emit(alert: ReconciliationAlert): void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Worker.
// ---------------------------------------------------------------------------

export interface ReconciliationRunParams {
  /** The in-flight attempts to reconcile in this run. */
  readonly attempts: readonly TransactionAttemptRecord[];
  /** The reconciliation stream (a slug); also the cursor key when advancing. */
  readonly streamName: string;
  readonly network?: WalletNetwork;
  readonly organizationId?: string | null;
  readonly programId?: string | null;
  /** When present (and progress is made), advances the cursor to this value. */
  readonly cursorValue?: string | null;
  readonly cursorBefore?: string | null;
  readonly correlationId?: string;
  readonly maxLagSeconds?: number;
}

export interface ReconciliationRunSummary {
  readonly run: ReconciliationRunRecord;
  readonly status: ReconciliationRunStatus;
  readonly counts: ReconciliationCounts;
  readonly lagSeconds: number | null;
  readonly resolvedStatuses: ReadonlyMap<string, AttemptStatus>;
  readonly alert: ReconciliationAlert | null;
}

/** The reconciliation worker also satisfies the protocol's gateway contract. */
export interface ReconciliationWorker extends ReconciliationGateway {
  reconcileAttempt(attempt: TransactionAttemptRecord): Promise<AttemptStatus>;
  runStream(params: ReconciliationRunParams): Promise<ReconciliationRunSummary>;
}

export interface ReconciliationWorkerDependencies {
  readonly config: StellarTestnetConfig;
  /** Defaults to a guard built from `config`. */
  readonly guard?: NetworkGuard;
  readonly observer: ReconciliationObserver;
  readonly projector: ReconciliationProjector;
  readonly evidence: EvidenceStore;
  readonly stores: ReconciliationStores;
  readonly cursors: CursorGateway;
  readonly issues: IssueGateway;
  readonly projections: ProjectionWriterPort;
  readonly alerts?: AlertSink;
  /** Injected clock; defaults to `Date`. */
  readonly clock?: () => Date;
  /** Injected id factory; defaults to `crypto.randomUUID`. */
  readonly newId?: () => string;
  readonly defaultMaxLagSeconds?: number;
}

// Mutable ledger high-water mark tracked across a run for lag and cursor.
interface LedgerWatermark {
  sequence: number;
  closedAt: string | null;
}

/**
 * Builds the shared reconciliation worker bound to a set of dependencies. The
 * worker owns the confirmation invariants; rail-specific observation and
 * projection are injected.
 */
export const createReconciliationWorker = (
  deps: ReconciliationWorkerDependencies,
): ReconciliationWorker => {
  const guard = deps.guard ?? createNetworkGuard(deps.config);
  const clock = deps.clock ?? (() => new Date());
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const defaultMaxLag = deps.defaultMaxLagSeconds ?? DEFAULT_MAX_LAG_SECONDS;

  // Defense in depth: reconciliation only ever accepts testnet evidence.
  guard.assertTestnetConfig();

  /**
   * Records an integrity issue (wrong network / hash) and refuses to confirm. A
   * wrong-network or wrong-hash observation can never satisfy confirmation, so
   * this raises an operational alert via the issue and leaves the attempt in
   * flight rather than fabricating a confirmation.
   */
  const recordIntegrityIssue = async (
    run: ReconciliationRunContext,
    attempt: TransactionAttemptRecord,
    issueType: ReconciliationIssueType,
    expectedState: Json,
    observedState: Json,
  ): Promise<void> => {
    const fingerprint = await computeMismatchFingerprint({
      network: attempt.network,
      issueType,
      subjectType: 'transaction_attempt',
      subjectIdentifier: attempt.id,
      expectedState,
      observedState,
    });
    await deps.issues.record({
      reconciliationRunId: run.runId,
      organizationId: attempt.organization_id,
      programId: attempt.program_id,
      network: attempt.network,
      issueType,
      severity: 'critical',
      subjectType: 'transaction_attempt',
      subjectIdentifier: attempt.id,
      projectionKey: {},
      expectedState,
      observedState,
      mismatchFingerprint: fingerprint,
      detectedAt: run.reconciledAt,
      correlationId: run.correlationId,
    });
  };

  /**
   * Ingests a settled-success observation: verifies network/hash, appends ledger
   * and event evidence (deduplicated), projects (repairing or quarantining), and
   * transitions the attempt to `observed_success`. Returns the resolved status.
   */
  const ingestSuccess = async (
    attempt: TransactionAttemptRecord,
    observation: Extract<AttemptObservation, { kind: 'settled_success' }>,
    run: ReconciliationRunContext,
    counts: ReconciliationCounts,
    watermark: LedgerWatermark,
  ): Promise<AttemptStatus> => {
    const observed = observation.ledger;

    // Verify configured network first; a foreign network can never confirm.
    guard.assertNetworkPassphrase(observed.networkPassphrase);

    // Verify the exact submitted transaction. A mismatched hash is an integrity
    // problem: raise an issue and refuse to confirm.
    if (attempt.transaction_hash !== null && observed.transactionHash !== attempt.transaction_hash) {
      await recordIntegrityIssue(
        run,
        attempt,
        'transaction_mismatch',
        { transaction_hash: attempt.transaction_hash },
        { transaction_hash: observed.transactionHash },
      );
      counts.mismatches += 1;
      return attempt.status;
    }

    const ledger = await deps.evidence.upsertLedgerTransaction(
      buildLedgerTransactionInsert(attempt, observed, newId(), run.correlationId),
    );
    counts.observedTransactions += 1;

    const contractEventIds: string[] = [];
    for (const event of observation.events) {
      const stored = await deps.evidence.upsertContractEvent(
        buildContractEventInsert(attempt, observed, event, ledger.id, newId(), run.correlationId),
      );
      contractEventIds.push(stored.id);
      counts.observedEvents += 1;
    }

    const projection = await deps.projector.project({
      attempt,
      intent: attempt.financial_intent_id ? await deps.stores.loadIntent(attempt.financial_intent_id) : null,
      ledger: observed,
      ledgerTransactionId: ledger.id,
      events: observation.events,
      contractEventIds,
      run,
    });

    if (projection.kind === 'mismatch') {
      const mismatch = projection.mismatch;
      const fingerprint = await computeMismatchFingerprint({
        network: attempt.network,
        issueType: mismatch.issueType,
        subjectType: mismatch.subjectType,
        subjectIdentifier: mismatch.subjectIdentifier,
        projectionTable: mismatch.projectionTable ?? null,
        projectionKey: mismatch.projectionKey,
        expectedState: mismatch.expectedState,
        observedState: mismatch.observedState,
      });
      const issueId = await deps.issues.record({
        reconciliationRunId: run.runId,
        organizationId: attempt.organization_id,
        programId: mismatch.programId ?? attempt.program_id,
        ledgerTransactionId: ledger.id,
        network: attempt.network,
        issueType: mismatch.issueType,
        severity: mismatch.severity ?? 'critical',
        subjectType: mismatch.subjectType,
        subjectIdentifier: mismatch.subjectIdentifier,
        projectionTable: mismatch.projectionTable ?? null,
        projectionKey: mismatch.projectionKey ?? {},
        expectedState: mismatch.expectedState ?? {},
        observedState: mismatch.observedState ?? {},
        mismatchFingerprint: fingerprint,
        detectedAt: run.reconciledAt,
        correlationId: run.correlationId,
      });
      counts.mismatches += 1;
      counts.quarantined += 1;
      if (mismatch.quarantine) {
        await deps.projections.write(mismatch.quarantine(issueId));
      }
    } else if (projection.kind === 'repaired') {
      await deps.projections.write(projection.writes);
    }

    // The attempt reflects ledger truth even if a read model was quarantined.
    await deps.stores.markObserved({
      attemptId: attempt.id,
      status: 'observed_success',
      transactionHash: observed.transactionHash,
      resultCode: observed.resultCode ?? null,
      correlationId: run.correlationId,
    });
    counts.confirmedIntents += 1;
    advanceWatermark(watermark, observed);
    return 'observed_success';
  };

  const ingestFailure = async (
    attempt: TransactionAttemptRecord,
    observation: Extract<AttemptObservation, { kind: 'settled_failure' }>,
    run: ReconciliationRunContext,
    counts: ReconciliationCounts,
    watermark: LedgerWatermark,
  ): Promise<AttemptStatus> => {
    const observed = observation.ledger;
    guard.assertNetworkPassphrase(observed.networkPassphrase);
    await deps.evidence.upsertLedgerTransaction(
      buildLedgerTransactionInsert(attempt, observed, newId(), run.correlationId),
    );
    counts.observedTransactions += 1;
    await deps.stores.markObserved({
      attemptId: attempt.id,
      status: 'observed_failure',
      transactionHash: observed.transactionHash,
      resultCode: observed.resultCode ?? null,
      errorCode: observed.errorCode ?? 'tx_failed',
      errorDetail: observed.errorMessage ?? null,
      correlationId: run.correlationId,
    });
    counts.failedIntents += 1;
    advanceWatermark(watermark, observed);
    return 'observed_failure';
  };

  const reconcileWithinRun = async (
    attempt: TransactionAttemptRecord,
    run: ReconciliationRunContext,
    counts: ReconciliationCounts,
    watermark: LedgerWatermark,
  ): Promise<AttemptStatus> => {
    if (!isInFlightAttempt(attempt.status)) {
      // Idempotent: an already-terminal attempt is never re-observed.
      return attempt.status;
    }

    const observation = await deps.observer.observeAttempt(attempt);
    const disposition = dispositionFor(observation, attempt.status);

    if (observation.kind === 'settled_success') {
      return ingestSuccess(attempt, observation, run, counts, watermark);
    }
    if (observation.kind === 'settled_failure') {
      return ingestFailure(attempt, observation, run, counts, watermark);
    }
    if (disposition === 'unknown') {
      // Submitted but never landed: move to `unknown` so the retry gate
      // reconciles again rather than re-sending.
      await deps.stores.markObserved({
        attemptId: attempt.id,
        status: 'unknown',
        correlationId: run.correlationId,
      });
      return 'unknown';
    }
    // still pending: no transition.
    return attempt.status;
  };

  const runStream = async (params: ReconciliationRunParams): Promise<ReconciliationRunSummary> => {
    const correlationId = params.correlationId ?? newCorrelationId();
    const network = params.network ?? PILOT_WALLET_NETWORK;
    const maxLagSeconds = params.maxLagSeconds ?? defaultMaxLag;
    const startedAt = clock().toISOString();

    const runRecord = await deps.stores.startRun({
      id: newId(),
      stream_name: params.streamName,
      network,
      status: 'running',
      started_at: startedAt,
      organization_id: params.organizationId ?? null,
      program_id: params.programId ?? null,
      cursor_before: params.cursorBefore ?? null,
      correlation_id: correlationId,
    });

    const counts = emptyCounts();
    const watermark: LedgerWatermark = { sequence: 0, closedAt: null };
    const resolvedStatuses = new Map<string, AttemptStatus>();

    try {
      for (const attempt of params.attempts) {
        const runContext: ReconciliationRunContext = {
          runId: runRecord.id,
          network,
          reconciledAt: clock().toISOString(),
          asOfLedger: attempt.max_ledger ?? 0,
          correlationId,
        };
        try {
          const status = await reconcileWithinRun(attempt, runContext, counts, watermark);
          resolvedStatuses.set(attempt.id, status);
        } catch (error) {
          // One attempt's failure (observer/RPC/verification) must not block the
          // rest; the attempt stays in flight and the run degrades to partial.
          counts.failedObservations += 1;
          resolvedStatuses.set(attempt.id, attempt.status);
          safeLog('reconciliation attempt failed', {
            correlationId,
            attemptId: attempt.id,
            streamName: params.streamName,
            error,
          });
        }
      }

      const now = clock();
      const lagSeconds = computeLagSeconds(watermark.closedAt, now);

      // Advance the monotonic cursor only when a cursor value is supplied and
      // real progress was observed.
      const cursorAfter =
        params.cursorValue != null && watermark.sequence > 0 && watermark.closedAt !== null
          ? params.cursorValue
          : null;
      if (cursorAfter !== null && watermark.closedAt !== null) {
        await deps.cursors.advance({
          network,
          streamName: params.streamName,
          cursorValue: cursorAfter,
          lastLedgerSequence: watermark.sequence,
          lastLedgerClosedAt: watermark.closedAt,
          correlationId,
        });
      }

      const health = classifyRunHealth(counts, { lagSeconds, maxLagSeconds });
      await deps.stores.completeRun({
        runId: runRecord.id,
        status: health.status,
        counts,
        cursorBefore: params.cursorBefore ?? null,
        cursorAfter,
        endLedgerSequence: watermark.sequence > 0 ? watermark.sequence : null,
        lagSeconds,
        completedAt: now.toISOString(),
        correlationId,
      });

      const alert: ReconciliationAlert | null = health.alert
        ? { ...health.alert, runId: runRecord.id, streamName: params.streamName, network, correlationId }
        : null;
      if (alert !== null && deps.alerts) {
        try {
          await deps.alerts.emit(alert);
        } catch (error) {
          // Alerting is best-effort; a sink failure never fails reconciliation.
          safeLog('reconciliation alert emit failed', { correlationId, error });
        }
      }

      return {
        run: runRecord,
        status: health.status,
        counts,
        lagSeconds,
        resolvedStatuses,
        alert,
      };
    } catch (error) {
      // A fatal error before completion marks the run failed with an error code
      // (never silently left running), then rethrows for the caller.
      const now = clock();
      const financial = error instanceof FinancialErrorException
        ? error.financialError
        : makeFinancialError('reconciliation_failed', 'Reconciliation could not complete.', {
            correlationId,
          });
      await deps.stores
        .completeRun({
          runId: runRecord.id,
          status: 'failed',
          counts,
          cursorBefore: params.cursorBefore ?? null,
          cursorAfter: null,
          lagSeconds: computeLagSeconds(watermark.closedAt, now),
          completedAt: now.toISOString(),
          errorCode: financial.code,
          errorMessage: financial.message,
          correlationId,
        })
        .catch((completionError) =>
          safeLog('reconciliation run completion failed', { correlationId, completionError }),
        );
      throw error;
    }
  };

  const reconcileAttempt = async (attempt: TransactionAttemptRecord): Promise<AttemptStatus> => {
    if (!isInFlightAttempt(attempt.status)) {
      return attempt.status;
    }
    // The gateway path reconciles exactly one attempt within its own run so
    // issue recording and quarantine always have run context.
    const summary = await runStream({
      attempts: [attempt],
      streamName: 'gateway_retry',
      network: attempt.network,
      organizationId: attempt.organization_id,
      programId: attempt.program_id,
      correlationId: attempt.correlation_id,
    });
    return summary.resolvedStatuses.get(attempt.id) ?? attempt.status;
  };

  return Object.freeze({ reconcileAttempt, runStream });
};

const advanceWatermark = (watermark: LedgerWatermark, observed: ObservedLedgerTransaction): void => {
  if (observed.ledgerSequence > watermark.sequence) {
    watermark.sequence = observed.ledgerSequence;
    watermark.closedAt = observed.ledgerClosedAt;
  } else if (watermark.closedAt === null) {
    watermark.closedAt = observed.ledgerClosedAt;
  }
};

// ---------------------------------------------------------------------------
// Default service-backed adapters.
// ---------------------------------------------------------------------------
//
// These wire the injected ports to real persistence:
//   - observed ledger/event evidence is appended through the Task 6.1 narrow
//     append-only service writer (deduplicated first via a service-client read);
//   - the attempt observation transition, run lifecycle, and intent read use the
//     service client directly (the only permitted reconciliation mutations, all
//     guarded by the DB transition triggers);
//   - the cursor advance and issue record go through the service-only RPCs.
//
// The service client bypasses RLS, so these are constructed server-side only and
// never handed to a caller.

const reconciliationDependencyError = (
  correlationId: string,
  message: string,
): FinancialErrorException =>
  new FinancialErrorException(
    makeFinancialError('reconciliation_failed', message, { correlationId, retryable: true }),
  );

export interface ServiceReconciliationDependencies {
  readonly serviceClient: TypedSupabaseClient;
  readonly serviceWriter: ServiceWriter;
  readonly correlationId?: string;
}

/** Builds an {@link EvidenceStore} that dedupes then appends via the service writer. */
export const createServiceEvidenceStore = (deps: ServiceReconciliationDependencies): EvidenceStore => {
  const correlationId = deps.correlationId ?? newCorrelationId();

  const upsertLedgerTransaction = async (
    insert: LedgerTransactionInsert,
  ): Promise<{ id: string; created: boolean }> => {
    const { data: existing, error: readError } = await deps.serviceClient
      .from('ledger_transactions')
      .select('id')
      .eq('network', insert.network ?? PILOT_WALLET_NETWORK)
      .eq('transaction_hash', insert.transaction_hash)
      .maybeSingle();
    if (readError) {
      safeLog('failed to read existing ledger transaction', { correlationId, error: readError });
      throw reconciliationDependencyError(correlationId, 'Unable to read ledger evidence right now.');
    }
    if (existing) {
      return { id: existing.id, created: false };
    }
    if (insert.id === undefined) {
      throw reconciliationDependencyError(correlationId, 'A ledger transaction id was not generated.');
    }
    await deps.serviceWriter.appendRows('ledger_transactions', insert);
    return { id: insert.id, created: true };
  };

  const upsertContractEvent = async (
    insert: ContractEventInsert,
  ): Promise<{ id: string; created: boolean }> => {
    const { data: existing, error: readError } = await deps.serviceClient
      .from('contract_events')
      .select('id')
      .eq('network', insert.network ?? PILOT_WALLET_NETWORK)
      .eq('contract_id', insert.contract_id)
      .eq('ledger_sequence', insert.ledger_sequence)
      .eq('event_index', insert.event_index)
      .maybeSingle();
    if (readError) {
      safeLog('failed to read existing contract event', { correlationId, error: readError });
      throw reconciliationDependencyError(correlationId, 'Unable to read contract evidence right now.');
    }
    if (existing) {
      return { id: existing.id, created: false };
    }
    if (insert.id === undefined) {
      throw reconciliationDependencyError(correlationId, 'A contract event id was not generated.');
    }
    await deps.serviceWriter.appendRows('contract_events', insert);
    return { id: insert.id, created: true };
  };

  return { upsertLedgerTransaction, upsertContractEvent };
};

/** Builds the {@link ReconciliationStores} backed by the service client. */
export const createServiceReconciliationStores = (
  deps: ServiceReconciliationDependencies,
): ReconciliationStores => {
  const correlationId = deps.correlationId ?? newCorrelationId();

  const listPending: ReconciliationStores['listPending'] = async ({ limit }) => {
    const { data, error } = await deps.serviceClient
      .from('transaction_attempts')
      .select('*')
      .in('status', ['submitted', 'unknown'])
      .order('updated_at', { ascending: true })
      .limit(limit);
    if (error) {
      safeLog('failed to list pending attempts', { correlationId, error });
      throw reconciliationDependencyError(correlationId, 'Unable to load pending attempts right now.');
    }
    return data ?? [];
  };

  const loadIntent = async (intentId: string): Promise<FinancialIntentRecord | null> => {
    const { data, error } = await deps.serviceClient
      .from('financial_intents')
      .select('*')
      .eq('id', intentId)
      .maybeSingle();
    if (error) {
      safeLog('failed to load intent for reconciliation', { correlationId, error });
      throw reconciliationDependencyError(correlationId, 'Unable to load the intent right now.');
    }
    return data ?? null;
  };

  const markObserved = async (params: MarkObservedParams): Promise<void> => {
    const patch: Database['public']['Tables']['transaction_attempts']['Update'] = {
      status: params.status,
    };
    if (params.transactionHash !== undefined && params.transactionHash !== null) {
      patch.transaction_hash = params.transactionHash;
    }
    if (params.resultCode !== undefined) {
      patch.result_code = params.resultCode;
    }
    if (params.errorCode !== undefined) {
      patch.error_code = params.errorCode;
    }
    if (params.errorDetail !== undefined) {
      patch.error_detail = params.errorDetail;
    }
    // Guarded by an in-flight status filter so the DB transition trigger only
    // ever moves a submitted/unknown attempt forward; a resolved attempt is
    // untouched (idempotent).
    const { error } = await deps.serviceClient
      .from('transaction_attempts')
      .update(patch)
      .eq('id', params.attemptId)
      .in('status', ['submitted', 'unknown']);
    if (error) {
      safeLog('failed to mark attempt observed', { correlationId: params.correlationId, error });
      throw reconciliationDependencyError(params.correlationId, 'Unable to record observation right now.');
    }
  };

  const startRun = async (insert: ReconciliationRunInsert): Promise<ReconciliationRunRecord> => {
    const { data, error } = await deps.serviceClient
      .from('reconciliation_runs')
      .insert(insert)
      .select('*')
      .single();
    if (error || !data) {
      safeLog('failed to start reconciliation run', { correlationId, error });
      throw reconciliationDependencyError(correlationId, 'Unable to start a reconciliation run right now.');
    }
    return data;
  };

  const completeRun = async (params: CompleteRunParams): Promise<void> => {
    const patch: Database['public']['Tables']['reconciliation_runs']['Update'] = {
      status: params.status,
      observed_transaction_count: params.counts.observedTransactions,
      observed_event_count: params.counts.observedEvents,
      confirmed_intent_count: params.counts.confirmedIntents,
      failed_intent_count: params.counts.failedIntents,
      mismatch_count: params.counts.mismatches,
      quarantined_count: params.counts.quarantined,
      cursor_before: params.cursorBefore ?? null,
      cursor_after: params.cursorAfter ?? null,
      start_ledger_sequence: params.startLedgerSequence ?? null,
      end_ledger_sequence: params.endLedgerSequence ?? null,
      reconciliation_lag_seconds: params.lagSeconds ?? null,
      completed_at: params.completedAt,
    };
    if (params.status === 'failed') {
      patch.error_code = params.errorCode ?? 'reconciliation_failed';
      patch.error_message = params.errorMessage ?? null;
      patch.error_details = params.errorDetails ?? {};
    }
    const { error } = await deps.serviceClient
      .from('reconciliation_runs')
      .update(patch)
      .eq('id', params.runId)
      .eq('status', 'running');
    if (error) {
      safeLog('failed to complete reconciliation run', { correlationId: params.correlationId, error });
      throw reconciliationDependencyError(params.correlationId, 'Unable to complete the reconciliation run right now.');
    }
  };

  return { listPending, loadIntent, markObserved, startRun, completeRun };
};

/** Builds a {@link CursorGateway} bound to the service-only cursor RPC. */
export const createServiceCursorGateway = (
  serviceClient: TypedSupabaseClient,
  correlationId: string = newCorrelationId(),
): CursorGateway => ({
  async advance(params: AdvanceCursorParams): Promise<void> {
    const { error } = await serviceClient.rpc('advance_reconciliation_cursor', {
      p_network: params.network,
      p_stream_name: params.streamName,
      p_cursor_value: params.cursorValue,
      p_last_ledger_sequence: params.lastLedgerSequence,
      p_last_ledger_closed_at: params.lastLedgerClosedAt,
      p_correlation_id: params.correlationId,
    });
    if (error) {
      safeLog('failed to advance reconciliation cursor', { correlationId, error });
      throw reconciliationDependencyError(params.correlationId, 'Unable to advance the reconciliation cursor right now.');
    }
  },
});

/** Builds an {@link IssueGateway} bound to the service-only issue RPC. */
export const createServiceIssueGateway = (
  serviceClient: TypedSupabaseClient,
  correlationId: string = newCorrelationId(),
): IssueGateway => ({
  async record(params: RecordIssueParams): Promise<string> {
    const args = {
      p_reconciliation_run_id: params.reconciliationRunId,
      p_organization_id: params.organizationId,
      p_program_id: params.programId ?? null,
      p_ledger_transaction_id: params.ledgerTransactionId ?? null,
      p_contract_event_id: params.contractEventId ?? null,
      p_network: params.network,
      p_issue_type: params.issueType,
      p_severity: params.severity,
      p_subject_type: params.subjectType,
      p_subject_identifier: params.subjectIdentifier,
      p_projection_table: params.projectionTable ?? null,
      p_projection_key: params.projectionKey ?? {},
      p_expected_state: params.expectedState ?? {},
      p_observed_state: params.observedState ?? {},
      p_mismatch_fingerprint: params.mismatchFingerprint,
      p_detected_at: params.detectedAt,
      p_correlation_id: params.correlationId,
    };
    const { data, error } = await serviceClient.rpc(
      'record_reconciliation_issue',
      args as unknown as Database['public']['Functions']['record_reconciliation_issue']['Args'],
    );
    if (error || typeof data !== 'string') {
      safeLog('failed to record reconciliation issue', { correlationId, error });
      throw reconciliationDependencyError(params.correlationId, 'Unable to record the reconciliation issue right now.');
    }
    return data;
  },
});

/** Builds a {@link ProjectionWriterPort} backed by the narrow projection writer. */
export const createServiceProjectionWriter = (serviceWriter: ServiceWriter): ProjectionWriterPort => ({
  async write(writes: readonly ProjectionWrite[]): Promise<void> {
    for (const projectionWrite of writes) {
      await serviceWriter.writeProjection(
        projectionWrite.table,
        // The row type is validated by the projector against its table; the cast
        // bridges the generic table to Supabase's mapped upsert overloads.
        projectionWrite.rows as never,
        projectionWrite.onConflict ? { onConflict: projectionWrite.onConflict } : undefined,
      );
    }
  },
});

export interface ServiceReconciliationWorkerDependencies extends ServiceReconciliationDependencies {
  readonly config: StellarTestnetConfig;
  readonly guard?: NetworkGuard;
  readonly observer: ReconciliationObserver;
  readonly projector: ReconciliationProjector;
  readonly alerts?: AlertSink;
  readonly clock?: () => Date;
  readonly newId?: () => string;
  readonly defaultMaxLagSeconds?: number;
}

/**
 * Convenience: builds a fully service-backed reconciliation worker from a
 * service client + writer plus the rail-specific observer/projector. The rail
 * observers/projectors are provided by Tasks 10.4 (classic cash) and 11.5
 * (Soroban voucher).
 */
export const createServiceReconciliationWorker = (
  deps: ServiceReconciliationWorkerDependencies,
): ReconciliationWorker =>
  createReconciliationWorker({
    config: deps.config,
    guard: deps.guard,
    observer: deps.observer,
    projector: deps.projector,
    evidence: createServiceEvidenceStore(deps),
    stores: createServiceReconciliationStores(deps),
    cursors: createServiceCursorGateway(deps.serviceClient, deps.correlationId),
    issues: createServiceIssueGateway(deps.serviceClient, deps.correlationId),
    projections: createServiceProjectionWriter(deps.serviceWriter),
    alerts: deps.alerts,
    clock: deps.clock,
    newId: deps.newId,
    defaultMaxLagSeconds: deps.defaultMaxLagSeconds,
  });

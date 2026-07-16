// Voucher-rail reconciliation: Soroban contract-event ingestion, observers,
// projectors, and reconciled read models (Task 11.5).
//
// This module adds the SOROBAN VOUCHER RAIL observer and projectors to the
// shared reconciliation worker and projection writer built by Task 6.4
// (`reconciliation.ts`), exactly as the classic cash rail is added by Task 10.4
// (`cash-reconciliation.ts`). Confirmed financial ownership lives on the Stellar
// ledger and in Soroban contract state, never in a submission response, so — like
// the worker and the cash rail — nothing here turns a submission into a
// confirmation. The worker still owns the confirmation invariants (configured
// network + exact hash verification, append-only evidence, attempt transitions);
// this module supplies the rail-specific pieces the worker's design leaves to
// Task 11.5:
//
//   1. OBSERVER  — {@link createVoucherContractObserver} reads an in-flight
//      voucher attempt's transaction on the guarded testnet RPC/Horizon and
//      reports EXACT ledger evidence together with the contract events the
//      transaction emitted (`redeemed`, `refunded`, `entitlement_allocated`,
//      `merchant_changed`, `beneficiary_rotated`, `funded`, `activated`,
//      `paused`, `resumed`, `closed`). It never confirms; it only reports what
//      the ledger and contract show (Requirements 18.5, 18.8).
//   2. PROJECTOR — {@link createVoucherReconciliationProjector} reflects that
//      contract truth into the durable domain rows — it confirms a `submitted`
//      redemption from its `redeemed` event and creates the LINKED-BUT-DISTINCT
//      settlement domain event (Requirement 12.4), and confirms a `submitted`
//      refund from its `refunded` event — while PRESERVING every already-confirmed
//      row and QUARANTINING a disagreement without ever inventing ownership
//      (Requirements 12.1, 18.6).
//
// Contract events are DEDUPLICATED by `(contract_id, ledger, event_index)` — the
// exact `contract_events` unique constraint — both by the worker (which appends
// each event once through the Task 6.1 narrow service writer) and by
// {@link voucherEventDedupeKey} here, so replaying a ledger never creates a
// second settlement or double-counts a redemption.
//
// The reconciled read models (`beneficiary_balance_projection`,
// `merchant_balance_projection`, `program_financial_projection`) are derived
// idempotently from CONFIRMED domain rows — computed, never incremented — and are
// written AFTER the worker completes its run (the projection trigger requires a
// completed run's evidence: `reconciled_at == completed_at` and `as_of_ledger <=
// end_ledger_sequence`). A `partial` run always yields a stale read model.
//
// All configuration, clients, and stores are injected, so this module reads no
// Deno globals and stays inside the project-wide type check and the unit-test
// harness. Deno.serve entrypoints live in per-function index.ts files.
//
// Validates: Requirements 12.1, 12.3, 12.4, 18.5, 18.6

import type { StellarTestnetConfig } from '../../../../shared/stellar-config.ts';
import type { Database, Json } from '../../../../src/types/database.types.ts';

import type { ServiceWriter, TypedSupabaseClient } from '../auth.ts';
import { FinancialErrorException, makeFinancialError, newCorrelationId } from '../errors.ts';
import { safeLog } from '../redaction.ts';

import { createNetworkGuard, type NetworkGuard } from './network-guard.ts';
import {
    type FinancialIntentRecord,
    type FinancialOperationType,
    PILOT_WALLET_NETWORK,
    type TransactionAttemptRecord,
    type WalletNetwork,
} from './protocol.ts';
import {
    type AttemptObservation,
    isInFlightAttempt,
    type ObservedContractEvent,
    type ObservedLedgerTransaction,
    type ProjectionInput,
    type ProjectionResult,
    type ProjectionWrite,
    type ProjectionWriterPort,
    type ReconciliationObserver,
    type ReconciliationProjector,
    type ReconciliationRunParams,
    type ReconciliationRunRecord,
    type ReconciliationRunSummary,
    type ReconciliationWorker,
} from './reconciliation.ts';

// ---------------------------------------------------------------------------
// Domain row / enum aliases.
// ---------------------------------------------------------------------------

export type VoucherRedemptionRecord = Database['public']['Tables']['voucher_redemptions']['Row'];
export type SettlementRecord = Database['public']['Tables']['settlements']['Row'];
export type SettlementInsert = Database['public']['Tables']['settlements']['Insert'];
export type RefundRecord = Database['public']['Tables']['refunds']['Row'];

export type BeneficiaryBalanceProjectionInsert =
  Database['public']['Tables']['beneficiary_balance_projection']['Insert'];
export type MerchantBalanceProjectionInsert =
  Database['public']['Tables']['merchant_balance_projection']['Insert'];
export type ProgramFinancialProjectionInsert =
  Database['public']['Tables']['program_financial_projection']['Insert'];

export type RedemptionStatus = Database['public']['Enums']['redemption_status'];
export type SettlementStatus = Database['public']['Enums']['settlement_status'];
export type SettlementKind = Database['public']['Enums']['settlement_kind'];
export type RefundStatus = Database['public']['Enums']['refund_status'];
export type ProgramFundingStatus = Database['public']['Enums']['program_funding_status'];

const C_ADDRESS = /^C[A-Z2-7]{55}$/;
const G_ADDRESS = /^G[A-Z2-7]{55}$/;

/** Default read-model staleness window (seconds) after a reconciliation time. */
export const DEFAULT_STALE_WINDOW_SECONDS = 3_600;

/**
 * The financial operation types that flow over the Soroban voucher rail. Every
 * one is a contract invocation whose confirmed effect is observed as contract
 * events (never a classic Horizon payment). The classic cash operations are
 * reconciled by Task 10.4.
 */
export const VOUCHER_RAIL_OPERATION_TYPES: readonly FinancialOperationType[] = Object.freeze([
  'voucher_allocation',
  'voucher_redemption',
  'refund',
]);

export const isVoucherRailOperation = (operationType: FinancialOperationType): boolean =>
  (VOUCHER_RAIL_OPERATION_TYPES as readonly string[]).includes(operationType);

// ---------------------------------------------------------------------------
// Voucher contract event vocabulary (design "Public Interface").
// ---------------------------------------------------------------------------

/**
 * The complete set of events an isolated voucher contract instance emits (design
 * "Voucher Rail Contract"). Every observed event carries pseudonymous
 * identifiers, addresses, amounts, and correlation values only — never PII.
 */
export const VOUCHER_EVENT_TYPES = [
  'funded',
  'activated',
  'entitlement_allocated',
  'merchant_changed',
  'redeemed',
  'refunded',
  'beneficiary_rotated',
  'paused',
  'resumed',
  'closed',
] as const;

export type VoucherContractEventType = (typeof VOUCHER_EVENT_TYPES)[number];

const VOUCHER_EVENT_TYPE_SET: ReadonlySet<string> = new Set(VOUCHER_EVENT_TYPES);

export const isVoucherEventType = (value: string): value is VoucherContractEventType =>
  VOUCHER_EVENT_TYPE_SET.has(value);

/**
 * The stable dedupe key for a contract event, matching the `contract_events`
 * unique constraint `(contract_id, ledger, event_index)`. Distinct linked
 * domain events are created at most once per contract event, so replaying a
 * ledger never fabricates a second settlement or refund.
 */
export const voucherEventDedupeKey = (event: {
  readonly contractId: string;
  readonly ledgerSequence: number;
  readonly eventIndex: number;
}): string => `${event.contractId}:${event.ledgerSequence}:${event.eventIndex}`;

// ---------------------------------------------------------------------------
// Pure event classification (defensive, PII-free field extraction).
// ---------------------------------------------------------------------------

/**
 * A classified voucher contract event. The pseudonymous fields are extracted
 * defensively from the event payload by conventional key: an absent field is
 * `undefined` (the projector then verifies only the dimensions it can observe
 * and never invents a value). Amounts are parsed as exact non-negative integers
 * (i128 stroops rendered as a number/decimal string); an unparseable amount is
 * `undefined`.
 */
export interface ClassifiedVoucherEvent {
  readonly type: VoucherContractEventType;
  readonly contractId: string;
  readonly ledgerSequence: number;
  readonly eventIndex: number;
  /** Pseudonymous 32-byte entitlement identifier, when present. */
  readonly entitlementId?: string;
  /** Pseudonymous redemption identifier the event references, when present. */
  readonly redemptionId?: string;
  /** One-time refund nonce, when present (on a `refunded` event). */
  readonly refundNonce?: string;
  /** Merchant settlement wallet the contract paid, when present. */
  readonly merchantWallet?: string;
  /** Beneficiary wallet, when present. */
  readonly beneficiaryWallet?: string;
  /** Amount moved by the event in stroops, when present and parseable. */
  readonly amountStroops?: number;
}

const asRecord = (value: Json | undefined): { [key: string]: Json | undefined } | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as { [key: string]: Json | undefined })
    : null;

/** First present string value among the candidate keys, else undefined. */
const readString = (
  payload: { [key: string]: Json | undefined } | null,
  keys: readonly string[],
): string | undefined => {
  if (payload === null) return undefined;
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
};

/**
 * Parses an i128 stroop amount that may arrive as a number or a decimal string.
 * Returns a non-negative safe integer, or `undefined` when absent/unparseable
 * (the projector treats that as "cannot verify amount", never as zero).
 */
export const parseEventAmountStroops = (
  payload: { [key: string]: Json | undefined } | null,
  keys: readonly string[] = ['amount_stroops', 'amount', 'value_stroops', 'value'],
): number | undefined => {
  if (payload === null) return undefined;
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
    if (typeof value === 'string' && /^\d+$/.test(value)) {
      const parsed = Number(value);
      if (Number.isSafeInteger(parsed) && parsed >= 0) return parsed;
    }
  }
  return undefined;
};

/**
 * Classifies an observed contract event into a typed voucher event, or `null`
 * when its type is not a known voucher event (e.g. a SAC transfer sub-event).
 * Extraction reads both the topics array and the payload object so it tolerates
 * either encoding without hard-failing.
 */
export const classifyVoucherEvent = (event: ObservedContractEvent): ClassifiedVoucherEvent | null => {
  if (!isVoucherEventType(event.eventType)) return null;
  const payload = asRecord(event.eventPayload);
  const topics = Array.isArray(event.eventTopics)
    ? asRecord(
        (event.eventTopics as Json[]).find((topic) => asRecord(topic) !== null) ?? null,
      )
    : null;
  const from = (keys: readonly string[]): string | undefined =>
    readString(payload, keys) ?? readString(topics, keys);
  return {
    type: event.eventType as VoucherContractEventType,
    contractId: event.contractId,
    ledgerSequence: event.ledgerSequence,
    eventIndex: event.eventIndex,
    entitlementId: from(['entitlement_id', 'entitlement']),
    redemptionId: from(['redemption_id', 'redemption']),
    refundNonce: from(['refund_nonce', 'nonce']),
    merchantWallet: from(['merchant', 'merchant_wallet', 'merchant_settlement_wallet', 'to']),
    beneficiaryWallet: from(['beneficiary', 'beneficiary_wallet', 'from']),
    amountStroops: parseEventAmountStroops(payload),
  };
};

/**
 * Selects the classified event of a given type, deduplicated by contract event
 * position, from an observation's events (paired with the stored event ids).
 * Returns the first match together with its stored `contract_events.id`, or null.
 */
export const selectClassifiedEvent = (
  events: readonly ObservedContractEvent[],
  contractEventIds: readonly string[],
  type: VoucherContractEventType,
  contractId: string,
): { readonly event: ClassifiedVoucherEvent; readonly contractEventId: string } | null => {
  const seen = new Set<string>();
  for (let index = 0; index < events.length; index += 1) {
    const classified = classifyVoucherEvent(events[index]);
    if (classified === null || classified.type !== type) continue;
    if (classified.contractId !== contractId) continue;
    const key = voucherEventDedupeKey(classified);
    if (seen.has(key)) continue;
    seen.add(key);
    return { event: classified, contractEventId: contractEventIds[index] ?? '' };
  }
  return null;
};

// ---------------------------------------------------------------------------
// Voucher contract observer (Soroban rail).
// ---------------------------------------------------------------------------

/** One contract event emitted by an observed voucher transaction, as read from RPC. */
export interface VoucherContractEventLookupResult {
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
 * Exact, untrusted evidence for one Soroban voucher transaction as read from the
 * guarded testnet RPC/Horizon. The observer maps this into the worker's
 * {@link ObservedLedgerTransaction} plus its emitted events; the worker
 * re-verifies the network and hash before anything can confirm.
 */
export interface VoucherLedgerLookupResult {
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
  /** The contract events the transaction emitted (empty on a failed transaction). */
  readonly events?: readonly VoucherContractEventLookupResult[];
}

/**
 * Reads a submitted Soroban transaction (and the contract events it emitted) by
 * hash from the guarded testnet RPC/Horizon. Returns `null` when the transaction
 * is not found (has not landed in a ledger). Implementations must talk ONLY to
 * the allowlisted testnet origin.
 */
export interface VoucherTransactionLookup {
  lookup(transactionHash: string): Promise<VoucherLedgerLookupResult | null>;
}

const HEX_64 = /^[0-9a-f]{64}$/;

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

/** Lowercase-hex SHA-256 of a UTF-8 string (used for the envelope digest). */
export const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return toHex(digest);
};

export interface VoucherObserverDependencies {
  readonly config: StellarTestnetConfig;
  /** Defaults to a guard built from `config`; kept for defence-in-depth only. */
  readonly guard?: NetworkGuard;
  readonly lookup: VoucherTransactionLookup;
}

/**
 * Builds the Soroban voucher-rail {@link ReconciliationObserver}. For an in-flight
 * attempt that has a submitted transaction hash it reads that transaction (and
 * its emitted contract events) from the guarded RPC/Horizon and reports EXACT
 * evidence:
 *
 *   - found + successful  -> `settled_success` with the emitted contract events
 *     (the worker verifies network/hash before it may confirm, and appends each
 *     event once, deduplicated by `(contract_id, ledger, event_index)`);
 *   - found + unsuccessful -> `settled_failure` (a failed contract call emits no
 *     value-moving events that could confirm);
 *   - not found           -> `not_found` (never landed; the worker moves a
 *     submitted attempt to `unknown` so it is reconciled again, not re-sent);
 *   - no submitted hash yet -> `still_pending` (nothing to observe).
 *
 * The observer NEVER confirms and NEVER fabricates evidence: a lookup failure
 * throws, and the worker isolates it as a failed observation that leaves the
 * attempt in flight (Requirements 18.5, 18.8).
 */
export const createVoucherContractObserver = (
  deps: VoucherObserverDependencies,
): ReconciliationObserver => {
  const guard = deps.guard ?? createNetworkGuard(deps.config);
  guard.assertTestnetConfig();

  return {
    async observeAttempt(attempt: TransactionAttemptRecord): Promise<AttemptObservation> {
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
        // The guarded RPC/Horizon client is pinned to the configured testnet
        // origin; the worker re-asserts this passphrase before it may confirm.
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

      if (!result.successful) {
        // A failed contract call moves no value; ignore any emitted events.
        return { kind: 'settled_failure', ledger };
      }

      // Report every emitted contract event exactly as read. The worker appends
      // each once (deduplicated by `(contract_id, ledger, event_index)`); the
      // projector classifies the voucher events it understands.
      const events: ObservedContractEvent[] = (result.events ?? []).map((event) => ({
        contractId: event.contractId,
        ledgerSequence: event.ledgerSequence,
        eventIndex: event.eventIndex,
        eventType: event.eventType,
        eventTopics: event.eventTopics,
        eventPayload: event.eventPayload,
        eventXdr: event.eventXdr,
        eventSha256: event.eventSha256,
      }));

      return { kind: 'settled_success', ledger, events };
    },
  };
};

// ---------------------------------------------------------------------------
// Voucher domain stores (injected).
// ---------------------------------------------------------------------------

/**
 * Immutable ledger/contract evidence for one confirmed voucher operation, shared
 * by the redemption, its distinct linked settlement, and a refund. Every field is
 * the EXACT value the reconciliation worker appended and re-verified — never a
 * value invented by the projector.
 */
export interface VoucherChainEvidence {
  /** The appended `ledger_transactions.id`. */
  readonly ledgerTransactionId: string;
  /** The appended `contract_events.id` for the value-moving event. */
  readonly contractEventId: string;
  /** The event's index within its ledger (matches `contract_events.event_index`). */
  readonly contractEventIndex: number;
  /** The confirmed ledger sequence. */
  readonly ledgerSequence: number;
  /** The confirmed lowercase-hex transaction hash. */
  readonly transactionHash: string;
}

export interface ConfirmRedemptionParams {
  readonly redemption: VoucherRedemptionRecord;
  readonly evidence: VoucherChainEvidence;
  readonly correlationId: string;
}

export interface ConfirmRefundParams {
  readonly refund: RefundRecord;
  readonly evidence: VoucherChainEvidence;
  readonly correlationId: string;
}

/**
 * The durable voucher domain store. `voucher_redemptions`, `settlements`, and
 * `refunds` are append-only-after-terminal core tables (their confirmed rows are
 * immutable by trigger), so a submitted redemption / requested refund is moved to
 * `confirmed` through this store — never through the narrow projection writer, and
 * never by inventing a row that a payment/refund flow did not first create.
 *
 * Confirmation is idempotent: every transition is guarded by the current
 * non-terminal status so a replayed ledger observation never double-settles, and
 * `settlementExistsForRedemption` guards the distinct linked settlement.
 */
export interface VoucherReconciliationStore {
  /**
   * Loads the SUBMITTED redemption bound to a confirmed attempt, resolved from the
   * attempt's immutable financial intent and confirmed transaction hash. Returns
   * `null` when no redemption row exists (the projector then QUARANTINES rather
   * than inventing ownership).
   */
  loadRedemption(params: {
    readonly financialIntentId: string;
    readonly transactionHash: string;
  }): Promise<VoucherRedemptionRecord | null>;
  /**
   * Confirms a submitted redemption (`submitted -> confirmed`) AND creates the
   * DISTINCT linked settlement (`kind = 'voucher_redemption'`, `confirmed`) in one
   * atomic step, both bound to the same immutable ledger/contract evidence
   * (Requirement 12.4). Idempotent: guarded by `status = 'submitted'` and by the
   * settlement's uniqueness on `voucher_redemption_id`.
   */
  confirmRedemptionWithSettlement(params: ConfirmRedemptionParams): Promise<void>;
  /** Whether a settlement already exists for a redemption (settlement idempotency). */
  settlementExistsForRedemption(redemptionId: string): Promise<boolean>;
  /**
   * Loads the non-terminal refund bound to a confirmed refund attempt, resolved
   * from its immutable financial intent and confirmed transaction hash. Returns
   * `null` when no refund row exists (the projector then QUARANTINES).
   */
  loadRefund(params: {
    readonly financialIntentId: string;
    readonly transactionHash: string;
  }): Promise<RefundRecord | null>;
  /** Confirms a submitted/approved refund from its `refunded` event evidence. */
  confirmRefund(params: ConfirmRefundParams): Promise<void>;
}

// ---------------------------------------------------------------------------
// Projector agreement checks (pure — never invent ownership).
// ---------------------------------------------------------------------------

/**
 * Detects whether a redemption row's immutable identity disagrees with the
 * immutable intent behind its attempt. A disagreement is an integrity problem to
 * QUARANTINE rather than confirm (Requirement 18.6).
 */
export const redemptionDisagreesWithIntent = (
  redemption: VoucherRedemptionRecord,
  intent: FinancialIntentRecord,
): boolean =>
  redemption.organization_id !== intent.organization_id ||
  redemption.program_id !== (intent.program_id ?? redemption.program_id) ||
  redemption.beneficiary_identity_id !==
    (intent.beneficiary_identity_id ?? redemption.beneficiary_identity_id) ||
  intent.amount_stroops === null ||
  redemption.amount_stroops !== intent.amount_stroops;

/**
 * Detects whether the observed `redeemed` event disagrees with the redemption it
 * should confirm. Only observable dimensions are checked: the contract instance
 * and, when the event carries a parseable amount, the amount. An absent event
 * amount is treated as "cannot verify" (never as a disagreement, never invented).
 */
export const redeemedEventDisagreesWithRedemption = (
  event: ClassifiedVoucherEvent,
  redemption: VoucherRedemptionRecord,
): boolean =>
  event.contractId !== redemption.contract_id ||
  (event.amountStroops !== undefined && event.amountStroops !== redemption.amount_stroops);

const redemptionMismatch = (
  redemptionId: string,
  intent: FinancialIntentRecord,
  observed: ObservedLedgerTransaction,
  detail: string,
): ProjectionResult => ({
  kind: 'mismatch',
  mismatch: {
    issueType: 'projection_mismatch',
    severity: 'critical',
    subjectType: 'voucher_redemption',
    subjectIdentifier: redemptionId,
    projectionTable: 'merchant_balance_projection',
    programId: intent.program_id,
    projectionKey: { voucher_redemption_id: redemptionId },
    expectedState: { detail, intent_amount_stroops: intent.amount_stroops },
    observedState: { transaction_hash: observed.transactionHash, successful: observed.successful },
  },
});

const refundMismatch = (
  refundIdentifier: string,
  intent: FinancialIntentRecord,
  observed: ObservedLedgerTransaction,
  detail: string,
): ProjectionResult => ({
  kind: 'mismatch',
  mismatch: {
    issueType: 'projection_mismatch',
    severity: 'critical',
    subjectType: 'refund',
    subjectIdentifier: refundIdentifier,
    projectionTable: 'beneficiary_balance_projection',
    programId: intent.program_id,
    projectionKey: { refund_identifier: refundIdentifier },
    expectedState: { detail, intent_amount_stroops: intent.amount_stroops },
    observedState: { transaction_hash: observed.transactionHash, successful: observed.successful },
  },
});

// ---------------------------------------------------------------------------
// Voucher reconciliation projector.
// ---------------------------------------------------------------------------

export interface VoucherReconciliationProjectorDependencies {
  readonly store: VoucherReconciliationStore;
}

/**
 * Builds the Soroban voucher-rail {@link ReconciliationProjector}. On a
 * confirmed-success observation it reflects CONTRACT truth into the durable
 * domain rows:
 *
 *   - a `voucher_redemption` intent with a `redeemed` event confirms its SUBMITTED
 *     redemption (`submitted -> confirmed`) and creates the DISTINCT linked
 *     settlement (Requirements 12.1, 12.4), both bound to the same immutable
 *     ledger/contract evidence and deduplicated by contract-event position;
 *   - a `refund` intent with a `refunded` event confirms its refund.
 *
 * It PRESERVES every already-confirmed row (an idempotent re-observation is
 * `unchanged`) and QUARANTINES a disagreement — a missing domain row, an
 * intent/row disagreement, a missing expected event, or a confirmed row bound to
 * a different event — WITHOUT ever inventing ownership (Requirement 18.6). It
 * returns `unchanged` for the read-model WRITES: the reconciled balance
 * projections are written AFTER the run completes by {@link createVoucherReconciler}
 * (the projection trigger requires a completed run's evidence). Non-voucher and
 * non-value-moving intents are left to their own projectors.
 */
export const createVoucherReconciliationProjector = (
  deps: VoucherReconciliationProjectorDependencies,
): ReconciliationProjector => ({
  async project(input: ProjectionInput): Promise<ProjectionResult> {
    const { intent, ledger, events, contractEventIds, run } = input;
    if (intent === null) {
      return { kind: 'unchanged' };
    }

    if (intent.operation_type === 'voucher_redemption') {
      return projectRedemption(deps.store, input, intent, ledger, events, contractEventIds, run.correlationId);
    }
    if (intent.operation_type === 'refund') {
      return projectRefund(deps.store, input, intent, ledger, events, contractEventIds, run.correlationId);
    }
    // Allocation/funding/other voucher operations move no beneficiary/merchant
    // value here; their read models are derived post-run. Non-voucher intents are
    // handled by their own rail projector.
    return { kind: 'unchanged' };
  },
});

const projectRedemption = async (
  store: VoucherReconciliationStore,
  input: ProjectionInput,
  intent: FinancialIntentRecord,
  ledger: ObservedLedgerTransaction,
  events: readonly ObservedContractEvent[],
  contractEventIds: readonly string[],
  correlationId: string,
): Promise<ProjectionResult> => {
  const redemption = await store.loadRedemption({
    financialIntentId: input.attempt.financial_intent_id ?? '',
    transactionHash: ledger.transactionHash,
  });
  if (redemption === null) {
    // No submitted redemption exists for this confirmed attempt: never invent one.
    return redemptionMismatch(
      `intent:${intentIdOf(input)}`,
      intent,
      ledger,
      'redemption_row_missing',
    );
  }
  if (redemptionDisagreesWithIntent(redemption, intent)) {
    return redemptionMismatch(redemption.id, intent, ledger, 'redemption_intent_disagreement');
  }

  // The value-moving `redeemed` event must be present (deduplicated by position)
  // and agree with the redemption; without it nothing can confirm.
  const selected = selectClassifiedEvent(events, contractEventIds, 'redeemed', redemption.contract_id);
  if (selected === null) {
    return redemptionMismatch(redemption.id, intent, ledger, 'redeemed_event_missing');
  }
  if (redeemedEventDisagreesWithRedemption(selected.event, redemption)) {
    return redemptionMismatch(redemption.id, intent, ledger, 'redeemed_event_disagreement');
  }

  const evidence: VoucherChainEvidence = {
    ledgerTransactionId: input.ledgerTransactionId,
    contractEventId: selected.contractEventId,
    contractEventIndex: selected.event.eventIndex,
    ledgerSequence: ledger.ledgerSequence,
    transactionHash: ledger.transactionHash,
  };

  // Preserve confirmed redemptions: an already-confirmed redemption bound to the
  // SAME contract event is idempotent; a DIFFERENT event is an integrity problem.
  if (redemption.status === 'confirmed') {
    if (redemption.contract_event_id === selected.contractEventId) {
      return { kind: 'unchanged' };
    }
    return redemptionMismatch(redemption.id, intent, ledger, 'confirmed_event_conflict');
  }
  if (redemption.status !== 'submitted') {
    return redemptionMismatch(redemption.id, intent, ledger, `redemption_not_submittable:${redemption.status}`);
  }

  await store.confirmRedemptionWithSettlement({ redemption, evidence, correlationId });
  safeLog('voucher redemption confirmed by reconciliation', {
    correlationId,
    redemptionId: redemption.id,
    attemptId: input.attempt.id,
  });
  // The reconciled read models are written post-run with completed-run evidence.
  return { kind: 'unchanged' };
};

const projectRefund = async (
  store: VoucherReconciliationStore,
  input: ProjectionInput,
  intent: FinancialIntentRecord,
  ledger: ObservedLedgerTransaction,
  events: readonly ObservedContractEvent[],
  contractEventIds: readonly string[],
  correlationId: string,
): Promise<ProjectionResult> => {
  const refund = await store.loadRefund({
    financialIntentId: input.attempt.financial_intent_id ?? '',
    transactionHash: ledger.transactionHash,
  });
  if (refund === null) {
    return refundMismatch(`intent:${intentIdOf(input)}`, intent, ledger, 'refund_row_missing');
  }
  if (refund.organization_id !== intent.organization_id || refund.amount_stroops !== intent.amount_stroops) {
    return refundMismatch(refund.id, intent, ledger, 'refund_intent_disagreement');
  }

  // A voucher refund (returns_to_entitlement) must carry a `refunded` contract
  // event; a cash refund does not. Only confirm on the evidence that applies.
  if (refund.returns_to_entitlement && refund.contract_id !== null) {
    const selected = selectClassifiedEvent(events, contractEventIds, 'refunded', refund.contract_id);
    if (selected === null) {
      return refundMismatch(refund.id, intent, ledger, 'refunded_event_missing');
    }
    if (refund.status === 'confirmed') {
      return refund.contract_event_id === selected.contractEventId
        ? { kind: 'unchanged' }
        : refundMismatch(refund.id, intent, ledger, 'confirmed_event_conflict');
    }
    if (isTerminalRefundStatus(refund.status)) {
      return refundMismatch(refund.id, intent, ledger, `refund_not_confirmable:${refund.status}`);
    }
    await store.confirmRefund({
      refund,
      evidence: {
        ledgerTransactionId: input.ledgerTransactionId,
        contractEventId: selected.contractEventId,
        contractEventIndex: selected.event.eventIndex,
        ledgerSequence: ledger.ledgerSequence,
        transactionHash: ledger.transactionHash,
      },
      correlationId,
    });
    safeLog('voucher refund confirmed by reconciliation', {
      correlationId,
      refundId: refund.id,
      attemptId: input.attempt.id,
    });
  }
  return { kind: 'unchanged' };
};

/** Refund statuses that can never move to `confirmed`. */
export const isTerminalRefundStatus = (status: RefundStatus): boolean =>
  status === 'confirmed' || status === 'failed' || status === 'exception_required';

const intentIdOf = (input: ProjectionInput): string => input.attempt.financial_intent_id ?? input.attempt.id;

// ---------------------------------------------------------------------------
// Reconciled read-model builders (pure — computed from confirmed rows).
// ---------------------------------------------------------------------------

/** ISO time `seconds` after `reconciledAt`, used for the read-model stale window. */
export const staleAfterIso = (
  reconciledAt: string,
  seconds: number = DEFAULT_STALE_WINDOW_SECONDS,
): string => new Date(Date.parse(reconciledAt) + seconds * 1000).toISOString();

/** Common reconciled-projection metadata every voucher read model carries. */
export interface VoucherProjectionEvidence {
  readonly reconciliationRunId: string;
  readonly asOfLedger: number;
  /** The run's `completed_at`; the projection's `reconciled_at` MUST equal it. */
  readonly reconciledAt: string;
  readonly network: WalletNetwork;
  /** The completed run's health; a `partial` run always marks the read model stale. */
  readonly runStatus: 'completed' | 'partial';
  readonly projectionVersion: number;
  readonly staleWindowSeconds?: number;
}

export interface BeneficiaryVoucherBalanceInput extends VoucherProjectionEvidence {
  readonly organizationId: string;
  readonly programId: string;
  readonly beneficiaryIdentityId: string;
  readonly assetCode: string;
  readonly assetIssuer: string;
  /** Confirmed entitlement allocated to the beneficiary in this program. */
  readonly allocatedStroops: number;
  /** Sum of CONFIRMED voucher value redeemed by the beneficiary in this program. */
  readonly redeemedStroops: number;
  /** Sum of CONFIRMED refunds returned to the beneficiary's entitlement. */
  readonly refundedStroops: number;
  readonly confirmedTransactionCount: number;
}

/**
 * Builds the reconciled `beneficiary_balance_projection` row for the VOUCHER rail
 * from confirmed source totals (idempotent — computed, never incremented). The
 * available entitlement is the allocation minus confirmed redemptions plus
 * confirmed refunds-to-entitlement, clamped at zero so the non-negative invariant
 * always holds.
 */
export const buildBeneficiaryVoucherBalanceRow = (
  input: BeneficiaryVoucherBalanceInput,
): BeneficiaryBalanceProjectionInsert => {
  const available = Math.max(0, input.allocatedStroops - input.redeemedStroops + input.refundedStroops);
  const isStale = input.runStatus === 'partial';
  return {
    organization_id: input.organizationId,
    program_id: input.programId,
    beneficiary_identity_id: input.beneficiaryIdentityId,
    network: input.network,
    aid_type: 'voucher',
    asset_code: input.assetCode,
    asset_issuer: input.assetIssuer,
    available_balance_stroops: available,
    allocated_stroops: input.allocatedStroops,
    distributed_stroops: input.allocatedStroops,
    redeemed_stroops: input.redeemedStroops,
    refunded_stroops: input.refundedStroops,
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

export interface MerchantSettlementBalanceInput extends VoucherProjectionEvidence {
  readonly organizationId: string;
  readonly programId: string | null;
  readonly merchantId: string;
  readonly assetCode: string;
  readonly assetIssuer: string;
  /** Sum of CONFIRMED merchant settlements (gross, before refunds). */
  readonly grossSettledStroops: number;
  /** Sum of CONFIRMED refunds debited from the merchant. */
  readonly refundedStroops: number;
  readonly confirmedSettlementCount: number;
  /** Simulated cash-out already completed (independent lifecycle). */
  readonly completedCashoutStroops?: number;
  readonly pendingCashoutStroops?: number;
}

/**
 * Builds the reconciled `merchant_balance_projection` row from confirmed
 * settlement totals (idempotent — computed, never incremented). Net settled
 * balance is gross settled minus confirmed refunds minus completed cash-out,
 * clamped at zero.
 */
export const buildMerchantSettlementBalanceRow = (
  input: MerchantSettlementBalanceInput,
): MerchantBalanceProjectionInsert => {
  const completedCashout = input.completedCashoutStroops ?? 0;
  const pendingCashout = input.pendingCashoutStroops ?? 0;
  const settledBalance = Math.max(
    0,
    input.grossSettledStroops - input.refundedStroops - completedCashout,
  );
  const isStale = input.runStatus === 'partial';
  return {
    organization_id: input.organizationId,
    program_id: input.programId,
    merchant_id: input.merchantId,
    network: input.network,
    asset_code: input.assetCode,
    asset_issuer: input.assetIssuer,
    gross_settled_stroops: input.grossSettledStroops,
    refunded_stroops: input.refundedStroops,
    settled_balance_stroops: settledBalance,
    completed_cashout_stroops: completedCashout,
    pending_cashout_stroops: pendingCashout,
    confirmed_settlement_count: input.confirmedSettlementCount,
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

export interface ProgramVoucherFinancialInput extends VoucherProjectionEvidence {
  readonly organizationId: string;
  readonly programId: string;
  readonly programStatus: string;
  readonly fundingStatus: ProgramFundingStatus;
  readonly contractId: string | null;
  readonly assetCode: string;
  readonly assetIssuer: string;
  readonly budgetStroops: number;
  readonly fundedStroops: number;
  readonly allocatedStroops: number;
  /** Sum of CONFIRMED gross redemptions across the program. */
  readonly redeemedStroops: number;
  /** Sum of CONFIRMED refunds returned to entitlement across the program. */
  readonly refundedStroops: number;
  /** Unused escrow returned to the treasury at closure. */
  readonly returnedStroops?: number;
  readonly confirmedTransactionCount: number;
}

/**
 * Builds the reconciled `program_financial_projection` row for a VOUCHER program
 * from confirmed totals. Escrow balance is derived from the value-conservation
 * invariant `funded = escrow + gross_redeemed - refunded + returned`, so it is
 * computed as `funded - gross_redeemed + refunded - returned`, clamped at zero.
 */
export const buildProgramVoucherFinancialRow = (
  input: ProgramVoucherFinancialInput,
): ProgramFinancialProjectionInsert => {
  const returned = input.returnedStroops ?? 0;
  const escrow = Math.max(
    0,
    input.fundedStroops - input.redeemedStroops + input.refundedStroops - returned,
  );
  const isStale = input.runStatus === 'partial';
  return {
    organization_id: input.organizationId,
    program_id: input.programId,
    program_status: input.programStatus,
    funding_status: input.fundingStatus,
    aid_type: 'voucher',
    contract_id: input.contractId,
    asset_code: input.assetCode,
    asset_issuer: input.assetIssuer,
    budget_stroops: input.budgetStroops,
    funded_stroops: input.fundedStroops,
    allocated_stroops: input.allocatedStroops,
    distributed_stroops: input.allocatedStroops,
    redeemed_stroops: input.redeemedStroops,
    refunded_stroops: input.refundedStroops,
    returned_stroops: returned,
    escrow_balance_stroops: escrow,
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
// Voucher reconciler (orchestration).
// ---------------------------------------------------------------------------

/** Re-reads a completed reconciliation run for its projection evidence. */
export interface VoucherRunReader {
  load(runId: string): Promise<ReconciliationRunRecord | null>;
}

/**
 * The reconciled read-model rows to write for a completed run, computed from
 * CONFIRMED domain rows by the injected source (never incremented). The source
 * stamps each row with the completed run's evidence via the builders above, so
 * the projection trigger — which requires `reconciled_at == completed_at` and
 * `as_of_ledger <= end_ledger_sequence` — accepts them.
 */
export interface VoucherReadModelWrites {
  readonly writes: readonly ProjectionWrite[];
}

/**
 * Computes the reconciled read-model writes for a program after a completed run.
 * Implemented by the reconcile-stellar Edge Function wiring (and reused by the
 * reconciled-read task), it derives beneficiary/merchant/program balances from
 * confirmed rows using {@link buildBeneficiaryVoucherBalanceRow},
 * {@link buildMerchantSettlementBalanceRow}, and {@link buildProgramVoucherFinancialRow}.
 */
export interface VoucherProjectionSource {
  computeWrites(context: {
    readonly programId: string;
    readonly organizationId: string;
    readonly run: ReconciliationRunRecord;
    readonly runStatus: 'completed' | 'partial';
    readonly network: WalletNetwork;
    readonly staleWindowSeconds?: number;
    readonly correlationId: string;
  }): Promise<VoucherReadModelWrites>;
}

export interface VoucherReconcilerDependencies {
  /**
   * A reconciliation worker constructed with the voucher observer
   * ({@link createVoucherContractObserver}) and the voucher projector
   * ({@link createVoucherReconciliationProjector}).
   */
  readonly worker: ReconciliationWorker;
  /** The narrow projection writer; used to write the read models POST-run. */
  readonly projections: ProjectionWriterPort;
  /** Re-reads the completed run for its `completed_at` / `end_ledger_sequence`. */
  readonly runReader?: VoucherRunReader;
  /** Computes the reconciled read-model writes from confirmed rows. */
  readonly projectionSource?: VoucherProjectionSource;
  readonly defaultStaleWindowSeconds?: number;
}

export interface VoucherReconcileRequest {
  readonly programId: string;
  readonly organizationId: string;
  /** The in-flight (`submitted`/`unknown`) voucher attempts to reconcile. */
  readonly attempts: readonly TransactionAttemptRecord[];
  readonly cursorValue?: string | null;
  readonly streamName?: string;
  readonly correlationId?: string;
  readonly staleWindowSeconds?: number;
  readonly network?: WalletNetwork;
}

export interface VoucherReconcileResult {
  readonly summary: ReconciliationRunSummary;
  /** Whether reconciled read models were written this pass. */
  readonly projectionWritten: boolean;
}

/**
 * Builds the voucher reconciliation orchestrator. One pass:
 *
 *   1. runs the shared worker over the program's in-flight voucher attempts (the
 *      injected voucher observer reads the contract events; the voucher projector
 *      confirms redemptions/refunds and creates distinct linked settlements while
 *      preserving confirmed rows and quarantining disagreements);
 *   2. writes the reconciled beneficiary/merchant/program read models with the
 *      COMPLETED run's evidence (a `partial` run yields stale read models), when a
 *      projection source is provided.
 *
 * It never confirms — the worker owns the confirmation invariants — and never
 * invents ownership.
 */
export const createVoucherReconciler = (deps: VoucherReconcilerDependencies) => {
  const reconcileProgram = async (
    request: VoucherReconcileRequest,
  ): Promise<VoucherReconcileResult> => {
    const correlationId = request.correlationId ?? newCorrelationId();
    const network = request.network ?? PILOT_WALLET_NETWORK;
    const streamName = request.streamName ?? 'voucher_redemption';

    const summary = await deps.worker.runStream({
      attempts: request.attempts,
      streamName,
      network,
      organizationId: request.organizationId,
      programId: request.programId,
      cursorValue: request.cursorValue ?? null,
      correlationId,
    } satisfies ReconciliationRunParams);

    let projectionWritten = false;
    const completedRun = deps.runReader ? await deps.runReader.load(summary.run.id) : null;
    if (
      deps.projectionSource !== undefined &&
      completedRun !== null &&
      completedRun.completed_at !== null &&
      completedRun.end_ledger_sequence !== null &&
      completedRun.end_ledger_sequence > 0
    ) {
      const { writes } = await deps.projectionSource.computeWrites({
        programId: request.programId,
        organizationId: request.organizationId,
        run: completedRun,
        runStatus: summary.status === 'completed' ? 'completed' : 'partial',
        network,
        staleWindowSeconds: request.staleWindowSeconds ?? deps.defaultStaleWindowSeconds,
        correlationId,
      });
      if (writes.length > 0) {
        await deps.projections.write(writes);
        projectionWritten = true;
      }
    }

    return { summary, projectionWritten };
  };

  return Object.freeze({ reconcileProgram });
};

// ---------------------------------------------------------------------------
// Default service-backed voucher reconciliation store.
// ---------------------------------------------------------------------------
//
// The store wires the injected voucher domain port to real persistence. Loading
// uses the service client directly; confirming a submitted redemption/refund is a
// guarded UPDATE (the `submitted`/non-terminal status filter makes it idempotent,
// and the DB transition trigger fails closed on any out-of-order call), and the
// distinct linked settlement is an INSERT through the narrow append-only writer.
// The service client bypasses RLS, so these are constructed server-side only.


const voucherStoreError = (correlationId: string, message: string): FinancialErrorException =>
  new FinancialErrorException(
    makeFinancialError('reconciliation_failed', message, { correlationId, retryable: true }),
  );

export interface ServiceVoucherReconciliationStoreDependencies {
  readonly serviceClient: TypedSupabaseClient;
  readonly serviceWriter: ServiceWriter;
  readonly newId?: () => string;
  readonly clock?: () => Date;
  readonly correlationId?: string;
}

/**
 * Builds the {@link VoucherReconciliationStore} backed by the service client and
 * the narrow append-only writer. Confirms a submitted redemption and creates its
 * distinct linked settlement, and confirms a submitted/approved refund, all bound
 * to immutable ledger/contract evidence.
 */
export const createServiceVoucherReconciliationStore = (
  deps: ServiceVoucherReconciliationStoreDependencies,
): VoucherReconciliationStore => {
  const baseCorrelationId = deps.correlationId ?? newCorrelationId();
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const nowIso = () => (deps.clock ?? (() => new Date()))().toISOString();

  const loadRedemption: VoucherReconciliationStore['loadRedemption'] = async ({
    financialIntentId,
    transactionHash,
  }) => {
    // Resolve the payment intent behind the confirmed attempt, then its redemption.
    const { data: payment, error: paymentError } = await deps.serviceClient
      .from('payment_intents')
      .select('id')
      .eq('financial_intent_id', financialIntentId)
      .maybeSingle();
    if (paymentError) {
      safeLog('failed to load payment intent for redemption', { correlationId: baseCorrelationId, error: paymentError });
      throw voucherStoreError(baseCorrelationId, 'Unable to load the payment intent right now.');
    }
    if (!payment) {
      return null;
    }
    const { data, error } = await deps.serviceClient
      .from('voucher_redemptions')
      .select('*')
      .eq('payment_intent_id', payment.id)
      .eq('transaction_hash', transactionHash)
      .maybeSingle();
    if (error) {
      safeLog('failed to load voucher redemption', { correlationId: baseCorrelationId, error });
      throw voucherStoreError(baseCorrelationId, 'Unable to load the redemption right now.');
    }
    return data ?? null;
  };

  const settlementExistsForRedemption: VoucherReconciliationStore['settlementExistsForRedemption'] = async (
    redemptionId,
  ) => {
    const { data, error } = await deps.serviceClient
      .from('settlements')
      .select('id')
      .eq('voucher_redemption_id', redemptionId)
      .maybeSingle();
    if (error) {
      safeLog('failed to check existing settlement', { correlationId: baseCorrelationId, error });
      throw voucherStoreError(baseCorrelationId, 'Unable to check the settlement right now.');
    }
    return data !== null;
  };

  const confirmRedemptionWithSettlement: VoucherReconciliationStore['confirmRedemptionWithSettlement'] = async ({
    redemption,
    evidence,
    correlationId,
  }) => {
    const confirmedAt = nowIso();
    // Confirm the redemption (submitted -> confirmed); guarded so it is idempotent.
    const { error: redemptionError } = await deps.serviceClient
      .from('voucher_redemptions')
      .update({
        status: 'confirmed',
        ledger: evidence.ledgerSequence,
        contract_event_index: evidence.contractEventIndex,
        ledger_transaction_id: evidence.ledgerTransactionId,
        contract_event_id: evidence.contractEventId,
        confirmed_at: confirmedAt,
      })
      .eq('id', redemption.id)
      .eq('status', 'submitted');
    if (redemptionError) {
      safeLog('failed to confirm voucher redemption', { correlationId, error: redemptionError });
      throw voucherStoreError(correlationId, 'Unable to confirm the redemption right now.');
    }

    // Create the DISTINCT linked settlement once (idempotent by uniqueness on
    // voucher_redemption_id). It shares the same immutable evidence but is not
    // conflated with the redemption (Requirement 12.4).
    if (await settlementExistsForRedemption(redemption.id)) {
      return;
    }
    const { data: payment, error: paymentError } = await deps.serviceClient
      .from('payment_intents')
      .select('settlement_wallet_id')
      .eq('id', redemption.payment_intent_id)
      .maybeSingle();
    if (paymentError || !payment) {
      safeLog('failed to load settlement wallet for settlement', { correlationId, error: paymentError });
      throw voucherStoreError(correlationId, 'Unable to load the settlement wallet right now.');
    }
    const settlement: SettlementInsert = {
      id: newId(),
      organization_id: redemption.organization_id,
      payment_intent_id: redemption.payment_intent_id,
      voucher_redemption_id: redemption.id,
      program_id: redemption.program_id,
      merchant_id: redemption.merchant_id,
      settlement_wallet_id: payment.settlement_wallet_id,
      kind: 'voucher_redemption',
      amount_stroops: redemption.amount_stroops,
      transaction_hash: evidence.transactionHash,
      ledger: evidence.ledgerSequence,
      contract_id: redemption.contract_id,
      contract_event_index: evidence.contractEventIndex,
      ledger_transaction_id: evidence.ledgerTransactionId,
      contract_event_id: evidence.contractEventId,
      status: 'confirmed',
      confirmed_at: confirmedAt,
      correlation_id: redemption.correlation_id,
    };
    await deps.serviceWriter.appendRows('settlements', settlement);
  };

  const loadRefund: VoucherReconciliationStore['loadRefund'] = async ({ financialIntentId, transactionHash }) => {
    // A refund's financial intent is the compensating intent; resolve the refund
    // by its confirmed transaction hash (bound to that intent's correlation).
    const { data: intent, error: intentError } = await deps.serviceClient
      .from('financial_intents')
      .select('correlation_id')
      .eq('id', financialIntentId)
      .maybeSingle();
    if (intentError) {
      safeLog('failed to load refund intent', { correlationId: baseCorrelationId, error: intentError });
      throw voucherStoreError(baseCorrelationId, 'Unable to load the refund intent right now.');
    }
    if (!intent) {
      return null;
    }
    const { data, error } = await deps.serviceClient
      .from('refunds')
      .select('*')
      .eq('correlation_id', intent.correlation_id)
      .eq('transaction_hash', transactionHash)
      .maybeSingle();
    if (error) {
      safeLog('failed to load refund', { correlationId: baseCorrelationId, error });
      throw voucherStoreError(baseCorrelationId, 'Unable to load the refund right now.');
    }
    return data ?? null;
  };

  const confirmRefund: VoucherReconciliationStore['confirmRefund'] = async ({ refund, evidence, correlationId }) => {
    const { error } = await deps.serviceClient
      .from('refunds')
      .update({
        status: 'confirmed',
        ledger: evidence.ledgerSequence,
        contract_event_index: evidence.contractEventIndex,
        ledger_transaction_id: evidence.ledgerTransactionId,
        contract_event_id: evidence.contractEventId,
        transaction_hash: evidence.transactionHash,
        confirmed_at: nowIso(),
      })
      .eq('id', refund.id)
      .in('status', ['requested', 'approved', 'signed', 'submitted']);
    if (error) {
      safeLog('failed to confirm refund', { correlationId, error });
      throw voucherStoreError(correlationId, 'Unable to confirm the refund right now.');
    }
  };

  return {
    loadRedemption,
    confirmRedemptionWithSettlement,
    settlementExistsForRedemption,
    loadRefund,
    confirmRefund,
  };
};

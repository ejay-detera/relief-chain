// Beneficiary-initiated voucher payment / redemption (Soroban rail):
// OperationProtocol strategy + prepare/submit orchestration.
//
// A voucher payment redeems a signed canonical VOUCHER invoice against the
// program's isolated Soroban contract instance. Unlike the cash rail — where the
// beneficiary signs the classic transaction envelope and a sponsor fee-bump pays
// fees — a Soroban redemption uses AUTH-ENTRY signing (design "Voucher Contract"
// / "Prepare/Sign/Submit Protocol"):
//
//   - The SPONSOR is the transaction SOURCE, so the sponsor pays fees by being
//     the source (no fee-bump is needed or used). Requirement 14.1.
//   - The BENEFICIARY authorizes the EXACT contract invocation by signing a
//     Soroban authorization entry (invocation tree, nonce, signature-expiration
//     ledger, network). Requirements 3.6, 11.5.
//   - The server verifies that returned auth entry against the stored intent and
//     INSERTS it into the built transaction BEFORE signing (as source) and
//     submitting. A source-account/fee sponsorship can NEVER supply or substitute
//     for the beneficiary's contract authorization (design Property 3).
//
// This module composes the Task 6.1 typed errors/redaction, the Task 6.2 guarded
// clients / isolated institutional signers, the Task 6.3 reusable prepare/build/
// authorize/submit protocol, the Task 6.5 sponsorship governor, and the Task 8
// canonical invoice codec. It owns only the voucher-redemption specifics; the
// rail-agnostic invariants (immutable intent, one attempt per business key,
// `submitted`-not-`confirmed`, reconcile-before-retry) stay in the reusable
// transaction protocol.
//
// The redemption rules this module enforces ONLINE before submission
// (Requirements 3.6, 10.6, 11.5, 13.6, 14.1, 18.3, 18.8):
//
//   - VALIDATE THE CANONICAL INVOICE. The signed voucher invoice must verify
//     against its own merchant `invoiceSigner`, be unexpired (ten-minute window),
//     and be well-formed (Requirement 10.6). A used invoice nonce is rejected.
//   - REVALIDATE MERCHANT / PROGRAM / CATEGORY / LIMITS / BALANCE / EXPIRY. Even
//     though the contract enforces every rule on-chain, the server revalidates
//     the resolved merchant authorization, program binding, per-transaction and
//     daily limits, entitlement balance, and program/entitlement expiry against
//     the freshly-read state before it will build or submit (Requirement 13.6).
//   - RETURN ONLY THE EXACT BENEFICIARY AUTH. `build` returns a Soroban auth-entry
//     signing package — never an institutional secret and never a submittable
//     envelope.
//   - VERIFY THE RETURNED AUTH AGAINST INTENT. `verifyAndAssemble` confirms the
//     returned auth entry authorizes exactly the expected beneficiary, contract,
//     `redeem` function, nonce, and signature-expiration ledger before it is
//     inserted, then signs with the sponsor SOURCE and submits.
//   - BIND A DETERMINISTIC KEY TO THE INVOICE. The idempotency key derives from
//     the one-time invoice id (which embeds the invoice nonce), so re-presenting
//     the same invoice can never produce a second redemption (design Property 2).
//   - NEVER CONFIRM HERE. `submit` only ever marks the attempt `submitted`;
//     finality is reconciliation-owned (Task 6.4 / 11.5).
//
// The raw Soroban XDR construction (the `redeem` invokeHostFunction op,
// simulation, auth-entry extraction, auth insertion, assembly) is a live-network
// concern and is injected through the {@link VoucherRedemptionBuilder} /
// {@link VoucherRedemptionSubmitter} ports — exactly as voucher-program.ts injects
// its builder/submitter — so the validation, hashing, and orchestration logic
// here is pure, reads no Deno globals, stays inside the project-wide type check,
// and is fully offline unit-testable.
//
// Validates: Requirements 3.6, 10.6, 11.5, 14.1, 18.3, 18.8

import {
    type Transaction,
    TransactionBuilder,
} from '@stellar/stellar-sdk';

import {
    requireRCPHPIdentifiers,
    type StellarTestnetConfig,
} from '../../../../shared/stellar-config.ts';
import type { Json } from '../../../../src/types/database.types.ts';
import { FinancialErrorException, newCorrelationId } from '../errors.ts';
import { safeLog } from '../redaction.ts';

import {
    assertNotExpired,
    assertVerifiedInvoice,
    computeInvoiceId,
    InvoiceCodecError,
    type InvoiceV1,
} from './invoice.ts';
import { createNetworkGuard, type NetworkGuard } from './network-guard.ts';
import {
    type BuildResult,
    type FinancialIntentRecord,
    type OperationProtocol,
    PILOT_WALLET_NETWORK,
    type SignedSubmission,
    type SigningPackage,
    type StrategyContext,
    type SubmissionAcceptance,
    type SubmitResult,
    type TransactionAttemptRecord,
    type TransactionProtocol,
    type VerifyContext,
} from './protocol.ts';
import type { GuardedRpcClient } from './rpc.ts';
import type { InstitutionalSignerRegistry } from './signers.ts';
import {
    assertAuthorizationMatches,
    parseAndReadAuthorizationEntry,
    SorobanAuthorizationError,
} from './soroban-auth.ts';
import { assertSponsorSeparation, type SponsorGovernor } from './sponsorship.ts';
import { transactionHashHex, XdrParseError } from './xdr.ts';

// ---------------------------------------------------------------------------
// Constants and validation patterns.
// ---------------------------------------------------------------------------

/** The idempotency scope and operation type for a voucher redemption. */
export const VOUCHER_PAYMENT_SCOPE = 'voucher_redemption' as const;

/** The contract function a redemption authorization must target. */
export const REDEEM_FUNCTION = 'redeem' as const;

/** A funded Stellar public account ID (`G...`). */
const G_ADDRESS = /^G[A-Z2-7]{55}$/;
/** A Soroban contract / SAC address (`C...`). */
const C_ADDRESS = /^C[A-Z2-7]{55}$/;
/** A 32-byte identifier rendered as 64 lowercase hex characters. */
const HEX_32_BYTES = /^[0-9a-f]{64}$/;
/** An accreditation / program category CODE — never free text. */
const CATEGORY_CODE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const sha256Hex = async (canonical: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return toHex(digest);
};

const reject = (correlationId: string, message: string, field?: string): never => {
  throw FinancialErrorException.of('validation_failed', message, {
    correlationId,
    fieldErrors: field ? { [field]: ['is invalid'] } : undefined,
  });
};

const assertShape = (
  value: string,
  pattern: RegExp,
  field: string,
  correlationId: string,
): void => {
  if (typeof value !== 'string' || !pattern.test(value)) {
    reject(correlationId, `${field} has an invalid format.`, field);
  }
};

const assertPositiveI128 = (value: number, field: string, correlationId: string): void => {
  if (!Number.isInteger(value) || value <= 0) {
    reject(correlationId, `${field} must be a positive integer number of stroops.`, field);
  }
};

/**
 * The deterministic business idempotency key for a voucher redemption, bound to
 * the one-time invoice id (which embeds the invoice nonce). Re-presenting the
 * same invoice reuses this key and can never produce a second redemption.
 */
export const makeVoucherPaymentKey = (invoiceId: string): string =>
  `voucher_redemption:invoice:${invoiceId}`;

/** The SHA-256 invoice id for a signed invoice (unsigned canonical bytes). */
export const invoiceIdOf = (invoice: InvoiceV1): string => {
  const { merchantSignature: _signature, ...unsigned } = invoice;
  return computeInvoiceId(unsigned);
};

// ---------------------------------------------------------------------------
// Resolved on-chain-derived state the redemption is revalidated against.
// ---------------------------------------------------------------------------

/**
 * The frozen program policy a redemption is revalidated against. Every field is
 * a pseudonymous identifier, a contract/SAC address, a category code, an integer
 * stroop limit, or a Unix-seconds expiry — PII-free.
 */
export interface RedemptionProgramPolicy {
  /** Pseudonymous program identifier; must equal the invoice `programId`. */
  readonly programRef: string;
  /** The voucher program's contract instance; must equal the invoice `contractId`. */
  readonly contractId: string;
  /** The `RCPHP` SAC the instance settles through. */
  readonly sacAddress: string;
  /** The categories the program authorizes. */
  readonly authorizedCategories: readonly string[];
  /** Per-redemption ceiling, in stroops. */
  readonly perTransactionLimitStroops: number;
  /** Program expiry, as a Unix-seconds timestamp. */
  readonly programExpiresAt: number;
}

/** The freshly-read merchant authorization the redemption is revalidated against. */
export interface RedemptionMerchantState {
  /** Pseudonymous merchant identifier; must equal the invoice `merchantId`. */
  readonly merchantId: string;
  /** The verified settlement wallet; must equal the invoice `settlementWallet`. */
  readonly settlementWallet: string;
  /** The merchant's active accreditation category code. */
  readonly category: string;
  /** Authorization validity end, as a Unix-seconds timestamp. */
  readonly validUntil: number;
  /** Whether the merchant is currently authorized for the program. */
  readonly authorized: boolean;
}

/** The freshly-read beneficiary entitlement the redemption is revalidated against. */
export interface RedemptionEntitlementState {
  /** Pseudonymous 32-byte entitlement identifier. */
  readonly entitlementId: string;
  /** Remaining spendable entitlement balance, in stroops. */
  readonly balanceStroops: number;
  /** Per-entitlement daily ceiling, in stroops. */
  readonly dailyLimitStroops: number;
  /** Entitlement value already spent within the current day, in stroops. */
  readonly spentTodayStroops: number;
  /** Entitlement expiry, as a Unix-seconds timestamp. */
  readonly expiresAt: number;
}

// ---------------------------------------------------------------------------
// Online invoice + policy revalidation (pure, fail-closed).
// ---------------------------------------------------------------------------

/**
 * Verifies the signed canonical VOUCHER invoice online: the merchant signature
 * must verify against the invoice's own `invoiceSigner`, the invoice must not
 * have expired (the frozen ten-minute window), and it must be a voucher invoice.
 * Translates the codec's {@link InvoiceCodecError} into the typed financial
 * error taxonomy. Requirement 10.6.
 */
export const assertInvoiceVerifiedAndFresh = (
  invoice: InvoiceV1,
  nowMs: number,
  correlationId: string,
): void => {
  if (invoice.kind !== 'voucher') {
    reject(correlationId, 'A voucher payment requires a voucher invoice.', 'kind');
  }
  try {
    assertVerifiedInvoice(invoice);
    assertNotExpired(invoice, nowMs);
  } catch (cause) {
    if (cause instanceof InvoiceCodecError) {
      if (cause.code === 'expired') {
        throw FinancialErrorException.of('invoice_expired', 'The invoice has expired.', { correlationId });
      }
      if (cause.code === 'invalid_signature') {
        throw FinancialErrorException.of(
          'validation_failed',
          'The invoice merchant signature is invalid.',
          { correlationId, fieldErrors: { merchantSignature: ['is invalid'] } },
        );
      }
      reject(correlationId, `The invoice is not valid: ${cause.message}`);
    }
    throw cause;
  }
};

/**
 * Revalidates a voucher redemption against the freshly-read program policy,
 * merchant authorization, and beneficiary entitlement (Requirement 13.6). This
 * mirrors — and runs before — the contract's own on-chain enforcement so a
 * revoked merchant, wrong category, over-limit, insufficient, or expired
 * redemption is refused before any transaction is built or submitted. Throws a
 * typed financial error on the FIRST violation; returns nothing on success.
 */
export const assertVoucherInvoiceRedeemable = (
  params: {
    readonly invoice: InvoiceV1;
    readonly policy: RedemptionProgramPolicy;
    readonly merchant: RedemptionMerchantState;
    readonly entitlement: RedemptionEntitlementState;
    readonly amountStroops: number;
    readonly nowSeconds: number;
  },
  correlationId: string,
): void => {
  const { invoice, policy, merchant, entitlement, amountStroops, nowSeconds } = params;
  if (invoice.kind !== 'voucher') {
    reject(correlationId, 'A voucher payment requires a voucher invoice.', 'kind');
    return;
  }

  // PROGRAM binding: the invoice must target this exact program instance.
  if (invoice.contractId !== policy.contractId) {
    reject(correlationId, 'The invoice targets a different voucher contract.', 'contractId');
  }
  if (invoice.programId !== policy.programRef) {
    reject(correlationId, 'The invoice is not for this program.', 'programId');
  }

  // MERCHANT binding + authorization: the settlement wallet, identity, and
  // active authorization must all match the freshly-read merchant.
  if (invoice.settlementWallet !== merchant.settlementWallet) {
    reject(correlationId, 'The invoice settlement wallet is not the verified merchant wallet.', 'settlementWallet');
  }
  if (invoice.merchantId !== merchant.merchantId) {
    reject(correlationId, 'The invoice merchant does not match the verified merchant.', 'merchantId');
  }
  if (!merchant.authorized) {
    throw FinancialErrorException.of(
      'authorization_failed',
      'The merchant is not authorized for this program.',
      { correlationId },
    );
  }
  if (!Number.isInteger(merchant.validUntil) || merchant.validUntil <= nowSeconds) {
    throw FinancialErrorException.of(
      'authorization_failed',
      'The merchant accreditation has expired.',
      { correlationId },
    );
  }

  // CATEGORY: the invoiced category must be authorized by the program AND match
  // the merchant's active accreditation category (Requirement 17.1).
  assertShape(invoice.category, CATEGORY_CODE, 'category', correlationId);
  if (!policy.authorizedCategories.includes(invoice.category)) {
    reject(correlationId, 'The invoice category is not authorized for this program.', 'category');
  }
  if (invoice.category !== merchant.category) {
    reject(correlationId, 'The invoice category does not match the merchant accreditation.', 'category');
  }

  // AMOUNT: the resolved amount must equal the invoiced amount and be positive.
  assertPositiveI128(amountStroops, 'amountStroops', correlationId);
  let invoiceAmount: bigint;
  try {
    invoiceAmount = BigInt(invoice.amountStroops);
  } catch {
    reject(correlationId, 'The invoice amount is not a canonical stroop value.', 'amountStroops');
    return;
  }
  if (invoiceAmount !== BigInt(amountStroops)) {
    reject(correlationId, 'The resolved amount does not equal the invoiced amount.', 'amountStroops');
  }

  // EXPIRY: neither the program nor the entitlement may have expired.
  if (!Number.isInteger(policy.programExpiresAt) || policy.programExpiresAt <= nowSeconds) {
    reject(correlationId, 'The program has expired; redemption is closed.', 'programExpiresAt');
  }
  if (!Number.isInteger(entitlement.expiresAt) || entitlement.expiresAt <= nowSeconds) {
    reject(correlationId, 'The entitlement has expired.', 'expiresAt');
  }

  // PER-TRANSACTION LIMIT.
  assertPositiveI128(policy.perTransactionLimitStroops, 'perTransactionLimitStroops', correlationId);
  if (invoiceAmount > BigInt(policy.perTransactionLimitStroops)) {
    reject(correlationId, 'The amount exceeds the per-transaction limit.', 'amountStroops');
  }

  // BALANCE: the entitlement must hold enough value.
  if (!Number.isInteger(entitlement.balanceStroops) || entitlement.balanceStroops < 0) {
    reject(correlationId, 'The entitlement balance is invalid.', 'balanceStroops');
  }
  if (invoiceAmount > BigInt(entitlement.balanceStroops)) {
    throw FinancialErrorException.of(
      'insufficient_balance',
      'The entitlement does not hold enough value for this redemption.',
      { correlationId },
    );
  }

  // DAILY LIMIT: spent-today plus this amount must stay within the daily ceiling.
  assertPositiveI128(entitlement.dailyLimitStroops, 'dailyLimitStroops', correlationId);
  if (!Number.isInteger(entitlement.spentTodayStroops) || entitlement.spentTodayStroops < 0) {
    reject(correlationId, 'The entitlement daily spend is invalid.', 'spentTodayStroops');
  }
  if (BigInt(entitlement.spentTodayStroops) + invoiceAmount > BigInt(entitlement.dailyLimitStroops)) {
    reject(correlationId, 'The amount exceeds the entitlement daily limit.', 'amountStroops');
  }
};

// ---------------------------------------------------------------------------
// Canonical payload hash.
// ---------------------------------------------------------------------------

/** The immutable business identity of a voucher-redemption request. */
export interface VoucherPaymentPayload {
  readonly organizationId: string;
  readonly programId: string;
  readonly contractId: string;
  readonly invoiceId: string;
  readonly beneficiaryIdentityId: string;
  readonly beneficiaryWallet: string;
  readonly merchantSettlementWallet: string;
  readonly entitlementId: string;
  readonly amountStroops: number;
  readonly networkPassphrase: string;
}

/**
 * Deterministic canonical payload hash for a voucher-redemption request (64
 * lowercase hex). It binds the organization, program, contract instance,
 * invoice, beneficiary and its wallet, the merchant settlement wallet, the
 * entitlement, the amount, and the network — but NOT the transaction sequence or
 * the auth nonce — so a retry under the same invoice-bound key hashes identically
 * and reuses the one intent.
 */
export const computeVoucherPaymentPayloadHash = (
  payload: VoucherPaymentPayload,
): Promise<string> =>
  sha256Hex(
    [
      'voucher_redemption',
      'v1',
      payload.organizationId,
      payload.programId,
      payload.contractId,
      payload.invoiceId,
      payload.beneficiaryIdentityId,
      payload.beneficiaryWallet,
      payload.merchantSettlementWallet,
      payload.entitlementId,
      payload.amountStroops.toString(),
      payload.networkPassphrase,
    ].join('|'),
  );

// ---------------------------------------------------------------------------
// Invocation spec + injected Soroban ports.
// ---------------------------------------------------------------------------

/**
 * The exact, non-secret parameters of a single voucher redemption. The
 * {@link VoucherRedemptionBuilder} turns this into a sponsor-sourced transaction
 * carrying the `redeem` invocation plus the exact beneficiary auth entry to sign.
 * Nothing here carries a secret key.
 */
export interface VoucherRedemptionSpec {
  /** The voucher program contract instance the redemption targets. */
  readonly contractId: string;
  /** The `RCPHP` SAC the instance settles through. */
  readonly sacAddress: string;
  /** The sponsor account that is the transaction SOURCE (pays fees). */
  readonly sponsorSource: string;
  /** The beneficiary wallet that must authorize the invocation. */
  readonly beneficiaryWallet: string;
  /** The verified merchant settlement wallet the contract will pay. */
  readonly merchantSettlementWallet: string;
  /** The pseudonymous 32-byte entitlement identifier. */
  readonly entitlementId: string;
  /** The signed canonical voucher invoice being redeemed. */
  readonly invoice: InvoiceV1;
  /** The redemption amount, in stroops (equals the invoiced amount). */
  readonly amountStroops: number;
}

/**
 * A built, simulation-assembled voucher redemption. The transaction is sourced
 * by the sponsor and carries the `redeem` invocation; the beneficiary auth entry
 * is pending until the client signs and returns it. `unsignedAuthEntryXdr` is the
 * EXACT authorization entry the beneficiary must sign.
 */
export interface BuiltVoucherRedemption {
  /** The sponsor-sourced transaction envelope (redeem op; beneficiary auth pending). */
  readonly envelopeXdr: string;
  /** Lowercase-hex hash (64 hex) of the exact prepared transaction. */
  readonly preparedPayloadHash: string;
  readonly minLedger: number | null;
  readonly maxLedger: number | null;
  /** The exact Soroban authorization entry the beneficiary must sign (base64). */
  readonly unsignedAuthEntryXdr: string;
  /** Ledger after which the beneficiary signature is invalid. */
  readonly signatureExpirationLedger: number;
  /** The authorization-entry nonce, as a decimal string (binds the exact entry). */
  readonly authNonce: string;
}

export interface AssembleRedemptionInput {
  /** The sponsor-sourced envelope produced by `build` (from the stored attempt). */
  readonly builtEnvelopeXdr: string;
  /** The beneficiary-signed authorization entry returned by the client (base64). */
  readonly signedAuthEntryXdr: string;
  readonly correlationId: string;
}

/**
 * Builds and assembles the exact Soroban redemption transaction against the
 * guarded RPC (simulation, footprint, resource fees, auth-entry extraction and
 * insertion). Implemented by the voucher-payment Edge Function wiring using the
 * guarded RPC client and the SDK; injected here so the orchestration/validation
 * logic is offline-testable without constructing real contract XDR.
 */
export interface VoucherRedemptionBuilder {
  /** Simulates `redeem` and returns the sponsor-sourced tx + the auth entry to sign. */
  build(
    spec: VoucherRedemptionSpec,
    context: { readonly correlationId: string },
  ): Promise<BuiltVoucherRedemption>;
  /**
   * Inserts the beneficiary-signed authorization entry into the built
   * transaction and returns the assembled transaction, still sourced by the
   * sponsor and awaiting the sponsor's source signature.
   */
  assemble(input: AssembleRedemptionInput): Promise<Transaction>;
}

/** Submits a fully-assembled transaction through the guarded RPC client. */
export interface VoucherRedemptionSubmitter {
  submit(transaction: Transaction): Promise<SubmissionAcceptance>;
}

// ---------------------------------------------------------------------------
// Authorization-payload read helpers (bind verify to the exact built entry).
// ---------------------------------------------------------------------------

const readAuthPayloadString = (
  payload: Json | null,
  key: string,
  correlationId: string,
): string => {
  if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
    const value = (payload as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  throw FinancialErrorException.of(
    'validation_failed',
    'The prepared redemption is missing required authorization metadata.',
    { correlationId },
  );
};

const readAuthPayloadNumber = (
  payload: Json | null,
  key: string,
  correlationId: string,
): number => {
  if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
    const value = (payload as Record<string, unknown>)[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  throw FinancialErrorException.of(
    'validation_failed',
    'The prepared redemption is missing required authorization metadata.',
    { correlationId },
  );
};

// ---------------------------------------------------------------------------
// OperationProtocol strategy.
// ---------------------------------------------------------------------------

export interface VoucherRedemptionStrategyDependencies {
  /** The exact redemption this strategy builds and verifies. */
  readonly spec: VoucherRedemptionSpec;
  readonly builder: VoucherRedemptionBuilder;
  readonly submitter: VoucherRedemptionSubmitter;
}

/**
 * Builds the voucher-redemption {@link OperationProtocol} strategy. `build`
 * delegates the exact Soroban transaction construction (and `redeem` simulation)
 * to the injected builder and returns ONLY the beneficiary auth-entry signing
 * package. `verifyAndAssemble` verifies the returned auth entry authorizes
 * exactly the expected beneficiary / contract / `redeem` / nonce /
 * signature-expiration ledger against the stored intent, inserts it into the
 * built transaction, signs with the sponsor SOURCE (fees only — never the
 * contract authorization), and submits. It never marks the attempt confirmed.
 */
export const createVoucherRedemptionStrategy = (
  deps: VoucherRedemptionStrategyDependencies,
): OperationProtocol => {
  const { spec } = deps;

  const build = async (context: StrategyContext): Promise<BuildResult> => {
    const { config, correlationId, guard } = context;

    const built = await deps.builder.build(spec, { correlationId });

    // The built transaction must be bound to the configured testnet.
    guard.assertNetworkPassphrase(
      TransactionBuilder.fromXDR(built.envelopeXdr, config.networkPassphrase).networkPassphrase,
    );

    // Return ONLY the exact beneficiary auth entry to sign; no institutional
    // material, no submittable envelope.
    const signingPackage: SigningPackage = {
      kind: 'soroban_auth_entry',
      unsignedAuthEntryXdr: built.unsignedAuthEntryXdr,
      contractId: spec.contractId,
      functionName: REDEEM_FUNCTION,
      authorizer: spec.beneficiaryWallet,
      signatureExpirationLedger: built.signatureExpirationLedger,
      networkPassphrase: config.networkPassphrase,
    };

    return {
      network: PILOT_WALLET_NETWORK,
      envelopeXdr: built.envelopeXdr,
      preparedPayloadHash: built.preparedPayloadHash,
      minLedger: built.minLedger,
      maxLedger: built.maxLedger,
      signingPackage,
      authorizationPayload: {
        operation: VOUCHER_PAYMENT_SCOPE,
        contract_id: spec.contractId,
        authorizer: spec.beneficiaryWallet,
        function_name: REDEEM_FUNCTION,
        signature_expiration_ledger: built.signatureExpirationLedger,
        auth_nonce: built.authNonce,
      },
    };
  };

  const verifyAndAssemble = async (context: VerifyContext) => {
    const { config, correlationId, attempt, signed } = context;

    if (signed.kind !== 'soroban_auth_entry') {
      throw FinancialErrorException.of(
        'validation_failed',
        'A voucher redemption expects a signed Soroban authorization entry.',
        { correlationId },
      );
    }

    // Parse the beneficiary-returned authorization entry, failing closed on
    // malformed input.
    let parsed;
    try {
      parsed = parseAndReadAuthorizationEntry(signed.signedAuthEntryXdr);
    } catch (cause) {
      if (cause instanceof XdrParseError) {
        throw FinancialErrorException.of(
          'validation_failed',
          'The returned authorization entry could not be parsed.',
          { correlationId },
        );
      }
      throw cause;
    }

    // The entry MUST authorize exactly the expected beneficiary, contract, and
    // `redeem` function — the beneficiary's contract authorization.
    try {
      assertAuthorizationMatches(parsed, {
        authorizer: spec.beneficiaryWallet,
        contractId: spec.contractId,
        functionName: REDEEM_FUNCTION,
      });
    } catch (cause) {
      if (cause instanceof SorobanAuthorizationError) {
        throw FinancialErrorException.of('authorization_failed', cause.message, { correlationId });
      }
      throw cause;
    }

    // Bind the returned entry to the EXACT one the server prepared: the
    // signature-expiration ledger and nonce must match the stored intent, so a
    // client cannot substitute a different (e.g. longer-lived or replayed)
    // authorization. This is the "verify signatures/ledger bounds against
    // intent" check.
    const expectedSigExp = readAuthPayloadNumber(
      attempt.authorization_payload,
      'signature_expiration_ledger',
      correlationId,
    );
    const expectedNonce = readAuthPayloadString(attempt.authorization_payload, 'auth_nonce', correlationId);
    if (parsed.credentials.signatureExpirationLedger !== expectedSigExp) {
      throw FinancialErrorException.of(
        'validation_failed',
        'The authorization signature-expiration ledger does not match the prepared invocation.',
        { correlationId },
      );
    }
    if (parsed.credentials.nonce !== expectedNonce) {
      throw FinancialErrorException.of(
        'validation_failed',
        'The authorization nonce does not match the prepared invocation.',
        { correlationId },
      );
    }

    // Insert the verified beneficiary authorization into the built transaction.
    const assembled = await deps.builder.assemble({
      builtEnvelopeXdr: attempt.envelope_xdr as string,
      signedAuthEntryXdr: signed.signedAuthEntryXdr,
      correlationId,
    });

    // The SPONSOR is the transaction source and pays fees by being the source;
    // it MUST be distinct from every aid-holding account and can never supply the
    // beneficiary's contract authorization verified above (design Property 3).
    const rcphp = requireRCPHPIdentifiers(config);
    const sponsor = context.signers.get('sponsor');
    const sponsorPublicKey = sponsor.publicKey();
    if (assembled.source !== sponsorPublicKey) {
      throw FinancialErrorException.of(
        'validation_failed',
        'The redemption transaction must be sourced by the sponsor.',
        { correlationId },
      );
    }
    assertSponsorSeparation(
      {
        sponsor: sponsorPublicKey,
        beneficiary: spec.beneficiaryWallet,
        merchant: spec.merchantSettlementWallet,
        issuer: rcphp.issuer,
      },
      correlationId,
    );

    // The sponsor signs as source; no fee-bump is needed for a Soroban redemption.
    sponsor.signTransaction(assembled);
    const transactionHash = transactionHashHex(assembled);

    return {
      transactionHash,
      submit: (): Promise<SubmissionAcceptance> => deps.submitter.submit(assembled),
    };
  };

  return Object.freeze({ operationType: VOUCHER_PAYMENT_SCOPE, build, verifyAndAssemble });
};

// ---------------------------------------------------------------------------
// Prepare / submit orchestration.
// ---------------------------------------------------------------------------

export interface VoucherPaymentDependencies {
  readonly protocol: TransactionProtocol;
  readonly config: StellarTestnetConfig;
  /** Defaults to a guard built from `config`; supply one carrying allowed contracts. */
  readonly guard?: NetworkGuard;
  readonly signers: InstitutionalSignerRegistry;
  readonly builder: VoucherRedemptionBuilder;
  readonly submitter: VoucherRedemptionSubmitter;
  /** Optional pre-operation sponsorship gate. */
  readonly sponsor?: SponsorGovernor;
  /** Injected clock (ms); defaults to `Date.now`. */
  readonly now?: () => number;
}

export interface VoucherPaymentRequest {
  readonly organizationId: string;
  readonly programId: string;
  /** The signed canonical voucher invoice being redeemed. */
  readonly invoice: InvoiceV1;
  readonly beneficiaryIdentityId: string;
  /** The beneficiary's currently authorized wallet (`G...`); the authorizer. */
  readonly beneficiaryWallet: string;
  /** The freshly-read program policy the redemption is revalidated against. */
  readonly policy: RedemptionProgramPolicy;
  /** The freshly-read merchant authorization. */
  readonly merchant: RedemptionMerchantState;
  /** The freshly-read beneficiary entitlement. */
  readonly entitlement: RedemptionEntitlementState;
  /** The resolved redemption amount, in stroops (must equal the invoiced amount). */
  readonly amountStroops: number;
  /**
   * Whether this invoice nonce has already been consumed off-chain. A used nonce
   * is rejected before any transaction is built (Requirement 13.5).
   */
  readonly nonceAlreadyUsed?: boolean;
  /**
   * Optional explicit business idempotency key; defaults to a deterministic key
   * derived from the invoice id.
   */
  readonly idempotencyKey?: string;
  readonly requestedBy?: string | null;
  readonly correlationId?: string;
}

export interface PreparedVoucherPayment {
  readonly isReplay: boolean;
  readonly intent: FinancialIntentRecord;
  /** The built attempt, or `null` on a replay (reconcile the prior one instead). */
  readonly attempt: TransactionAttemptRecord | null;
  /** ONLY the beneficiary auth-entry signing package; `null` on a replay. */
  readonly signingPackage: SigningPackage | null;
  /** The captured invocation spec, needed by `submit`; `null` on a replay. */
  readonly spec: VoucherRedemptionSpec | null;
}

export interface VoucherPaymentSubmitRequest {
  readonly intent: FinancialIntentRecord;
  readonly attempt: TransactionAttemptRecord;
  readonly spec: VoucherRedemptionSpec;
  /** The beneficiary-signed Soroban authorization entry returned by the client. */
  readonly signed: SignedSubmission;
}

/**
 * Builds the voucher-payment orchestrator. It composes the reusable transaction
 * protocol with the redemption-specific online revalidation (canonical invoice,
 * merchant/program/category/limits/balance/expiry/nonce) and the Soroban
 * auth-entry signing flow, and exposes `prepare` (which returns the beneficiary
 * auth-entry signing package) and `submit` (which verifies the returned auth,
 * assembles the sponsor-sourced transaction, and marks the attempt `submitted`).
 */
export const createVoucherPayment = (deps: VoucherPaymentDependencies) => {
  const guard = deps.guard ?? createNetworkGuard(deps.config);
  guard.assertTestnetConfig();
  const now = deps.now ?? (() => Date.now());

  const strategyFor = (spec: VoucherRedemptionSpec): OperationProtocol =>
    createVoucherRedemptionStrategy({ spec, builder: deps.builder, submitter: deps.submitter });

  /**
   * Validates the request and the signed invoice ONLINE, revalidates the
   * merchant/program/category/limits/balance/expiry/nonce, persists the immutable
   * financial intent bound to the invoice, builds the sponsor-sourced redemption,
   * and returns ONLY the beneficiary auth-entry signing package. A replayed
   * invoice-bound key never builds a second attempt; the prior intent is returned
   * for reconciliation instead.
   */
  const prepare = async (request: VoucherPaymentRequest): Promise<PreparedVoucherPayment> => {
    const correlationId = request.correlationId ?? newCorrelationId();
    const nowMs = now();
    const nowSeconds = Math.floor(nowMs / 1000);

    // Shape validation before any trust is placed in the inputs.
    assertShape(request.beneficiaryWallet, G_ADDRESS, 'beneficiaryWallet', correlationId);
    assertShape(request.policy.contractId, C_ADDRESS, 'contractId', correlationId);
    assertShape(request.policy.sacAddress, C_ADDRESS, 'sacAddress', correlationId);
    assertShape(request.merchant.settlementWallet, G_ADDRESS, 'merchantSettlementWallet', correlationId);
    assertShape(request.entitlement.entitlementId, HEX_32_BYTES, 'entitlementId', correlationId);
    assertPositiveI128(request.amountStroops, 'amountStroops', correlationId);

    // The server will only ever interact with an allowlisted contract instance.
    guard.assertContractAllowed(request.policy.contractId);

    // A used invoice nonce can never be redeemed again (Requirement 13.5); reject
    // it before anything is built.
    if (request.nonceAlreadyUsed === true) {
      throw FinancialErrorException.of(
        'invoice_used',
        'This invoice has already been used and cannot be redeemed again.',
        { correlationId },
      );
    }

    // Verify the signed canonical invoice online, then revalidate every program,
    // merchant, category, limit, balance, and expiry rule against fresh state.
    assertInvoiceVerifiedAndFresh(request.invoice, nowMs, correlationId);
    assertVoucherInvoiceRedeemable(
      {
        invoice: request.invoice,
        policy: request.policy,
        merchant: request.merchant,
        entitlement: request.entitlement,
        amountStroops: request.amountStroops,
        nowSeconds,
      },
      correlationId,
    );

    // Optional sponsorship health gate before accepting new sponsored work.
    if (deps.sponsor !== undefined) {
      await deps.sponsor.authorize({
        estimatedCostStroops: 1_000_000,
        purpose: 'voucher_redemption_source',
        correlationId,
        organizationId: request.organizationId,
        programId: request.programId,
      });
    }

    const rcphp = requireRCPHPIdentifiers(deps.config);
    const invoiceId = invoiceIdOf(request.invoice);
    const idempotencyKey = request.idempotencyKey ?? makeVoucherPaymentKey(invoiceId);

    const payloadHash = await computeVoucherPaymentPayloadHash({
      organizationId: request.organizationId,
      programId: request.programId,
      contractId: request.policy.contractId,
      invoiceId,
      beneficiaryIdentityId: request.beneficiaryIdentityId,
      beneficiaryWallet: request.beneficiaryWallet,
      merchantSettlementWallet: request.merchant.settlementWallet,
      entitlementId: request.entitlement.entitlementId,
      amountStroops: request.amountStroops,
      networkPassphrase: deps.config.networkPassphrase,
    });

    const prepared = await deps.protocol.prepare({
      organizationId: request.organizationId,
      programId: request.programId,
      operationType: VOUCHER_PAYMENT_SCOPE,
      scope: VOUCHER_PAYMENT_SCOPE,
      idempotencyKey,
      payloadHash,
      amountStroops: request.amountStroops,
      assetCode: rcphp.code,
      assetIssuer: rcphp.issuer,
      beneficiaryIdentityId: request.beneficiaryIdentityId,
      requestedBy: request.requestedBy ?? null,
      correlationId,
      requestMetadata: {
        invoice_id: invoiceId,
        contract_id: request.policy.contractId,
        sac_address: request.policy.sacAddress,
        beneficiary_wallet: request.beneficiaryWallet,
        merchant_settlement_wallet: request.merchant.settlementWallet,
        entitlement_id: request.entitlement.entitlementId,
      },
    });

    // A replayed idempotency key must never redeem a second time; reconcile the
    // prior intent instead of building another attempt.
    if (prepared.isReplay) {
      return { isReplay: true, intent: prepared.intent, attempt: null, signingPackage: null, spec: null };
    }

    const spec: VoucherRedemptionSpec = {
      contractId: request.policy.contractId,
      sacAddress: request.policy.sacAddress,
      sponsorSource: deps.signers.publicKeyOf('sponsor'),
      beneficiaryWallet: request.beneficiaryWallet,
      merchantSettlementWallet: request.merchant.settlementWallet,
      entitlementId: request.entitlement.entitlementId,
      invoice: request.invoice,
      amountStroops: request.amountStroops,
    };

    const built = await deps.protocol.build(prepared.intent, strategyFor(spec));
    return {
      isReplay: false,
      intent: prepared.intent,
      attempt: built.attempt,
      signingPackage: built.signingPackage,
      spec,
    };
  };

  /**
   * Submits the beneficiary-signed redemption through the protocol, which
   * verifies the returned Soroban authorization against the stored intent, adds
   * only the sponsor SOURCE signature, and marks the attempt `submitted` after
   * network acceptance. Confirmation stays reconciliation-owned.
   */
  const submit = async (request: VoucherPaymentSubmitRequest): Promise<SubmitResult> => {
    const { intent, attempt, spec, signed } = request;
    if (attempt.envelope_xdr === null) {
      throw FinancialErrorException.of(
        'validation_failed',
        'This redemption attempt has no prepared transaction to submit.',
        { correlationId: attempt.correlation_id },
      );
    }
    return deps.protocol.submit({ intent, attempt }, signed, strategyFor(spec));
  };

  return Object.freeze({ prepare, submit });
};

// ---------------------------------------------------------------------------
// Default guarded-RPC submitter adapter.
// ---------------------------------------------------------------------------
//
// The submitter is the live-network boundary and is exercised by integration
// tests, not the offline unit harness. It re-asserts the network before sending
// so a mutated endpoint fails closed, then submits the fully-assembled
// (sponsor-sourced, beneficiary-authorized) transaction through the guarded
// Soroban RPC client. The redemption BUILDER (redeem invocation + simulation +
// auth-entry extraction/insertion) is provided by the voucher-payment Edge
// Function wiring, which owns the SDK-specific assembly, and is injected as
// {@link VoucherRedemptionBuilder}. Confirmation remains reconciliation-owned.

/**
 * Builds a {@link VoucherRedemptionSubmitter} from the guarded RPC client. It
 * verifies the network before sending and returns the accepted transaction hash
 * and status; confirmation remains reconciliation-owned.
 */
export const createRpcVoucherRedemptionSubmitter = (
  rpcClient: GuardedRpcClient,
): VoucherRedemptionSubmitter =>
  Object.freeze({
    async submit(transaction: Transaction): Promise<SubmissionAcceptance> {
      await rpcClient.assertNetwork();
      const response = await rpcClient.server.sendTransaction(transaction);
      const accepted = response as unknown as { hash?: string; status?: string };
      safeLog('voucher redemption submitted', { status: accepted.status });
      return {
        transactionHash: accepted.hash ?? transactionHashHex(transaction),
        resultCode: accepted.status ?? null,
      };
    },
  });

// Voucher administrative orchestration (Soroban rail): refund, dispute
// exception, wallet rotation, pause/resume, and closure.
//
// This module is the administrative complement of voucher-program.ts (which
// stands a program UP — deploy/fund/activate/allocate/set_merchant) and
// voucher-payment.ts (which redeems). It owns the five *operational* contract
// mutations the design's "Public Interface" defines beyond redemption
// (`refund`, `rotate_entitlement`, `pause`, `resume`, `close`) plus the
// off-chain dispute-exception routing that a refund requested after program
// expiry falls into. It composes the same shared primitives every other rail
// operation uses — the Task 6.1 typed errors/redaction, the Task 6.2 isolated
// institutional signers, the Task 6.3 prepare/build/authorize/submit protocol,
// the Task 6.5 sponsorship governor, the Task 6.6 approval/emergency policy,
// and the Task 11.3 Soroban auth-entry verification — and owns only the
// administrative specifics.
//
// Two signing shapes are used, matching the contract's authorization rules
// (design "Authorization"):
//
//   - `refund` requires the MERCHANT SETTLEMENT WALLET to authorize the exact
//     invocation (design: "refund requires the merchant settlement wallet and
//     links to the original redemption"). Like a redemption, the sponsor is the
//     transaction SOURCE (pays fees) and the merchant signs a Soroban
//     authorization entry the server verifies against the stored intent and
//     inserts before signing and submitting. A fee-bump can never supply the
//     merchant's contract authorization.
//   - `rotate_entitlement`, `pause`, `resume`, and `close` are administered by
//     the isolated `contract_admin` institutional signer (the testnet program
//     administrator / emergency authority; production replaces it with
//     multi-party authority). The admin signs the built classic transaction
//     server-side (Requirement 18.4: the mobile app never performs
//     contract-administration signing); the sponsor then adds a fees-only
//     fee-bump.
//
// Every administrative operation is gated, BEFORE anything is persisted, by:
//   - Organization authorization + RECENT step-up (Requirement 20.2: refunds,
//     wallet rotation, and emergency controls all require fresh AAL2 step-up).
//   - The environment-aware approval policy (Task 6.6): refunds and closure run
//     through disbursement approval; pause/resume run through the emergency
//     control policy (Requirement 20.9: production emergency controls require
//     both organization and independent authorization).
//   - Operation-specific invariants: cumulative refunds may not exceed the
//     original redemption (Requirement 15.4); a refund after expiry is ROUTED
//     to the audited exception workflow instead of an on-chain call
//     (Requirement 15.5); closure requires the expiry / refund-window condition
//     (Requirement 15.7).
//
// Confirmation — and therefore any funded/returned/refunded projection — remain
// reconciliation-owned (Task 6.4 / 11.5); this module only ever marks an attempt
// `submitted`, never `confirmed`.
//
// The raw Soroban XDR construction (invokeHostFunction op, simulation,
// auth-entry extraction/insertion, assembly) is a live-network concern injected
// through the builder/submitter ports — exactly as voucher-program.ts and
// voucher-payment.ts inject theirs — so the gating, validation, hashing, and
// orchestration logic here is pure, reads no Deno globals, stays inside the
// project-wide type check, and is fully offline unit-testable.
//
// Validates: Requirements 15.2, 15.5, 15.6, 16.1, 16.3, 20.2, 20.9


import {
    BASE_FEE,
    type FeeBumpTransaction,
    type Transaction,
    TransactionBuilder,
} from '@stellar/stellar-sdk';

import {
    requireRCPHPIdentifiers,
    type StellarTestnetConfig,
} from '../../../../shared/stellar-config.ts';
import type { Json } from '../../../../src/types/database.types.ts';
import {
    type ApprovalParticipant,
    type EmergencyAuthorizer,
    evaluateDisbursementApproval,
    evaluateEmergencyControl,
    type PolicyEnvironment,
    policyEnvironmentFromMainnet,
} from '../approval-policy.ts';
import { FinancialErrorException, newCorrelationId } from '../errors.ts';
import { safeLog } from '../redaction.ts';

import { createNetworkGuard, type NetworkGuard } from './network-guard.ts';
import {
    type BuildResult,
    type FinancialIntentRecord,
    type FinancialOperationType,
    type OperationProtocol,
    PILOT_WALLET_NETWORK,
    type SigningPackage,
    type StrategyContext,
    type SubmissionAcceptance,
    type SubmitResult,
    type TransactionAttemptRecord,
    type TransactionProtocol,
    type VerifyContext,
} from './protocol.ts';
import type { GuardedRpcClient } from './rpc.ts';
import type { InstitutionalSignerRegistry, InstitutionalSignerRole } from './signers.ts';
import {
    assertAuthorizationMatches,
    parseAndReadAuthorizationEntry,
    SorobanAuthorizationError,
} from './soroban-auth.ts';
import { assertSponsorSeparation, type SponsorGovernor } from './sponsorship.ts';
import { verifyTransactionSignedBy } from './voucher-program.ts';
import {
    innerTransactionOf,
    parseTransactionEnvelope,
    transactionHashHex,
    XdrParseError,
} from './xdr.ts';

// ---------------------------------------------------------------------------
// Shapes and validation constants.
// ---------------------------------------------------------------------------

/** A classic Stellar account address (G...). */
const G_ADDRESS = /^G[A-Z2-7]{55}$/;
/** A Soroban contract / SAC address (C...). */
const C_ADDRESS = /^C[A-Z2-7]{55}$/;
/** A 32-byte identifier / nonce / reason hash rendered as 64 lowercase hex. */
const HEX_32_BYTES = /^[0-9a-f]{64}$/;

/** The single pilot network for every administrative operation. */
export const VOUCHER_ADMIN_NETWORK = PILOT_WALLET_NETWORK;

/** The contract function each operation invokes (design "Public Interface"). */
export const REFUND_FUNCTION = 'refund' as const;
export const ROTATE_ENTITLEMENT_FUNCTION = 'rotate_entitlement' as const;
export const PAUSE_FUNCTION = 'pause' as const;
export const RESUME_FUNCTION = 'resume' as const;
export const CLOSE_FUNCTION = 'close' as const;

/**
 * The `contract_admin`-authorized administrative operations. `refund` is NOT
 * here: it is merchant-authorized through a Soroban auth entry, not the
 * institutional admin signer.
 */
export type AdminOperationKind = 'rotate_entitlement' | 'pause' | 'resume' | 'close';

/** All administrative operation kinds, including the merchant-authorized refund. */
export type VoucherAdminOperationKind = AdminOperationKind | 'refund';

/** Idempotency scopes disambiguate the concrete operation behind a shared type. */
export const VOUCHER_ADMIN_SCOPES: Readonly<Record<VoucherAdminOperationKind, string>> =
  Object.freeze({
    refund: 'voucher_refund',
    rotate_entitlement: 'voucher_wallet_rotation',
    pause: 'voucher_pause',
    resume: 'voucher_resume',
    close: 'voucher_close',
  });

/**
 * The `financial_operation_type` each operation is persisted under. `refund` and
 * `wallet_rotation` have dedicated enum values; pause/resume/close have none and
 * map onto `program_activation` (mirroring voucher-program.ts's convention that
 * program-authority administration is a `program_activation`). The scope is the
 * disambiguator.
 */
export const VOUCHER_ADMIN_OPERATION_TYPE:
  Readonly<Record<VoucherAdminOperationKind, FinancialOperationType>> = Object.freeze({
    refund: 'refund',
    rotate_entitlement: 'wallet_rotation',
    pause: 'program_activation',
    resume: 'program_activation',
    close: 'program_activation',
  });

/** The contract function invoked by each `contract_admin` operation. */
const ADMIN_FUNCTION: Readonly<Record<AdminOperationKind, string>> = Object.freeze({
  rotate_entitlement: ROTATE_ENTITLEMENT_FUNCTION,
  pause: PAUSE_FUNCTION,
  resume: RESUME_FUNCTION,
  close: CLOSE_FUNCTION,
});

/** Every `contract_admin` operation is authorized by exactly this one role. */
const ADMIN_AUTHORIZER_ROLE: InstitutionalSignerRole = 'contract_admin';

// ---------------------------------------------------------------------------
// Pure validation + hashing helpers.
// ---------------------------------------------------------------------------

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

const assertNonNegativeInt = (value: number, field: string, correlationId: string): void => {
  if (!Number.isInteger(value) || value < 0) {
    reject(correlationId, `${field} must be a non-negative integer.`, field);
  }
};

const assertUnixSeconds = (value: number, field: string, correlationId: string): void => {
  if (!Number.isInteger(value) || value <= 0) {
    reject(correlationId, `${field} must be a positive Unix-seconds timestamp.`, field);
  }
};

// ---------------------------------------------------------------------------
// Authorization + approval gating (organization authority, recent step-up,
// approval policy). All pure; every input is injected.
// ---------------------------------------------------------------------------

/**
 * The organization authorization context for a value-moving administrative
 * operation (refund, wallet rotation, closure). It carries the acting maker and
 * any recorded checkers so the environment-aware disbursement approval policy
 * can decide, plus the identity re-verification flag wallet rotation requires
 * (Requirement 16.1). Every participant's `recentStepUp` follows Requirement
 * 20.2 (fresh AAL2 step-up).
 */
export interface AdminApprovalContext {
  /** The party that prepared/submitted the operation (the "maker"). */
  readonly maker: ApprovalParticipant;
  /** Recorded approvals (the "checkers"); may include the maker on testnet. */
  readonly approvals?: readonly ApprovalParticipant[];
}

/** The emergency-control authorization context for pause/resume. */
export interface EmergencyControlContext {
  readonly authorizers: readonly EmergencyAuthorizer[];
}

const environmentOf = (config: StellarTestnetConfig): PolicyEnvironment =>
  policyEnvironmentFromMainnet(config.mainnetEnabled);

/**
 * Fails closed unless a value-moving administrative operation is authorized
 * under the environment's disbursement approval policy AND the maker holds a
 * fresh step-up (Requirement 20.2). Refunds and closure return/return value and
 * so use the same disbursement authorization as a disbursement (Requirement
 * 20.2 lists refunds explicitly among step-up-gated actions). Throws
 * `authorization_failed` with the first denial reason.
 */
export const assertAdminApprovalAuthorized = (
  operation: VoucherAdminOperationKind,
  environment: PolicyEnvironment,
  approval: AdminApprovalContext,
  correlationId: string,
): void => {
  // The maker itself must hold a recent step-up before any high-impact action.
  if (!approval.maker.recentStepUp) {
    throw FinancialErrorException.of(
      'authorization_failed',
      `A ${operation.replace(/_/g, ' ')} requires recent step-up authentication.`,
      { correlationId },
    );
  }
  const decision = evaluateDisbursementApproval({
    environment,
    maker: approval.maker,
    approvals: approval.approvals ?? [],
  });
  if (!decision.allowed) {
    throw FinancialErrorException.of(
      'authorization_failed',
      `The ${operation.replace(/_/g, ' ')} is not authorized: ${decision.reasons.join(', ')}.`,
      { correlationId },
    );
  }
};

/**
 * Fails closed unless an emergency pause/resume is authorized under the
 * environment's emergency-control policy. Testnet allows a single admin with
 * recent step-up; production (Requirement 20.9) requires BOTH an organization
 * and an independent platform/security authorizer, each with recent step-up and
 * distinct. Throws `authorization_failed` with the first denial reason.
 */
export const assertEmergencyControlAuthorized = (
  operation: 'pause' | 'resume',
  environment: PolicyEnvironment,
  control: EmergencyControlContext,
  correlationId: string,
): void => {
  const decision = evaluateEmergencyControl({
    environment,
    operation,
    authorizers: control.authorizers,
  });
  if (!decision.allowed) {
    throw FinancialErrorException.of(
      'authorization_failed',
      `The ${operation} is not authorized: ${decision.reasons.join(', ')}.`,
      { correlationId },
    );
  }
};

/**
 * Asserts wallet rotation is permitted: identity re-verification AND recent
 * step-up must both be satisfied before a rotation (Requirement 16.1). Throws
 * `authorization_failed` when either prerequisite is missing.
 */
export const assertWalletRotationAuthorized = (
  params: { readonly identityReVerified: boolean; readonly recentStepUp: boolean },
  correlationId: string,
): void => {
  if (!params.identityReVerified) {
    throw FinancialErrorException.of(
      'authorization_failed',
      'Wallet rotation requires identity re-verification.',
      { correlationId },
    );
  }
  if (!params.recentStepUp) {
    throw FinancialErrorException.of(
      'authorization_failed',
      'Wallet rotation requires recent step-up authentication.',
      { correlationId },
    );
  }
};

/**
 * Asserts a refund's cumulative value stays within the original redemption
 * amount (Requirement 15.4 / design `sum(refunds for redemption) <= original
 * redemption amount`). The contract enforces this on-chain; the server
 * revalidates before building so an over-refund is refused before any intent is
 * persisted. Uses BigInt for exact i128 comparison. Throws `validation_failed`.
 */
export const assertCumulativeRefundWithinOriginal = (
  params: {
    readonly originalRedemptionStroops: number;
    readonly alreadyRefundedStroops: number;
    readonly requestedStroops: number;
  },
  correlationId: string,
): void => {
  assertPositiveI128(params.requestedStroops, 'amountStroops', correlationId);
  assertPositiveI128(params.originalRedemptionStroops, 'originalRedemptionStroops', correlationId);
  assertNonNegativeInt(params.alreadyRefundedStroops, 'alreadyRefundedStroops', correlationId);
  const projected = BigInt(params.alreadyRefundedStroops) + BigInt(params.requestedStroops);
  if (projected > BigInt(params.originalRedemptionStroops)) {
    reject(
      correlationId,
      'Cumulative refunds may not exceed the original redemption amount.',
      'amountStroops',
    );
  }
};

/**
 * True when a refund is being requested AFTER the program has expired. Such a
 * refund must NOT be sent on-chain; it is routed to the audited exception
 * workflow instead (Requirement 15.5).
 */
export const isRefundAfterExpiry = (
  params: { readonly programExpiresAt: number; readonly nowSeconds: number },
): boolean =>
  Number.isInteger(params.programExpiresAt) && params.nowSeconds >= params.programExpiresAt;

/**
 * Asserts a program closure satisfies the expiry / refund-window condition
 * before `close()` may be built (Requirement 15.7 / design: "close requires
 * program authority and satisfaction of expiry/refund-window conditions"). A
 * program may close only once it has expired AND its refund window has elapsed,
 * so no in-window refund is stranded. Throws `validation_failed` otherwise.
 */
export const assertClosureConditionsMet = (
  params: {
    readonly programExpiresAt: number;
    readonly refundWindowEndsAt: number;
    readonly nowSeconds: number;
  },
  correlationId: string,
): void => {
  assertUnixSeconds(params.programExpiresAt, 'programExpiresAt', correlationId);
  assertUnixSeconds(params.refundWindowEndsAt, 'refundWindowEndsAt', correlationId);
  assertNonNegativeInt(params.nowSeconds, 'nowSeconds', correlationId);
  if (params.nowSeconds < params.programExpiresAt) {
    reject(
      correlationId,
      'A program cannot be closed before it has expired.',
      'programExpiresAt',
    );
  }
  if (params.nowSeconds < params.refundWindowEndsAt) {
    reject(
      correlationId,
      'A program cannot be closed before its refund window has elapsed.',
      'refundWindowEndsAt',
    );
  }
};

// ---------------------------------------------------------------------------
// Invocation specs.
// ---------------------------------------------------------------------------

/**
 * The exact, non-secret parameters of a `contract_admin` administrative
 * operation. The {@link AdminEnvelopeBuilder} turns one of these into an
 * unsigned, simulation-assembled transaction. Nothing here carries a secret key
 * or beneficiary PII.
 */
export type AdminInvocationSpec =
  | {
      readonly kind: 'rotate_entitlement';
      readonly contractId: string;
      /** Pseudonymous 32-byte entitlement identifier (64 hex). */
      readonly entitlementId: string;
      /** The wallet losing authorization (G...). */
      readonly oldWallet: string;
      /** The newly authorized wallet the entitlement migrates to (G...). */
      readonly newWallet: string;
    }
  | { readonly kind: 'pause'; readonly contractId: string; readonly reasonHash: string }
  | { readonly kind: 'resume'; readonly contractId: string; readonly reasonHash: string }
  | { readonly kind: 'close'; readonly contractId: string; readonly programRef: string };

/**
 * The exact, non-secret parameters of a merchant-authorized refund. The
 * {@link RefundBuilder} turns this into a sponsor-sourced transaction carrying
 * the `refund` invocation plus the exact merchant auth entry to sign. Nothing
 * here carries a secret key.
 */
export interface RefundInvocationSpec {
  readonly contractId: string;
  /** The `RCPHP` SAC the instance settles through. */
  readonly sacAddress: string;
  /** The sponsor account that is the transaction SOURCE (pays fees). */
  readonly sponsorSource: string;
  /** The verified merchant settlement wallet that must authorize the refund. */
  readonly merchantSettlementWallet: string;
  /** The original redemption the refund compensates (pseudonymous 32-byte hex). */
  readonly redemptionId: string;
  /** The refund amount, in i128 stroops. */
  readonly amountStroops: number;
  /** A 32-byte one-time refund nonce (64 hex) making the refund replay-safe. */
  readonly refundNonce: string;
}

// ---------------------------------------------------------------------------
// Built operations and injected Soroban ports.
// ---------------------------------------------------------------------------

/** An unsigned, simulation-assembled admin transaction ready for admin signing. */
export interface BuiltAdminOperation {
  readonly envelopeXdr: string;
  readonly preparedPayloadHash: string;
  readonly minLedger: number | null;
  readonly maxLedger: number | null;
  /** The contract instance the operation targets. */
  readonly contractId: string;
}

/**
 * Builds the exact unsigned Soroban transaction for an admin spec, having
 * simulated and assembled it against the guarded RPC. Injected here so the
 * orchestration/gating logic is offline-testable without constructing real XDR.
 */
export interface AdminEnvelopeBuilder {
  build(
    spec: AdminInvocationSpec,
    context: { readonly correlationId: string },
  ): Promise<BuiltAdminOperation>;
}

/** Submits a fully-assembled transaction through the guarded RPC client. */
export interface AdminSubmitter {
  submit(transaction: Transaction | FeeBumpTransaction): Promise<SubmissionAcceptance>;
}

/**
 * A built, simulation-assembled refund. The transaction is sourced by the
 * sponsor and carries the `refund` invocation; the merchant auth entry is
 * pending until the merchant signs and returns it. `unsignedAuthEntryXdr` is the
 * EXACT authorization entry the merchant must sign.
 */
export interface BuiltRefund {
  readonly envelopeXdr: string;
  readonly preparedPayloadHash: string;
  readonly minLedger: number | null;
  readonly maxLedger: number | null;
  /** The exact Soroban authorization entry the merchant must sign (base64). */
  readonly unsignedAuthEntryXdr: string;
  /** Ledger after which the merchant signature is invalid. */
  readonly signatureExpirationLedger: number;
  /** The authorization-entry nonce, as a decimal string (binds the exact entry). */
  readonly authNonce: string;
}

export interface AssembleRefundInput {
  /** The sponsor-sourced envelope produced by `build` (from the stored attempt). */
  readonly builtEnvelopeXdr: string;
  /** The merchant-signed authorization entry returned by the client (base64). */
  readonly signedAuthEntryXdr: string;
  readonly correlationId: string;
}

/**
 * Builds and assembles the exact Soroban refund transaction against the guarded
 * RPC (simulation, footprint, resource fees, auth-entry extraction/insertion).
 * Injected here so the orchestration/validation logic is offline-testable.
 */
export interface RefundBuilder {
  /** Simulates `refund` and returns the sponsor-sourced tx + the auth entry to sign. */
  build(
    spec: RefundInvocationSpec,
    context: { readonly correlationId: string },
  ): Promise<BuiltRefund>;
  /** Inserts the merchant-signed auth entry into the built transaction. */
  assemble(input: AssembleRefundInput): Promise<Transaction>;
}

/** Submits a fully-assembled refund transaction through the guarded RPC client. */
export interface RefundSubmitter {
  submit(transaction: Transaction): Promise<SubmissionAcceptance>;
}

// ---------------------------------------------------------------------------
// Per-operation canonical payload hashes. Each binds the immutable business
// identity of the operation — never the transaction sequence — so a retry under
// the same idempotency key hashes identically and reuses the one intent.
// ---------------------------------------------------------------------------

export const computeRefundPayloadHash = (spec: RefundInvocationSpec): Promise<string> =>
  sha256Hex(
    [
      'voucher_refund',
      'v1',
      spec.contractId,
      spec.sacAddress,
      spec.merchantSettlementWallet,
      spec.redemptionId,
      spec.amountStroops.toString(),
      spec.refundNonce,
    ].join('|'),
  );

export const computeAdminPayloadHash = (spec: AdminInvocationSpec): Promise<string> => {
  switch (spec.kind) {
    case 'rotate_entitlement':
      return sha256Hex(
        [
          'voucher_rotate_entitlement',
          'v1',
          spec.contractId,
          spec.entitlementId,
          spec.oldWallet,
          spec.newWallet,
        ].join('|'),
      );
    case 'pause':
      return sha256Hex(['voucher_pause', 'v1', spec.contractId, spec.reasonHash].join('|'));
    case 'resume':
      return sha256Hex(['voucher_resume', 'v1', spec.contractId, spec.reasonHash].join('|'));
    case 'close':
      return sha256Hex(['voucher_close', 'v1', spec.contractId, spec.programRef].join('|'));
  }
};

// ---------------------------------------------------------------------------
// Authorization-payload read helpers (bind refund verify to the exact entry).
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
    'The prepared refund is missing required authorization metadata.',
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
    'The prepared refund is missing required authorization metadata.',
    { correlationId },
  );
};

// ---------------------------------------------------------------------------
// OperationProtocol strategy — `contract_admin` classic-envelope operations.
// ---------------------------------------------------------------------------

export interface AdminStrategyDependencies {
  readonly kind: AdminOperationKind;
  readonly spec: AdminInvocationSpec;
  readonly builder: AdminEnvelopeBuilder;
  readonly submitter: AdminSubmitter;
}

/**
 * Builds the {@link OperationProtocol} strategy for a single `contract_admin`
 * operation (rotate_entitlement, pause, resume, close). `build` delegates the
 * exact Soroban transaction construction to the injected builder.
 * `verifyAndAssemble` verifies the returned admin signature is bound to the
 * EXACT prepared transaction, confirms the `contract_admin` role signed, wraps
 * the signed inner transaction in a sponsor-signed fee-bump (fees only — never
 * contract authorization), and submits. It never marks the attempt confirmed.
 */
export const createAdminOperationStrategy = (
  deps: AdminStrategyDependencies,
): OperationProtocol => {
  const operationType = VOUCHER_ADMIN_OPERATION_TYPE[deps.kind];

  const build = async (context: StrategyContext): Promise<BuildResult> => {
    const { config, correlationId, guard } = context;

    const built = await deps.builder.build(deps.spec, { correlationId });

    // The built transaction must be bound to the configured testnet.
    const parsed = parseTransactionEnvelope(built.envelopeXdr, config.networkPassphrase);
    guard.assertNetworkPassphrase(parsed.networkPassphrase);

    const signingPackage: SigningPackage = {
      kind: 'classic_envelope',
      unsignedEnvelopeXdr: built.envelopeXdr,
      transactionHash: built.preparedPayloadHash,
      networkPassphrase: config.networkPassphrase,
    };

    return {
      network: VOUCHER_ADMIN_NETWORK,
      envelopeXdr: built.envelopeXdr,
      preparedPayloadHash: built.preparedPayloadHash,
      minLedger: built.minLedger,
      maxLedger: built.maxLedger,
      signingPackage,
      authorizationPayload: {
        operation: deps.kind,
        contract_id: built.contractId,
        function_name: ADMIN_FUNCTION[deps.kind],
        authorizer_role: ADMIN_AUTHORIZER_ROLE,
      },
    };
  };

  const verifyAndAssemble = async (context: VerifyContext) => {
    const { config, correlationId, parsedBuiltEnvelope, signed } = context;

    if (signed.kind !== 'classic_envelope') {
      throw FinancialErrorException.of(
        'validation_failed',
        'A voucher administrative operation expects a signed classic transaction.',
        { correlationId },
      );
    }

    const parsedSigned = parseTransactionEnvelope(signed.signedEnvelopeXdr, config.networkPassphrase);
    const signedTransaction = parsedSigned.transaction as Transaction;
    const builtInner = innerTransactionOf(parsedBuiltEnvelope.transaction);

    // Bind the signature to the EXACT prepared transaction (every operation and
    // the sequence) in one hash comparison.
    if (transactionHashHex(signedTransaction) !== transactionHashHex(builtInner)) {
      throw FinancialErrorException.of(
        'validation_failed',
        'The signed transaction does not match the prepared administrative operation.',
        { correlationId },
      );
    }

    // The required institutional (contract-admin) authorization MUST be present.
    const authorizer = context.signers.publicKeyOf(ADMIN_AUTHORIZER_ROLE);
    if (!verifyTransactionSignedBy(signedTransaction, authorizer)) {
      throw FinancialErrorException.of(
        'authorization_failed',
        'The administrative operation is missing a valid contract-authority signature.',
        { correlationId },
      );
    }

    // The sponsor pays fees only and must be a distinct account; it can never
    // substitute for the contract authorization verified above.
    const rcphp = requireRCPHPIdentifiers(config);
    const sponsor = context.signers.get('sponsor');
    const sponsorPublicKey = sponsor.publicKey();
    assertSponsorSeparation(
      {
        sponsor: sponsorPublicKey,
        issuer: rcphp.issuer,
        organizationTreasury: context.signers.has('organization_treasury')
          ? context.signers.publicKeyOf('organization_treasury')
          : null,
      },
      correlationId,
    );

    const feeBump = TransactionBuilder.buildFeeBumpTransaction(
      sponsorPublicKey,
      BASE_FEE,
      signedTransaction,
      config.networkPassphrase,
    );
    sponsor.signTransaction(feeBump);

    return {
      transactionHash: transactionHashHex(feeBump),
      submit: (): Promise<SubmissionAcceptance> => deps.submitter.submit(feeBump),
    };
  };

  return Object.freeze({ operationType, build, verifyAndAssemble });
};

// ---------------------------------------------------------------------------
// OperationProtocol strategy — merchant-authorized refund (auth-entry signing).
// ---------------------------------------------------------------------------

export interface RefundStrategyDependencies {
  readonly spec: RefundInvocationSpec;
  readonly builder: RefundBuilder;
  readonly submitter: RefundSubmitter;
}

/**
 * Builds the refund {@link OperationProtocol} strategy. `build` delegates the
 * exact Soroban transaction construction (and `refund` simulation) to the
 * injected builder and returns ONLY the merchant auth-entry signing package.
 * `verifyAndAssemble` verifies the returned auth entry authorizes exactly the
 * expected merchant / contract / `refund` / nonce / signature-expiration ledger
 * against the stored intent, inserts it into the built transaction, signs with
 * the sponsor SOURCE (fees only — never the merchant's contract authorization),
 * and submits. It never marks the attempt confirmed.
 */
export const createRefundStrategy = (
  deps: RefundStrategyDependencies,
): OperationProtocol => {
  const { spec } = deps;

  const build = async (context: StrategyContext): Promise<BuildResult> => {
    const { config, correlationId, guard } = context;

    const built = await deps.builder.build(spec, { correlationId });

    // The built transaction must be bound to the configured testnet.
    guard.assertNetworkPassphrase(
      TransactionBuilder.fromXDR(built.envelopeXdr, config.networkPassphrase).networkPassphrase,
    );

    // Return ONLY the exact merchant auth entry to sign; no institutional
    // material, no submittable envelope.
    const signingPackage: SigningPackage = {
      kind: 'soroban_auth_entry',
      unsignedAuthEntryXdr: built.unsignedAuthEntryXdr,
      contractId: spec.contractId,
      functionName: REFUND_FUNCTION,
      authorizer: spec.merchantSettlementWallet,
      signatureExpirationLedger: built.signatureExpirationLedger,
      networkPassphrase: config.networkPassphrase,
    };

    return {
      network: VOUCHER_ADMIN_NETWORK,
      envelopeXdr: built.envelopeXdr,
      preparedPayloadHash: built.preparedPayloadHash,
      minLedger: built.minLedger,
      maxLedger: built.maxLedger,
      signingPackage,
      authorizationPayload: {
        operation: 'refund',
        contract_id: spec.contractId,
        authorizer: spec.merchantSettlementWallet,
        function_name: REFUND_FUNCTION,
        redemption_id: spec.redemptionId,
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
        'A refund expects a signed Soroban authorization entry.',
        { correlationId },
      );
    }

    // Parse the merchant-returned authorization entry, failing closed on
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

    // The entry MUST authorize exactly the expected merchant, contract, and
    // `refund` function — the merchant's contract authorization.
    try {
      assertAuthorizationMatches(parsed, {
        authorizer: spec.merchantSettlementWallet,
        contractId: spec.contractId,
        functionName: REFUND_FUNCTION,
      });
    } catch (cause) {
      if (cause instanceof SorobanAuthorizationError) {
        throw FinancialErrorException.of('authorization_failed', cause.message, { correlationId });
      }
      throw cause;
    }

    // Bind the returned entry to the EXACT one the server prepared: the
    // signature-expiration ledger and nonce must match the stored intent, so a
    // client cannot substitute a different authorization.
    const expectedSigExp = readAuthPayloadNumber(
      attempt.authorization_payload,
      'signature_expiration_ledger',
      correlationId,
    );
    const expectedNonce = readAuthPayloadString(attempt.authorization_payload, 'auth_nonce', correlationId);
    if (parsed.credentials.signatureExpirationLedger !== expectedSigExp) {
      throw FinancialErrorException.of(
        'validation_failed',
        'The authorization signature-expiration ledger does not match the prepared refund.',
        { correlationId },
      );
    }
    if (parsed.credentials.nonce !== expectedNonce) {
      throw FinancialErrorException.of(
        'validation_failed',
        'The authorization nonce does not match the prepared refund.',
        { correlationId },
      );
    }

    // Insert the verified merchant authorization into the built transaction.
    const assembled = await deps.builder.assemble({
      builtEnvelopeXdr: attempt.envelope_xdr as string,
      signedAuthEntryXdr: signed.signedAuthEntryXdr,
      correlationId,
    });

    // The SPONSOR is the transaction source and pays fees by being the source;
    // it MUST be distinct from the merchant and issuer and can never supply the
    // merchant's contract authorization verified above.
    const rcphp = requireRCPHPIdentifiers(config);
    const sponsor = context.signers.get('sponsor');
    const sponsorPublicKey = sponsor.publicKey();
    assertSponsorSeparation(
      {
        sponsor: sponsorPublicKey,
        issuer: rcphp.issuer,
        merchant: spec.merchantSettlementWallet,
      },
      correlationId,
    );
    sponsor.signTransaction(assembled);

    return {
      transactionHash: transactionHashHex(assembled),
      submit: (): Promise<SubmissionAcceptance> => deps.submitter.submit(assembled),
    };
  };

  return Object.freeze({ operationType: VOUCHER_ADMIN_OPERATION_TYPE.refund, build, verifyAndAssemble });
};

// ---------------------------------------------------------------------------
// Dispute-exception workflow (off-chain; Requirements 15.5, 15.6).
// ---------------------------------------------------------------------------

/**
 * The off-chain dispute / exception record raised when a refund cannot proceed
 * on-chain (e.g. requested after program expiry) or is disputed. It links to the
 * IMMUTABLE financial references (the original redemption / payment) rather than
 * mutating them (Requirement 15.1, 15.6). Evidence itself is stored off-chain
 * and referenced, never written on-chain (Requirement 19.1).
 */
export interface DisputeExceptionInput {
  readonly organizationId: string;
  readonly programId: string;
  /** The original redemption the dispute/refund references (immutable). */
  readonly originalRedemptionId: string;
  /** Optional verifiable ledger/contract reference for the original settlement. */
  readonly originalSettlementReference?: string | null;
  /** The refund amount that was requested, in stroops. */
  readonly requestedRefundStroops: number;
  /** Why the refund was routed to the exception workflow. */
  readonly reason: 'program_expired' | 'disputed';
  /** An off-chain evidence reference (document id / URL); never on-chain PII. */
  readonly evidenceReference?: string | null;
  readonly requestedBy?: string | null;
  readonly correlationId: string;
}

/** The persisted off-chain dispute-exception record. */
export interface DisputeExceptionRecord {
  readonly id: string;
  readonly status: 'exception_required';
  readonly originalRedemptionId: string;
  readonly reason: DisputeExceptionInput['reason'];
}

/**
 * Persists an off-chain dispute / exception record. Injected so the
 * orchestration is usable and unit-testable without a dispute store; the concrete
 * store (Task 14.2) writes the durable row and links the immutable references.
 */
export interface DisputeExceptionPort {
  record(input: DisputeExceptionInput): Promise<DisputeExceptionRecord>;
}

// ---------------------------------------------------------------------------
// Orchestrator.
// ---------------------------------------------------------------------------

export interface VoucherAdministrationDependencies {
  readonly protocol: TransactionProtocol;
  readonly config: StellarTestnetConfig;
  /** Defaults to a guard built from `config`. */
  readonly guard?: NetworkGuard;
  readonly signers: InstitutionalSignerRegistry;
  readonly adminBuilder: AdminEnvelopeBuilder;
  readonly adminSubmitter: AdminSubmitter;
  readonly refundBuilder: RefundBuilder;
  readonly refundSubmitter: RefundSubmitter;
  /** Optional pre-operation sponsorship gate. */
  readonly sponsor?: SponsorGovernor;
  /** Optional off-chain dispute/exception store (Requirements 15.5, 15.6). */
  readonly disputeExceptions?: DisputeExceptionPort;
}

interface AdminRequestBase {
  readonly organizationId: string;
  readonly programId: string;
  /** Deterministic business idempotency key for the logical operation. */
  readonly idempotencyKey: string;
  readonly requestedBy?: string | null;
  readonly correlationId?: string;
}

export interface RefundRequest extends AdminRequestBase {
  readonly contractId: string;
  readonly sacAddress: string;
  readonly sponsorSource: string;
  readonly merchantSettlementWallet: string;
  readonly redemptionId: string;
  readonly amountStroops: number;
  readonly refundNonce: string;
  /** The original redemption amount the cumulative refunds must stay within. */
  readonly originalRedemptionStroops: number;
  /** Value already refunded against the original redemption, in stroops. */
  readonly alreadyRefundedStroops: number;
  /** Program expiry (Unix seconds) — an expired program routes to exception. */
  readonly programExpiresAt: number;
  /** The current time in Unix seconds. */
  readonly nowSeconds: number;
  /** Organization authorization + recent step-up (Requirements 20.2). */
  readonly approval: AdminApprovalContext;
  /** Optional evidence reference used only when routed to the exception flow. */
  readonly evidenceReference?: string | null;
}

export interface RotateEntitlementRequest extends AdminRequestBase {
  readonly contractId: string;
  readonly entitlementId: string;
  readonly oldWallet: string;
  readonly newWallet: string;
  /** Identity re-verification and recent step-up gates (Requirement 16.1). */
  readonly identityReVerified: boolean;
  readonly recentStepUp: boolean;
}

export interface EmergencyControlRequest extends AdminRequestBase {
  readonly contractId: string;
  /** A 32-byte reason hash (64 hex); the human-readable reason stays off-chain. */
  readonly reasonHash: string;
  /** Organization + independent emergency authorizers (Requirement 20.9). */
  readonly control: EmergencyControlContext;
}

export interface CloseRequest extends AdminRequestBase {
  readonly contractId: string;
  readonly programRef: string;
  readonly programExpiresAt: number;
  readonly refundWindowEndsAt: number;
  readonly nowSeconds: number;
  /** Organization authorization + recent step-up (Requirement 20.2). */
  readonly approval: AdminApprovalContext;
}

/** A prepared administrative operation, or a refund routed to the exception flow. */
export interface PreparedAdminOperation {
  readonly kind: VoucherAdminOperationKind;
  readonly isReplay: boolean;
  /**
   * `'prepared'` when an on-chain attempt was built (or replayed); `'exception'`
   * when a refund was routed to the off-chain dispute workflow instead.
   */
  readonly outcome: 'prepared' | 'exception';
  readonly intent: FinancialIntentRecord | null;
  /** The built attempt, or `null` on a replay / exception routing. */
  readonly attempt: TransactionAttemptRecord | null;
  /** ONLY the client-signable package; `null` on a replay / non-refund / exception. */
  readonly signingPackage: SigningPackage | null;
  /** The captured invocation spec, needed by `submit`; `null` on a replay / exception. */
  readonly spec: RefundInvocationSpec | AdminInvocationSpec | null;
  /** The raised exception record when `outcome === 'exception'`. */
  readonly exception: DisputeExceptionRecord | null;
}

export interface SubmitRefundInput {
  readonly intent: FinancialIntentRecord;
  readonly attempt: TransactionAttemptRecord;
  readonly spec: RefundInvocationSpec;
  /** The merchant-signed authorization entry (base64). */
  readonly signedAuthEntryXdr: string;
}

export interface SubmitAdminInput {
  readonly kind: AdminOperationKind;
  readonly intent: FinancialIntentRecord;
  readonly attempt: TransactionAttemptRecord;
  readonly spec: AdminInvocationSpec;
}

/**
 * Builds the voucher administrative orchestrator. It composes the reusable
 * transaction protocol with the administrative gates (organization authorization
 * + recent step-up, the approval / emergency policy, cumulative-refund bounds,
 * expiry-driven exception routing, and closure conditions) and the correct
 * signing model per operation, and exposes one `prepare*` per operation plus a
 * `submitRefund` (merchant auth entry) and a `submitAdminOperation` (institutional
 * contract-admin signing). Confirmation stays reconciliation-owned.
 */
export const createVoucherAdministration = (deps: VoucherAdministrationDependencies) => {
  const guard = deps.guard ?? createNetworkGuard(deps.config);
  guard.assertTestnetConfig();
  const environment = environmentOf(deps.config);

  const adminStrategyFor = (
    kind: AdminOperationKind,
    spec: AdminInvocationSpec,
  ): OperationProtocol =>
    createAdminOperationStrategy({
      kind,
      spec,
      builder: deps.adminBuilder,
      submitter: deps.adminSubmitter,
    });

  const refundStrategyFor = (spec: RefundInvocationSpec): OperationProtocol =>
    createRefundStrategy({ spec, builder: deps.refundBuilder, submitter: deps.refundSubmitter });

  const signInstitutional = (role: InstitutionalSignerRole, unsignedEnvelopeXdr: string): string => {
    const parsed = parseTransactionEnvelope(unsignedEnvelopeXdr, deps.config.networkPassphrase);
    deps.signers.get(role).signTransaction(parsed.transaction);
    return parsed.transaction.toXDR();
  };

  const maybeAuthorizeSponsorship = async (
    kind: VoucherAdminOperationKind,
    request: AdminRequestBase,
    correlationId: string,
  ): Promise<void> => {
    if (deps.sponsor === undefined) {
      return;
    }
    await deps.sponsor.authorize({
      estimatedCostStroops: Number(BASE_FEE) * 4,
      purpose: `voucher_${kind}_fee`,
      correlationId,
      organizationId: request.organizationId,
      programId: request.programId,
    });
  };

  const persistAndBuildOnChain = async (
    kind: VoucherAdminOperationKind,
    request: AdminRequestBase,
    strategy: OperationProtocol,
    spec: RefundInvocationSpec | AdminInvocationSpec,
    payloadHash: string,
    amountStroops: number | null,
    correlationId: string,
  ): Promise<PreparedAdminOperation> => {
    const rcphp = requireRCPHPIdentifiers(deps.config);
    const prepared = await deps.protocol.prepare({
      organizationId: request.organizationId,
      programId: request.programId,
      operationType: VOUCHER_ADMIN_OPERATION_TYPE[kind],
      scope: VOUCHER_ADMIN_SCOPES[kind],
      idempotencyKey: request.idempotencyKey,
      payloadHash,
      amountStroops,
      assetCode: rcphp.code,
      assetIssuer: rcphp.issuer,
      requestedBy: request.requestedBy ?? null,
      correlationId,
    });

    if (prepared.isReplay) {
      return {
        kind,
        isReplay: true,
        outcome: 'prepared',
        intent: prepared.intent,
        attempt: null,
        signingPackage: null,
        spec: null,
        exception: null,
      };
    }

    const built = await deps.protocol.build(prepared.intent, strategy);
    return {
      kind,
      isReplay: false,
      outcome: 'prepared',
      intent: prepared.intent,
      attempt: built.attempt,
      signingPackage: built.signingPackage,
      spec,
      exception: null,
    };
  };

  /**
   * REFUND. Represents the correction as a signed compensating transaction that
   * references the original redemption (Requirement 15.2). A refund requested
   * AFTER program expiry is routed to the audited off-chain exception workflow
   * instead of an on-chain call (Requirement 15.5); otherwise the cumulative
   * refund bound is revalidated (Requirement 15.4) and a merchant-authorized
   * `refund` invocation is built. Gated by organization authorization + recent
   * step-up (Requirement 20.2).
   */
  const prepareRefund = async (request: RefundRequest): Promise<PreparedAdminOperation> => {
    const correlationId = request.correlationId ?? newCorrelationId();
    assertShape(request.contractId, C_ADDRESS, 'contractId', correlationId);
    assertShape(request.sacAddress, C_ADDRESS, 'sacAddress', correlationId);
    assertShape(request.sponsorSource, G_ADDRESS, 'sponsorSource', correlationId);
    assertShape(request.merchantSettlementWallet, G_ADDRESS, 'merchantSettlementWallet', correlationId);
    assertShape(request.redemptionId, HEX_32_BYTES, 'redemptionId', correlationId);
    assertShape(request.refundNonce, HEX_32_BYTES, 'refundNonce', correlationId);
    assertPositiveI128(request.amountStroops, 'amountStroops', correlationId);
    assertAdminApprovalAuthorized('refund', environment, request.approval, correlationId);

    // A refund after expiry cannot settle on-chain; route it to the audited
    // exception workflow, linking the immutable original redemption reference.
    if (isRefundAfterExpiry({ programExpiresAt: request.programExpiresAt, nowSeconds: request.nowSeconds })) {
      if (deps.disputeExceptions === undefined) {
        throw FinancialErrorException.of(
          'validation_failed',
          'This refund was requested after program expiry and requires the exception workflow, which is not available.',
          { correlationId },
        );
      }
      const exception = await deps.disputeExceptions.record({
        organizationId: request.organizationId,
        programId: request.programId,
        originalRedemptionId: request.redemptionId,
        requestedRefundStroops: request.amountStroops,
        reason: 'program_expired',
        evidenceReference: request.evidenceReference ?? null,
        requestedBy: request.requestedBy ?? null,
        correlationId,
      });
      safeLog('refund routed to dispute exception', { reason: 'program_expired', correlationId });
      return {
        kind: 'refund',
        isReplay: false,
        outcome: 'exception',
        intent: null,
        attempt: null,
        signingPackage: null,
        spec: null,
        exception,
      };
    }

    assertCumulativeRefundWithinOriginal(
      {
        originalRedemptionStroops: request.originalRedemptionStroops,
        alreadyRefundedStroops: request.alreadyRefundedStroops,
        requestedStroops: request.amountStroops,
      },
      correlationId,
    );
    guard.assertContractAllowed(request.contractId);
    await maybeAuthorizeSponsorship('refund', request, correlationId);

    const spec: RefundInvocationSpec = {
      contractId: request.contractId,
      sacAddress: request.sacAddress,
      sponsorSource: request.sponsorSource,
      merchantSettlementWallet: request.merchantSettlementWallet,
      redemptionId: request.redemptionId,
      amountStroops: request.amountStroops,
      refundNonce: request.refundNonce,
    };
    const payloadHash = await computeRefundPayloadHash(spec);
    return persistAndBuildOnChain(
      'refund',
      request,
      refundStrategyFor(spec),
      spec,
      payloadHash,
      request.amountStroops,
      correlationId,
    );
  };

  /**
   * Raises an off-chain dispute exception directly (Requirements 15.5, 15.6):
   * stores workflow status and evidence reference off-chain while linking the
   * immutable original financial reference. Performs no on-chain call.
   */
  const raiseDisputeException = async (
    input: Omit<DisputeExceptionInput, 'correlationId'> & { readonly correlationId?: string },
  ): Promise<DisputeExceptionRecord> => {
    const correlationId = input.correlationId ?? newCorrelationId();
    assertShape(input.originalRedemptionId, HEX_32_BYTES, 'originalRedemptionId', correlationId);
    assertPositiveI128(input.requestedRefundStroops, 'requestedRefundStroops', correlationId);
    if (deps.disputeExceptions === undefined) {
      throw FinancialErrorException.of(
        'dependency_unavailable',
        'The dispute exception workflow is not available.',
        { correlationId },
      );
    }
    return deps.disputeExceptions.record({ ...input, correlationId });
  };

  /**
   * ROTATE_ENTITLEMENT. Migrates active entitlements to the newly authorized
   * wallet through an audited contract operation (Requirement 16.3), gated on
   * identity re-verification AND recent step-up (Requirement 16.1). The old
   * wallet's future authorization is revoked by the contract on confirmed
   * rotation (Requirement 16.4, reconciliation-owned).
   */
  const prepareRotateEntitlement = async (
    request: RotateEntitlementRequest,
  ): Promise<PreparedAdminOperation> => {
    const correlationId = request.correlationId ?? newCorrelationId();
    assertShape(request.contractId, C_ADDRESS, 'contractId', correlationId);
    assertShape(request.entitlementId, HEX_32_BYTES, 'entitlementId', correlationId);
    assertShape(request.oldWallet, G_ADDRESS, 'oldWallet', correlationId);
    assertShape(request.newWallet, G_ADDRESS, 'newWallet', correlationId);
    if (request.oldWallet === request.newWallet) {
      reject(correlationId, 'The replacement wallet must differ from the old wallet.', 'newWallet');
    }
    assertWalletRotationAuthorized(
      { identityReVerified: request.identityReVerified, recentStepUp: request.recentStepUp },
      correlationId,
    );
    guard.assertContractAllowed(request.contractId);
    await maybeAuthorizeSponsorship('rotate_entitlement', request, correlationId);

    const spec: AdminInvocationSpec = {
      kind: 'rotate_entitlement',
      contractId: request.contractId,
      entitlementId: request.entitlementId,
      oldWallet: request.oldWallet,
      newWallet: request.newWallet,
    };
    const payloadHash = await computeAdminPayloadHash(spec);
    return persistAndBuildOnChain(
      'rotate_entitlement',
      request,
      adminStrategyFor('rotate_entitlement', spec),
      spec,
      payloadHash,
      null,
      correlationId,
    );
  };

  const prepareEmergencyControl = async (
    kind: 'pause' | 'resume',
    request: EmergencyControlRequest,
  ): Promise<PreparedAdminOperation> => {
    const correlationId = request.correlationId ?? newCorrelationId();
    assertShape(request.contractId, C_ADDRESS, 'contractId', correlationId);
    assertShape(request.reasonHash, HEX_32_BYTES, 'reasonHash', correlationId);
    assertEmergencyControlAuthorized(kind, environment, request.control, correlationId);
    guard.assertContractAllowed(request.contractId);
    await maybeAuthorizeSponsorship(kind, request, correlationId);

    const spec: AdminInvocationSpec = {
      kind,
      contractId: request.contractId,
      reasonHash: request.reasonHash,
    };
    const payloadHash = await computeAdminPayloadHash(spec);
    return persistAndBuildOnChain(
      kind,
      request,
      adminStrategyFor(kind, spec),
      spec,
      payloadHash,
      null,
      correlationId,
    );
  };

  /**
   * PAUSE. Halts the contract under the emergency-control policy. Non-seizing:
   * pausing never moves value. Production requires multi-party authority
   * (Requirement 20.9).
   */
  const preparePause = (request: EmergencyControlRequest): Promise<PreparedAdminOperation> =>
    prepareEmergencyControl('pause', request);

  /** RESUME. Re-enables a paused contract under the emergency-control policy. */
  const prepareResume = (request: EmergencyControlRequest): Promise<PreparedAdminOperation> =>
    prepareEmergencyControl('resume', request);

  /**
   * CLOSE. Returns unallocated and expired escrow to the organization treasury
   * through an auditable transaction (Requirement 15.7). Gated on the
   * expiry/refund-window condition and on organization authorization + recent
   * step-up. Never reclaims confirmed cash or merchant settlement (contract-owned).
   */
  const prepareClose = async (request: CloseRequest): Promise<PreparedAdminOperation> => {
    const correlationId = request.correlationId ?? newCorrelationId();
    assertShape(request.contractId, C_ADDRESS, 'contractId', correlationId);
    assertShape(request.programRef, HEX_32_BYTES, 'programRef', correlationId);
    assertAdminApprovalAuthorized('close', environment, request.approval, correlationId);
    assertClosureConditionsMet(
      {
        programExpiresAt: request.programExpiresAt,
        refundWindowEndsAt: request.refundWindowEndsAt,
        nowSeconds: request.nowSeconds,
      },
      correlationId,
    );
    guard.assertContractAllowed(request.contractId);
    await maybeAuthorizeSponsorship('close', request, correlationId);

    const spec: AdminInvocationSpec = {
      kind: 'close',
      contractId: request.contractId,
      programRef: request.programRef,
    };
    const payloadHash = await computeAdminPayloadHash(spec);
    return persistAndBuildOnChain(
      'close',
      request,
      adminStrategyFor('close', spec),
      spec,
      payloadHash,
      null,
      correlationId,
    );
  };

  /**
   * Submits a refund: verifies the merchant-signed auth entry against the stored
   * intent, inserts it, adds the sponsor source signature (fees only), submits,
   * and marks the attempt `submitted`. Confirmation stays reconciliation-owned.
   */
  const submitRefund = async (input: SubmitRefundInput): Promise<SubmitResult> => {
    if (input.attempt.envelope_xdr === null) {
      throw FinancialErrorException.of(
        'validation_failed',
        'This refund attempt has no prepared transaction to submit.',
        { correlationId: input.attempt.correlation_id },
      );
    }
    return deps.protocol.submit(
      { intent: input.intent, attempt: input.attempt },
      { kind: 'soroban_auth_entry', signedAuthEntryXdr: input.signedAuthEntryXdr },
      refundStrategyFor(input.spec),
    );
  };

  /**
   * Submits a `contract_admin` operation: signs the built transaction with the
   * isolated contract-admin signer, then submits through the protocol, which
   * verifies the signature and network binding, adds only the sponsor fee-bump,
   * and marks the attempt `submitted`. Confirmation stays reconciliation-owned.
   */
  const submitAdminOperation = async (input: SubmitAdminInput): Promise<SubmitResult> => {
    if (input.attempt.envelope_xdr === null) {
      throw FinancialErrorException.of(
        'validation_failed',
        'This administrative attempt has no prepared transaction to submit.',
        { correlationId: input.attempt.correlation_id },
      );
    }
    const signedEnvelopeXdr = signInstitutional(ADMIN_AUTHORIZER_ROLE, input.attempt.envelope_xdr);
    return deps.protocol.submit(
      { intent: input.intent, attempt: input.attempt },
      { kind: 'classic_envelope', signedEnvelopeXdr },
      adminStrategyFor(input.kind, input.spec),
    );
  };

  return Object.freeze({
    prepareRefund,
    raiseDisputeException,
    prepareRotateEntitlement,
    preparePause,
    prepareResume,
    prepareClose,
    submitRefund,
    submitAdminOperation,
  });
};

// ---------------------------------------------------------------------------
// Default guarded-RPC submitter adapters.
// ---------------------------------------------------------------------------

/**
 * Builds an {@link AdminSubmitter} from the guarded RPC client. It verifies the
 * network before sending and returns the accepted transaction hash and status;
 * confirmation remains reconciliation-owned.
 */
export const createRpcAdminSubmitter = (rpcClient: GuardedRpcClient): AdminSubmitter =>
  Object.freeze({
    async submit(transaction: Transaction | FeeBumpTransaction): Promise<SubmissionAcceptance> {
      await rpcClient.assertNetwork();
      const response = await rpcClient.server.sendTransaction(transaction);
      const accepted = response as unknown as { hash?: string; status?: string };
      safeLog('voucher administrative operation submitted', { status: accepted.status });
      return {
        transactionHash: accepted.hash ?? transactionHashHex(transaction),
        resultCode: accepted.status ?? null,
      };
    },
  });

/**
 * Builds a {@link RefundSubmitter} from the guarded RPC client. It verifies the
 * network before sending and returns the accepted transaction hash and status.
 */
export const createRpcRefundSubmitter = (rpcClient: GuardedRpcClient): RefundSubmitter =>
  Object.freeze({
    async submit(transaction: Transaction): Promise<SubmissionAcceptance> {
      await rpcClient.assertNetwork();
      const response = await rpcClient.server.sendTransaction(transaction);
      const accepted = response as unknown as { hash?: string; status?: string };
      safeLog('voucher refund submitted', { status: accepted.status });
      return {
        transactionHash: accepted.hash ?? transactionHashHex(transaction),
        resultCode: accepted.status ?? null,
      };
    },
  });

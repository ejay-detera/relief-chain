// Voucher-program deployment and lifecycle orchestration (Soroban rail).
//
// This module is the Soroban analogue of cash-activation.ts. Where the cash
// rail reserves a program's budget with a single classic `RCPHP` payment, the
// voucher rail stands up and administers one isolated Soroban contract instance
// per voucher program (design "Voucher Contract" and "Stellar Account and Asset
// Topology"). It composes the same shared primitives the cash rail uses — the
// Task 6.1 typed errors/redaction, the Task 6.2 guarded clients / isolated
// institutional signers, the Task 6.3 prepare/build/authorize/submit protocol,
// the Task 6.5 sponsorship governor, and the Task 11.1 TTL activation gate —
// and owns only the voucher-lifecycle specifics for the five operations of
// Task 11.2:
//
//   1. DEPLOY   — verify the approved immutable voucher WASM hash
//      (network-guard's `expectedWasmHash` / `assertWasmHash`) BEFORE anything
//      is persisted, then deploy exactly one contract instance per program via
//      the contract-deployer signer, initializing it with the immutable,
//      PII-free `ImmutableProgramConfig` (Requirements 4.2, 7.1, 19.1). The
//      per-program idempotency key guarantees "exactly one instance per
//      program": a replay reconciles the prior deployment instead of deploying
//      again.
//   2. FUND     — escrow the FULL approved budget into the deployed instance via
//      the contract `fund()` (a SAC transfer authorized by the source treasury).
//      A partial amount is rejected before any intent is persisted
//      (Requirements 5.3, 5.4, 7.2).
//   3. ACTIVATE — gate on the TTL activation-safety check
//      (`assertActivationTtlSafe`) AND on reconciliation confirming the full
//      backing is escrowed, THEN call `activate()`. If either gate fails,
//      nothing is persisted and the program stays inactive (Requirements 5.3,
//      5.4, 5.6, 7.2).
//   4. ALLOCATE — allocate a beneficiary entitlement within the frozen policy
//      and remaining funded budget, PII-free and audited (Requirements 4.5, 5.8,
//      7.9, 9.x privacy). Allocation cannot exceed the funded budget.
//   5. SET_MERCHANT — synchronize a merchant authorization (add/revoke) within
//      the frozen policy, PII-free and audited, without changing completed
//      payments (Requirements 5.9, 9.5, 9.6, 9.7).
//
// Institutional signing is server-side and isolated (Requirement 18.4: the
// mobile app never performs contract-administration signing). Each operation is
// authorized by EXACTLY ONE institutional role whose source-account
// authorization covers the contract's `require_auth`:
//
//   - DEPLOY        -> `contract_deployer` (deploys the standardized WASM)
//   - FUND          -> `organization_treasury` (the SAC `from` that escrows)
//   - ACTIVATE / ALLOCATE / SET_MERCHANT -> `contract_admin` (program authority)
//
// The orchestrator signs the built transaction with that one isolated signer;
// `submit` then verifies the institutional signature is present and bound to the
// EXACT prepared transaction, adds ONLY a sponsor-signed fee-bump (fees only —
// it can never supply the missing contract authorization), and marks the attempt
// `submitted`. Confirmation — and therefore the program's `funded` / `active`
// transition and policy freeze — remain reconciliation-owned (Task 6.4 / 11.5);
// this module performs no `confirmed` transition.
//
// The `financial_operation_type` enum has no dedicated voucher deploy / fund /
// activate / merchant type, so the standing-up and administration of a voucher
// program's on-chain policy map onto `program_activation` (mirroring the cash
// rail's reservation), and entitlement allocation maps onto `voucher_allocation`.
// The idempotency `scope` disambiguates the concrete operation.
//
// The raw Soroban XDR construction (createContract + constructor / `Contract`
// invocations + simulation + assembly) is a live-network concern and is injected
// through the {@link VoucherEnvelopeBuilder} / {@link VoucherSubmitter} ports —
// exactly as the TTL keeper injects its footprint extender/restorer — so the
// validation, gating, hashing, and orchestration logic here is pure, reads no
// Deno globals, stays inside the project-wide type check, and is fully offline
// unit-testable.
//
// Validates: Requirements 4.2, 4.5, 5.3, 5.4, 5.6, 5.8, 5.9, 7.1, 7.2, 9.5, 9.6, 9.7

import {
    BASE_FEE,
    type FeeBumpTransaction,
    Keypair,
    type Transaction,
    TransactionBuilder,
} from '@stellar/stellar-sdk';

import {
    requireRCPHPIdentifiers,
    type StellarTestnetConfig,
} from '../../../../shared/stellar-config.ts';
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
import { assertSponsorSeparation, type SponsorGovernor } from './sponsorship.ts';
import { assertActivationTtlSafe, type TtlMaintenancePlan } from './ttl-maintenance.ts';
import {
    innerTransactionOf,
    parseTransactionEnvelope,
    transactionHashHex,
} from './xdr.ts';

// ---------------------------------------------------------------------------
// Shapes and validation constants.
// ---------------------------------------------------------------------------

/** A classic Stellar account address (G...). */
const G_ADDRESS = /^G[A-Z2-7]{55}$/;
/** A Soroban contract / SAC address (C...). */
const C_ADDRESS = /^C[A-Z2-7]{55}$/;
/** A 32-byte pseudonymous identifier rendered as 64 lowercase hex characters. */
const HEX_32_BYTES = /^[0-9a-f]{64}$/;
/**
 * An accreditation / program category CODE — never free text. Constraining the
 * category to a short machine code (not a description) keeps merchant/category
 * data PII-free and unambiguous on-chain.
 */
const CATEGORY_CODE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

/** The single pilot network for every voucher operation. */
export const VOUCHER_NETWORK = PILOT_WALLET_NETWORK;

/**
 * Idempotency scopes for the five voucher operations. Deploy/fund/activate/
 * set_merchant share the `program_activation` operation type (see file header);
 * allocate uses `voucher_allocation`. The scope is the disambiguator.
 */
export const VOUCHER_SCOPES = Object.freeze({
  deploy: 'voucher_deploy',
  fund: 'voucher_fund',
  activate: 'voucher_activate',
  allocate: 'voucher_allocation',
  set_merchant: 'voucher_merchant_sync',
} as const);

/** The isolated institutional role that authorizes each operation. */
export const VOUCHER_AUTHORIZER_ROLE: Readonly<Record<VoucherOperationKind, InstitutionalSignerRole>> =
  Object.freeze({
    deploy: 'contract_deployer',
    fund: 'organization_treasury',
    activate: 'contract_admin',
    allocate: 'contract_admin',
    set_merchant: 'contract_admin',
  });

/** The `financial_operation_type` each operation is persisted under. */
export const VOUCHER_OPERATION_TYPE: Readonly<Record<VoucherOperationKind, FinancialOperationType>> =
  Object.freeze({
    deploy: 'program_activation',
    fund: 'program_activation',
    activate: 'program_activation',
    allocate: 'voucher_allocation',
    set_merchant: 'program_activation',
  });

// ---------------------------------------------------------------------------
// Immutable program configuration (contract `initialize` constructor args).
// ---------------------------------------------------------------------------

/**
 * The immutable, PII-FREE configuration a voucher contract instance is
 * initialized with. Every field is either a Stellar address, a pseudonymous
 * 32-byte hex identifier, an integer stroop amount, an integer ledger/second
 * count, or a short category code — so nothing here can carry beneficiary
 * identity (Requirements 4.2, 19.1). Amounts are i128 stroops.
 */
export interface ImmutableProgramConfig {
  /** Pseudonymous 32-byte program identifier (64 hex); never a Supabase user id. */
  readonly programRef: string;
  /** The `RCPHP` Stellar Asset Contract address the instance escrows through. */
  readonly sacAddress: string;
  /** The funding source treasury account authorized to `fund()`. */
  readonly treasury: string;
  /** The program administrator account (allocate / set_merchant / activate). */
  readonly admin: string;
  readonly assetCode: string;
  readonly assetIssuer: string;
  /** The full approved budget the instance must escrow before activation. */
  readonly fundedBudgetStroops: number;
  /** Per-redemption ceiling enforced by the contract. */
  readonly perTransactionLimitStroops: number;
  /** Per-entitlement daily ceiling enforced by the contract. */
  readonly dailyLimitStroops: number;
  /** Program expiry, as a Unix-seconds timestamp (u64). */
  readonly expiresAt: number;
  /** Ledgers the refund window (and TTL keeper) must keep entries live for. */
  readonly refundWindowLedgers: number;
  /** The immutable contract version. */
  readonly contractVersion: number;
  /** The authorized accreditation categories for the program. */
  readonly authorizedCategories: readonly string[];
  readonly networkPassphrase: string;
}

/** A single beneficiary entitlement allocation (PII-free). */
export interface EntitlementAllocationInput {
  /** Pseudonymous 32-byte entitlement identifier (64 hex). */
  readonly entitlementId: string;
  /** The beneficiary's currently authorized wallet (G...). */
  readonly beneficiaryWallet: string;
  /** The entitlement amount, in i128 stroops. */
  readonly amountStroops: number;
  /** Entitlement expiry, as a Unix-seconds timestamp (u64). */
  readonly expiresAt: number;
}

/** A merchant authorization change to synchronize on-chain (PII-free). */
export interface MerchantAuthorizationInput {
  /** Pseudonymous 32-byte merchant identifier (64 hex); never a display name. */
  readonly merchantId: string;
  /** The merchant's verified settlement wallet (G...). */
  readonly settlementWallet: string;
  /** The accreditation category CODE (not free text). */
  readonly category: string;
  /** Authorization validity end, as a Unix-seconds timestamp (u64). */
  readonly validUntil: number;
  /** `true` to authorize/add, `false` to revoke. */
  readonly authorized: boolean;
}

/**
 * The frozen policy an allocation or merchant change is validated against. It is
 * the subset of the activated {@link ImmutableProgramConfig} that later
 * operational changes must stay within; they can never alter it (Property 9).
 */
export interface FrozenProgramPolicy {
  readonly programRef: string;
  readonly fundedBudgetStroops: number;
  readonly perTransactionLimitStroops: number;
  readonly dailyLimitStroops: number;
  readonly authorizedCategories: readonly string[];
  /** Program expiry (Unix seconds); entitlements may not outlive it. */
  readonly expiresAt: number;
}

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

/**
 * Asserts an {@link ImmutableProgramConfig} is well-formed and PII-FREE: the
 * program identifier is a pseudonymous 32-byte hex value, every account is a
 * valid Stellar address, the SAC is a contract address, amounts are positive
 * i128 stroops, ledger/second counts are non-negative integers, and categories
 * are short machine codes rather than free text. Because the shape admits only
 * addresses, pseudonyms, integers, and codes, no direct or reversible
 * beneficiary identity can be smuggled into the contract configuration
 * (Requirements 4.2, 19.1). Throws a typed validation error on any deviation.
 */
export const assertProgramConfigPiiFree = (
  config: ImmutableProgramConfig,
  correlationId: string,
): void => {
  assertShape(config.programRef, HEX_32_BYTES, 'programRef', correlationId);
  assertShape(config.sacAddress, C_ADDRESS, 'sacAddress', correlationId);
  assertShape(config.treasury, G_ADDRESS, 'treasury', correlationId);
  assertShape(config.admin, G_ADDRESS, 'admin', correlationId);
  assertShape(config.assetIssuer, G_ADDRESS, 'assetIssuer', correlationId);
  if (typeof config.assetCode !== 'string' || !/^[A-Za-z0-9]{1,12}$/.test(config.assetCode)) {
    reject(correlationId, 'assetCode is not a valid asset code.', 'assetCode');
  }
  assertPositiveI128(config.fundedBudgetStroops, 'fundedBudgetStroops', correlationId);
  assertPositiveI128(config.perTransactionLimitStroops, 'perTransactionLimitStroops', correlationId);
  assertPositiveI128(config.dailyLimitStroops, 'dailyLimitStroops', correlationId);
  assertPositiveI128(config.expiresAt, 'expiresAt', correlationId);
  assertNonNegativeInt(config.refundWindowLedgers, 'refundWindowLedgers', correlationId);
  assertNonNegativeInt(config.contractVersion, 'contractVersion', correlationId);
  if (config.authorizedCategories.length === 0) {
    reject(correlationId, 'At least one authorized category is required.', 'authorizedCategories');
  }
  for (const category of config.authorizedCategories) {
    assertShape(category, CATEGORY_CODE, 'authorizedCategories', correlationId);
  }
};

/** Canonical, order-stable serialization of the immutable config (for hashing). */
const canonicalProgramConfig = (config: ImmutableProgramConfig): string =>
  [
    config.programRef,
    config.sacAddress,
    config.treasury,
    config.admin,
    config.assetCode,
    config.assetIssuer,
    config.fundedBudgetStroops.toString(),
    config.perTransactionLimitStroops.toString(),
    config.dailyLimitStroops.toString(),
    config.expiresAt.toString(),
    config.refundWindowLedgers.toString(),
    config.contractVersion.toString(),
    [...config.authorizedCategories].join(','),
    config.networkPassphrase,
  ].join('|');

/** Deterministic 64-hex hash of the immutable program configuration. */
export const computeProgramConfigHash = (config: ImmutableProgramConfig): Promise<string> =>
  sha256Hex(`program_config|v1|${canonicalProgramConfig(config)}`);

/**
 * Asserts allocating `requestedStroops` keeps total outstanding entitlements
 * within the funded budget (Requirements 5.4, 7.9: `allocated_outstanding <=
 * contract_balance`, and value can never exceed funded value). Uses BigInt so an
 * i128 budget near the numeric ceiling is compared exactly. Throws
 * `insufficient_budget` when the allocation would overcommit the escrow.
 */
export const assertAllocationWithinBudget = (
  params: {
    readonly fundedBudgetStroops: number;
    readonly alreadyAllocatedStroops: number;
    readonly requestedStroops: number;
  },
  correlationId: string,
): void => {
  assertPositiveI128(params.requestedStroops, 'amountStroops', correlationId);
  assertNonNegativeInt(params.alreadyAllocatedStroops, 'alreadyAllocatedStroops', correlationId);
  assertPositiveI128(params.fundedBudgetStroops, 'fundedBudgetStroops', correlationId);
  const projected = BigInt(params.alreadyAllocatedStroops) + BigInt(params.requestedStroops);
  if (projected > BigInt(params.fundedBudgetStroops)) {
    throw FinancialErrorException.of(
      'insufficient_budget',
      'This allocation would exceed the funded program budget.',
      { correlationId },
    );
  }
};

/**
 * Validates a PII-free entitlement allocation against the frozen policy: the
 * identifiers/addresses are well-formed, the amount is a positive i128 within
 * the remaining funded budget, and the entitlement does not outlive the program
 * (Requirements 4.5, 5.8, 7.9). Returns nothing; throws on any violation.
 */
export const assertEntitlementAllocationValid = (
  entitlement: EntitlementAllocationInput,
  policy: FrozenProgramPolicy,
  alreadyAllocatedStroops: number,
  correlationId: string,
): void => {
  assertShape(entitlement.entitlementId, HEX_32_BYTES, 'entitlementId', correlationId);
  assertShape(entitlement.beneficiaryWallet, G_ADDRESS, 'beneficiaryWallet', correlationId);
  assertPositiveI128(entitlement.amountStroops, 'amountStroops', correlationId);
  assertPositiveI128(entitlement.expiresAt, 'expiresAt', correlationId);
  if (entitlement.expiresAt > policy.expiresAt) {
    reject(correlationId, 'An entitlement cannot expire after the program.', 'expiresAt');
  }
  assertAllocationWithinBudget(
    {
      fundedBudgetStroops: policy.fundedBudgetStroops,
      alreadyAllocatedStroops,
      requestedStroops: entitlement.amountStroops,
    },
    correlationId,
  );
};

/**
 * Validates a PII-free merchant authorization against the frozen policy: the
 * merchant identifier is a pseudonym, the settlement wallet is a valid account,
 * and the category is an authorized program category code (Requirements 5.9,
 * 9.5, 9.6, 9.7). A revocation (`authorized === false`) still validates the
 * identifiers so the exact merchant is targeted, but does not require the
 * category to remain authorized. Throws on any violation.
 */
export const assertMerchantAuthorizationValid = (
  merchant: MerchantAuthorizationInput,
  policy: FrozenProgramPolicy,
  correlationId: string,
): void => {
  assertShape(merchant.merchantId, HEX_32_BYTES, 'merchantId', correlationId);
  assertShape(merchant.settlementWallet, G_ADDRESS, 'settlementWallet', correlationId);
  assertShape(merchant.category, CATEGORY_CODE, 'category', correlationId);
  assertPositiveI128(merchant.validUntil, 'validUntil', correlationId);
  if (merchant.authorized && !policy.authorizedCategories.includes(merchant.category)) {
    reject(
      correlationId,
      'The merchant category is not authorized for this program.',
      'category',
    );
  }
};

/**
 * The activation double gate. A voucher program may activate ONLY when (1) the
 * TTL keeper reports its contract data is live with refund-window runway and no
 * archived entries (`assertActivationTtlSafe`), and (2) reconciliation confirms
 * the full approved budget is actually escrowed in the instance
 * (`confirmedBackingStroops >= fundedBudgetStroops`). Either gate failing keeps
 * the program inactive (Requirements 5.3, 5.4, 5.6, 7.2). Throws
 * `contract_archived` / `validation_failed` (from the TTL gate) or
 * `insufficient_budget` when backing is short.
 */
export const assertActivationReady = (
  params: {
    readonly ttlPlan: TtlMaintenancePlan;
    readonly confirmedBackingStroops: number;
    readonly fundedBudgetStroops: number;
  },
  correlationId: string,
): void => {
  assertActivationTtlSafe(params.ttlPlan, { correlationId });
  assertNonNegativeInt(params.confirmedBackingStroops, 'confirmedBackingStroops', correlationId);
  assertPositiveI128(params.fundedBudgetStroops, 'fundedBudgetStroops', correlationId);
  if (BigInt(params.confirmedBackingStroops) < BigInt(params.fundedBudgetStroops)) {
    throw FinancialErrorException.of(
      'insufficient_budget',
      'The contract is not yet fully backed by the approved budget; activation is blocked.',
      { correlationId },
    );
  }
};

/** Verifies `transaction` carries a valid signature by `publicKey`. */
export const verifyTransactionSignedBy = (
  transaction: Transaction,
  publicKey: string,
): boolean => {
  const keypair = Keypair.fromPublicKey(publicKey);
  const hash = transaction.hash();
  return transaction.signatures.some((decorated) => {
    try {
      return keypair.verify(hash, decorated.signature());
    } catch {
      return false;
    }
  });
};

// ---------------------------------------------------------------------------
// Invocation specs, built operation, and injected Soroban ports.
// ---------------------------------------------------------------------------

export type VoucherOperationKind = 'deploy' | 'fund' | 'activate' | 'allocate' | 'set_merchant';

/**
 * The exact, non-secret parameters of a single voucher operation. The
 * {@link VoucherEnvelopeBuilder} turns one of these into an unsigned,
 * simulation-assembled transaction. Nothing here carries a secret key or
 * beneficiary PII.
 */
export type VoucherInvocationSpec =
  | {
      readonly kind: 'deploy';
      /** The approved immutable WASM hash (64 hex). */
      readonly wasmHash: string;
      readonly config: ImmutableProgramConfig;
      /** The deployer account (source; contract-deployer signer). */
      readonly deployer: string;
      /** A 32-byte deployment salt (64 hex) making the instance address stable. */
      readonly salt: string;
    }
  | {
      readonly kind: 'fund';
      readonly contractId: string;
      readonly sacAddress: string;
      /** The escrow source treasury (SAC `from`; must authorize). */
      readonly from: string;
      readonly amountStroops: number;
    }
  | { readonly kind: 'activate'; readonly contractId: string; readonly programRef: string }
  | {
      readonly kind: 'allocate';
      readonly contractId: string;
      readonly entitlement: EntitlementAllocationInput;
    }
  | {
      readonly kind: 'set_merchant';
      readonly contractId: string;
      readonly merchant: MerchantAuthorizationInput;
    };

/** An unsigned, simulation-assembled transaction ready for institutional signing. */
export interface BuiltVoucherOperation {
  /** The unsigned classic transaction envelope (carries the Soroban op + auth). */
  readonly envelopeXdr: string;
  /** Lowercase-hex hash (64 hex) of the exact prepared transaction. */
  readonly preparedPayloadHash: string;
  readonly minLedger: number | null;
  readonly maxLedger: number | null;
  /**
   * The contract instance the operation targets. For `deploy` this is the
   * deterministically-derived instance address; for the others it echoes the
   * spec's `contractId`. It is `null` only when the builder cannot yet resolve
   * a deploy address.
   */
  readonly contractId: string | null;
}

/**
 * Builds the exact unsigned Soroban transaction for a spec, having simulated and
 * assembled it against the guarded RPC (footprint, resource fees). Implemented
 * by the voucher Edge Function wiring using the guarded RPC client and the SDK;
 * injected here so the orchestration/gating/validation logic is offline-testable
 * without constructing real contract XDR.
 */
export interface VoucherEnvelopeBuilder {
  build(
    spec: VoucherInvocationSpec,
    context: { readonly correlationId: string },
  ): Promise<BuiltVoucherOperation>;
}

/** Submits a fully-assembled transaction through the guarded RPC client. */
export interface VoucherSubmitter {
  submit(transaction: Transaction | FeeBumpTransaction): Promise<SubmissionAcceptance>;
}

// ---------------------------------------------------------------------------
// Per-operation canonical payload hashes.
// ---------------------------------------------------------------------------
//
// Each hash binds the immutable business identity of the operation — but never
// the transaction sequence — so a retry under the same idempotency key hashes
// identically and reuses the one intent instead of acting twice.

export const computeDeployPayloadHash = async (
  spec: Extract<VoucherInvocationSpec, { kind: 'deploy' }>,
): Promise<string> => {
  const configHash = await computeProgramConfigHash(spec.config);
  return sha256Hex(
    ['voucher_deploy', 'v1', spec.config.programRef, spec.wasmHash, spec.deployer, spec.salt, configHash].join('|'),
  );
};

export const computeFundPayloadHash = (
  spec: Extract<VoucherInvocationSpec, { kind: 'fund' }>,
): Promise<string> =>
  sha256Hex(
    ['voucher_fund', 'v1', spec.contractId, spec.sacAddress, spec.from, spec.amountStroops.toString()].join('|'),
  );

export const computeActivatePayloadHash = (
  spec: Extract<VoucherInvocationSpec, { kind: 'activate' }>,
): Promise<string> =>
  sha256Hex(['voucher_activate', 'v1', spec.contractId, spec.programRef].join('|'));

export const computeAllocatePayloadHash = (
  spec: Extract<VoucherInvocationSpec, { kind: 'allocate' }>,
): Promise<string> =>
  sha256Hex(
    [
      'voucher_allocate',
      'v1',
      spec.contractId,
      spec.entitlement.entitlementId,
      spec.entitlement.beneficiaryWallet,
      spec.entitlement.amountStroops.toString(),
      spec.entitlement.expiresAt.toString(),
    ].join('|'),
  );

export const computeSetMerchantPayloadHash = (
  spec: Extract<VoucherInvocationSpec, { kind: 'set_merchant' }>,
): Promise<string> =>
  sha256Hex(
    [
      'voucher_set_merchant',
      'v1',
      spec.contractId,
      spec.merchant.merchantId,
      spec.merchant.settlementWallet,
      spec.merchant.category,
      spec.merchant.validUntil.toString(),
      String(spec.merchant.authorized),
    ].join('|'),
  );

// ---------------------------------------------------------------------------
// OperationProtocol strategy (one per operation, capturing its spec).
// ---------------------------------------------------------------------------

export interface VoucherStrategyDependencies {
  readonly kind: VoucherOperationKind;
  /** The exact invocation this strategy builds and verifies. */
  readonly spec: VoucherInvocationSpec;
  readonly builder: VoucherEnvelopeBuilder;
  readonly submitter: VoucherSubmitter;
}

/**
 * Builds the {@link OperationProtocol} strategy for a single voucher operation.
 * `build` delegates the exact Soroban transaction construction to the injected
 * builder (re-verifying the approved WASM hash for a deploy). `verifyAndAssemble`
 * verifies the returned institutional signature is bound to the EXACT prepared
 * transaction, confirms the required authorizer signed, wraps the signed inner
 * transaction in a sponsor-signed fee-bump (fees only — never contract
 * authorization), and submits through the guarded RPC. It never marks the
 * attempt confirmed.
 */
export const createVoucherOperationStrategy = (
  deps: VoucherStrategyDependencies,
): OperationProtocol => {
  const authorizerRole = VOUCHER_AUTHORIZER_ROLE[deps.kind];
  const operationType = VOUCHER_OPERATION_TYPE[deps.kind];

  const build = async (context: StrategyContext): Promise<BuildResult> => {
    const { config, correlationId, guard } = context;

    // Defense in depth: re-assert the approved WASM hash at build time for a
    // deployment, so a mutated spec can never deploy unapproved code.
    if (deps.spec.kind === 'deploy') {
      guard.assertWasmHash(deps.spec.wasmHash);
    }

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
      network: VOUCHER_NETWORK,
      envelopeXdr: built.envelopeXdr,
      preparedPayloadHash: built.preparedPayloadHash,
      minLedger: built.minLedger,
      maxLedger: built.maxLedger,
      signingPackage,
      authorizationPayload: {
        operation: deps.kind,
        contract_id: built.contractId,
        authorizer_role: authorizerRole,
      },
    };
  };

  const verifyAndAssemble = async (context: VerifyContext) => {
    const { config, correlationId, parsedBuiltEnvelope, signed } = context;

    if (signed.kind !== 'classic_envelope') {
      throw FinancialErrorException.of(
        'validation_failed',
        'A voucher program operation expects a signed classic transaction.',
        { correlationId },
      );
    }

    const parsedSigned = parseTransactionEnvelope(signed.signedEnvelopeXdr, config.networkPassphrase);
    if (parsedSigned.isFeeBump) {
      throw FinancialErrorException.of(
        'validation_failed',
        'The institutional signature must sign the inner invocation, not a fee-bump.',
        { correlationId },
      );
    }
    const signedTransaction = parsedSigned.transaction as Transaction;
    const builtInner = innerTransactionOf(parsedBuiltEnvelope.transaction);

    // Bind the signature to the EXACT prepared transaction (every operation and
    // the sequence) in one hash comparison.
    if (transactionHashHex(signedTransaction) !== transactionHashHex(builtInner)) {
      throw FinancialErrorException.of(
        'validation_failed',
        'The signed transaction does not match the prepared voucher operation.',
        { correlationId },
      );
    }

    // The required institutional authorization MUST be present and valid.
    const authorizer = context.signers.publicKeyOf(authorizerRole);
    if (!verifyTransactionSignedBy(signedTransaction, authorizer)) {
      throw FinancialErrorException.of(
        'authorization_failed',
        'The voucher operation is missing a valid contract-authority signature.',
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
        programEscrow: authorizerRole === 'organization_treasury' ? authorizer : null,
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

    const transactionHash = transactionHashHex(feeBump);

    return {
      transactionHash,
      submit: (): Promise<SubmissionAcceptance> => deps.submitter.submit(feeBump),
    };
  };

  return Object.freeze({ operationType, build, verifyAndAssemble });
};

// ---------------------------------------------------------------------------
// Program lifecycle state port (optional; records in-flight states).
// ---------------------------------------------------------------------------

/**
 * Records a program's in-flight lifecycle state. Confirmation (the `funded` /
 * `active` transition and policy freeze) is reconciliation-owned; this port only
 * advances to in-flight states, which are still INACTIVE. Optional so the
 * orchestration is usable and unit-testable without a program store.
 */
export interface VoucherProgramStatePort {
  markInFlight(params: {
    readonly programId: string;
    readonly organizationId: string;
    readonly operation: VoucherOperationKind;
    readonly contractId: string | null;
    readonly correlationId: string;
  }): Promise<void>;
}

// ---------------------------------------------------------------------------
// Orchestrator.
// ---------------------------------------------------------------------------

export interface VoucherProgramDependencies {
  readonly protocol: TransactionProtocol;
  readonly config: StellarTestnetConfig;
  /** Defaults to a guard built from `config`; supply one carrying the WASM hash. */
  readonly guard?: NetworkGuard;
  readonly signers: InstitutionalSignerRegistry;
  readonly builder: VoucherEnvelopeBuilder;
  readonly submitter: VoucherSubmitter;
  /** Optional pre-operation sponsorship gate. */
  readonly sponsor?: SponsorGovernor;
  /** Optional in-flight lifecycle recorder. */
  readonly programState?: VoucherProgramStatePort;
}

/** Common fields every voucher operation request carries. */
interface VoucherRequestBase {
  readonly organizationId: string;
  readonly programId: string;
  /** Deterministic business idempotency key, e.g. `voucher-deploy:<programId>`. */
  readonly idempotencyKey: string;
  readonly requestedBy?: string | null;
  readonly correlationId?: string;
}

export interface DeployRequest extends VoucherRequestBase {
  readonly wasmHash: string;
  readonly config: ImmutableProgramConfig;
  readonly deployer: string;
  readonly salt: string;
}

export interface FundRequest extends VoucherRequestBase {
  readonly contractId: string;
  readonly sacAddress: string;
  readonly from: string;
  /** The full approved budget to escrow, in i128 stroops. */
  readonly amountStroops: number;
  /** The full approved budget the amount must equal. */
  readonly fundedBudgetStroops: number;
}

export interface ActivateRequest extends VoucherRequestBase {
  readonly contractId: string;
  readonly programRef: string;
  readonly ttlPlan: TtlMaintenancePlan;
  readonly confirmedBackingStroops: number;
  readonly fundedBudgetStroops: number;
}

export interface AllocateRequest extends VoucherRequestBase {
  readonly contractId: string;
  readonly entitlement: EntitlementAllocationInput;
  readonly policy: FrozenProgramPolicy;
  /** Total entitlement value already allocated for the program. */
  readonly alreadyAllocatedStroops: number;
}

export interface SetMerchantRequest extends VoucherRequestBase {
  readonly contractId: string;
  readonly merchant: MerchantAuthorizationInput;
  readonly policy: FrozenProgramPolicy;
}

export interface PreparedVoucherOperation {
  readonly kind: VoucherOperationKind;
  readonly isReplay: boolean;
  readonly intent: FinancialIntentRecord;
  /** The built attempt, or `null` on a replay (reconcile the prior one instead). */
  readonly attempt: TransactionAttemptRecord | null;
  /** ONLY the client-signable package; `null` on a replay. */
  readonly signingPackage: SigningPackage | null;
  /** The captured invocation spec, needed by `submit`; `null` on a replay. */
  readonly spec: VoucherInvocationSpec | null;
}

export interface VoucherSubmitInput {
  readonly kind: VoucherOperationKind;
  readonly intent: FinancialIntentRecord;
  readonly attempt: TransactionAttemptRecord;
  readonly spec: VoucherInvocationSpec;
}

/**
 * Builds the voucher-program deployment + lifecycle orchestrator. It composes
 * the reusable transaction protocol with the voucher-specific gates
 * (WASM-hash verification, full-budget funding, TTL + full-backing activation,
 * allocation bounds, merchant-policy validation) and the isolated
 * institutional-signing step, and exposes one `prepare*` per operation plus a
 * shared `submit`.
 */
export const createVoucherProgram = (deps: VoucherProgramDependencies) => {
  const guard = deps.guard ?? createNetworkGuard(deps.config);
  guard.assertTestnetConfig();

  const strategyFor = (kind: VoucherOperationKind, spec: VoucherInvocationSpec): OperationProtocol =>
    createVoucherOperationStrategy({
      kind,
      spec,
      builder: deps.builder,
      submitter: deps.submitter,
    });

  const signInstitutional = (role: InstitutionalSignerRole, unsignedEnvelopeXdr: string): string => {
    const parsed = parseTransactionEnvelope(unsignedEnvelopeXdr, deps.config.networkPassphrase);
    deps.signers.get(role).signTransaction(parsed.transaction);
    return parsed.transaction.toXDR();
  };

  const maybeAuthorizeSponsorship = async (
    kind: VoucherOperationKind,
    request: VoucherRequestBase,
    correlationId: string,
  ): Promise<void> => {
    if (deps.sponsor === undefined) {
      return;
    }
    await deps.sponsor.authorize({
      // A conservative flat fee-bump estimate; the reconciler records the exact
      // sponsored cost from the ledger.
      estimatedCostStroops: Number(BASE_FEE) * 4,
      purpose: `voucher_${kind}_fee_bump`,
      correlationId,
      organizationId: request.organizationId,
      programId: request.programId,
    });
  };

  /**
   * Shared prepare pipeline: persist the immutable intent behind the business
   * idempotency key (a replay reconciles the prior one and builds nothing),
   * record the optional in-flight state, and build the attempt.
   */
  const persistAndBuild = async (
    kind: VoucherOperationKind,
    request: VoucherRequestBase,
    spec: VoucherInvocationSpec,
    payloadHash: string,
    amountStroops: number | null,
    correlationId: string,
  ): Promise<PreparedVoucherOperation> => {
    const rcphp = requireRCPHPIdentifiers(deps.config);
    const prepared = await deps.protocol.prepare({
      organizationId: request.organizationId,
      programId: request.programId,
      operationType: VOUCHER_OPERATION_TYPE[kind],
      scope: VOUCHER_SCOPES[kind],
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
        intent: prepared.intent,
        attempt: null,
        signingPackage: null,
        spec: null,
      };
    }

    const contractId = spec.kind === 'deploy' ? null : spec.contractId;
    if (deps.programState) {
      await deps.programState.markInFlight({
        programId: request.programId,
        organizationId: request.organizationId,
        operation: kind,
        contractId,
        correlationId,
      });
    }

    const built = await deps.protocol.build(prepared.intent, strategyFor(kind, spec));
    return {
      kind,
      isReplay: false,
      intent: prepared.intent,
      attempt: built.attempt,
      signingPackage: built.signingPackage,
      spec,
    };
  };

  /**
   * DEPLOY. Verifies the approved immutable WASM hash and PII-free config BEFORE
   * anything is persisted; the per-program idempotency key guarantees exactly
   * one instance per program.
   */
  const prepareDeploy = async (request: DeployRequest): Promise<PreparedVoucherOperation> => {
    const correlationId = request.correlationId ?? newCorrelationId();
    // The approved-hash and privacy gates run first: a bad hash or PII in the
    // configuration reserves nothing (no intent, no attempt, no deployment).
    guard.assertWasmHash(request.wasmHash);
    assertProgramConfigPiiFree(request.config, correlationId);
    assertShape(request.deployer, G_ADDRESS, 'deployer', correlationId);
    assertShape(request.salt, HEX_32_BYTES, 'salt', correlationId);
    await maybeAuthorizeSponsorship('deploy', request, correlationId);

    const spec: VoucherInvocationSpec = {
      kind: 'deploy',
      wasmHash: request.wasmHash,
      config: request.config,
      deployer: request.deployer,
      salt: request.salt,
    };
    const payloadHash = await computeDeployPayloadHash(spec);
    return persistAndBuild('deploy', request, spec, payloadHash, null, correlationId);
  };

  /**
   * FUND. Escrows the FULL approved budget into the instance; a partial amount
   * is rejected before any intent is persisted.
   */
  const prepareFund = async (request: FundRequest): Promise<PreparedVoucherOperation> => {
    const correlationId = request.correlationId ?? newCorrelationId();
    assertShape(request.contractId, C_ADDRESS, 'contractId', correlationId);
    assertShape(request.sacAddress, C_ADDRESS, 'sacAddress', correlationId);
    assertShape(request.from, G_ADDRESS, 'from', correlationId);
    assertPositiveI128(request.amountStroops, 'amountStroops', correlationId);
    assertPositiveI128(request.fundedBudgetStroops, 'fundedBudgetStroops', correlationId);
    if (BigInt(request.amountStroops) !== BigInt(request.fundedBudgetStroops)) {
      throw FinancialErrorException.of(
        'validation_failed',
        'Voucher funding must escrow the full approved budget, not a partial amount.',
        { correlationId, fieldErrors: { amountStroops: ['must equal the full approved budget'] } },
      );
    }
    guard.assertContractAllowed(request.contractId);
    await maybeAuthorizeSponsorship('fund', request, correlationId);

    const spec: VoucherInvocationSpec = {
      kind: 'fund',
      contractId: request.contractId,
      sacAddress: request.sacAddress,
      from: request.from,
      amountStroops: request.amountStroops,
    };
    const payloadHash = await computeFundPayloadHash(spec);
    return persistAndBuild('fund', request, spec, payloadHash, request.amountStroops, correlationId);
  };

  /**
   * ACTIVATE. Gates on the TTL activation-safety check AND on reconciliation
   * confirming the full backing is escrowed; both must pass before anything is
   * persisted or `activate()` is built.
   */
  const prepareActivate = async (request: ActivateRequest): Promise<PreparedVoucherOperation> => {
    const correlationId = request.correlationId ?? newCorrelationId();
    assertShape(request.contractId, C_ADDRESS, 'contractId', correlationId);
    assertShape(request.programRef, HEX_32_BYTES, 'programRef', correlationId);
    assertActivationReady(
      {
        ttlPlan: request.ttlPlan,
        confirmedBackingStroops: request.confirmedBackingStroops,
        fundedBudgetStroops: request.fundedBudgetStroops,
      },
      correlationId,
    );
    guard.assertContractAllowed(request.contractId);
    await maybeAuthorizeSponsorship('activate', request, correlationId);

    const spec: VoucherInvocationSpec = {
      kind: 'activate',
      contractId: request.contractId,
      programRef: request.programRef,
    };
    const payloadHash = await computeActivatePayloadHash(spec);
    return persistAndBuild('activate', request, spec, payloadHash, null, correlationId);
  };

  /**
   * ALLOCATE. Validates the PII-free entitlement stays within the frozen policy
   * and remaining funded budget before anything is persisted.
   */
  const prepareAllocate = async (request: AllocateRequest): Promise<PreparedVoucherOperation> => {
    const correlationId = request.correlationId ?? newCorrelationId();
    assertShape(request.contractId, C_ADDRESS, 'contractId', correlationId);
    assertEntitlementAllocationValid(
      request.entitlement,
      request.policy,
      request.alreadyAllocatedStroops,
      correlationId,
    );
    guard.assertContractAllowed(request.contractId);
    await maybeAuthorizeSponsorship('allocate', request, correlationId);

    const spec: VoucherInvocationSpec = {
      kind: 'allocate',
      contractId: request.contractId,
      entitlement: request.entitlement,
    };
    const payloadHash = await computeAllocatePayloadHash(spec);
    return persistAndBuild(
      'allocate',
      request,
      spec,
      payloadHash,
      request.entitlement.amountStroops,
      correlationId,
    );
  };

  /**
   * SET_MERCHANT. Validates the PII-free merchant authorization against the
   * frozen policy before anything is persisted. Adding or revoking a merchant
   * never changes completed payments.
   */
  const prepareSetMerchant = async (
    request: SetMerchantRequest,
  ): Promise<PreparedVoucherOperation> => {
    const correlationId = request.correlationId ?? newCorrelationId();
    assertShape(request.contractId, C_ADDRESS, 'contractId', correlationId);
    assertMerchantAuthorizationValid(request.merchant, request.policy, correlationId);
    guard.assertContractAllowed(request.contractId);
    await maybeAuthorizeSponsorship('set_merchant', request, correlationId);

    const spec: VoucherInvocationSpec = {
      kind: 'set_merchant',
      contractId: request.contractId,
      merchant: request.merchant,
    };
    const payloadHash = await computeSetMerchantPayloadHash(spec);
    return persistAndBuild('set_merchant', request, spec, payloadHash, null, correlationId);
  };

  /**
   * Signs the built transaction with the operation's isolated institutional
   * signer, then submits through the protocol, which verifies the signature and
   * network binding, adds only the sponsor fee-bump, and marks the attempt
   * `submitted`. Confirmation — and therefore the program's funded/active
   * transition — remain reconciliation-owned.
   */
  const submit = async (input: VoucherSubmitInput): Promise<SubmitResult> => {
    const { kind, intent, attempt, spec } = input;
    if (attempt.envelope_xdr === null) {
      throw FinancialErrorException.of(
        'validation_failed',
        'This voucher attempt has no prepared transaction to submit.',
        { correlationId: attempt.correlation_id },
      );
    }
    const authorizerRole = VOUCHER_AUTHORIZER_ROLE[kind];
    const signedEnvelopeXdr = signInstitutional(authorizerRole, attempt.envelope_xdr);
    return deps.protocol.submit(
      { intent, attempt },
      { kind: 'classic_envelope', signedEnvelopeXdr },
      strategyFor(kind, spec),
    );
  };

  return Object.freeze({
    prepareDeploy,
    prepareFund,
    prepareActivate,
    prepareAllocate,
    prepareSetMerchant,
    submit,
  });
};

// ---------------------------------------------------------------------------
// Default guarded-RPC submitter adapter.
// ---------------------------------------------------------------------------
//
// The submitter is the live-network boundary and is exercised by integration
// tests, not the offline unit harness. It re-asserts the network before sending
// so a mutated endpoint fails closed, then submits the fully-assembled
// transaction through the guarded Soroban RPC client. The envelope BUILDER
// (createContract + constructor / `Contract` invocations + simulation) is
// provided by the voucher Edge Function wiring, which owns the SDK-specific
// assembly, and is injected as {@link VoucherEnvelopeBuilder}.

/**
 * Builds a {@link VoucherSubmitter} from the guarded RPC client. It verifies the
 * network before sending and returns the accepted transaction hash and status;
 * confirmation remains reconciliation-owned.
 */
export const createRpcVoucherSubmitter = (rpcClient: GuardedRpcClient): VoucherSubmitter =>
  Object.freeze({
    async submit(transaction: Transaction | FeeBumpTransaction): Promise<SubmissionAcceptance> {
      await rpcClient.assertNetwork();
      const response = await rpcClient.server.sendTransaction(transaction);
      const accepted = response as unknown as { hash?: string; status?: string };
      safeLog('voucher operation submitted', { status: accepted.status });
      return {
        transactionHash: accepted.hash ?? transactionHashHex(transaction),
        resultCode: accepted.status ?? null,
      };
    },
  });

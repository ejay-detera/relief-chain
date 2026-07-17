// Cash-program activation: OperationProtocol strategy + prepare/submit orchestration.
//
// Activating a cash program reserves its full approved budget on-chain (design
// "Stellar Account and Asset Topology": the cash-program treasury reserves one
// activated cash-program budget). This is a classic `RCPHP` payment moving the
// full approved budget FROM the organization treasury INTO the dedicated
// cash-program treasury, wrapped by a sponsor-signed fee-bump so the reservation
// never depends on the treasury holding XLM for fees.
//
// This module composes the Task 6.1 security utilities and the Task 6.2 guarded
// clients / isolated institutional signers around the Task 6.3 reusable
// prepare/build/authorize/submit protocol. It owns only the cash-activation
// specifics; the invariants that must hold regardless of rail (immutable intent,
// one attempt per business key, `submitted`-not-`confirmed`, reconcile-before-
// retry) stay in {@link createTransactionProtocol}.
//
// The activation rules this module enforces (Requirements 5.3, 5.5, 5.6, 5.7):
//
//   - VERIFY treasury balance first. `prepare` reads the organization treasury
//     `RCPHP` balance through the guarded Horizon client BEFORE any reservation
//     is recorded. If the treasury does not hold the full approved budget, it
//     throws a typed `insufficient_budget` error and NOTHING is reserved: no
//     intent is persisted, no transaction is built, and no value moves.
//   - RESERVE the full approved budget into the dedicated cash-program treasury.
//     The built payment transfers exactly `budget_stroops` of `RCPHP` from the
//     organization treasury to the cash-program treasury and nowhere else.
//   - KEEP the program inactive while activation is failed/unconfirmed. `submit`
//     only ever marks the attempt `submitted`; it NEVER marks the program funded
//     or active. A failed or unknown submission leaves the program un-activated.
//   - FREEZE policy only after reconciliation confirms funding. Confirmation is
//     reconciliation-owned (Task 6.4 / 10.4): this module deliberately performs
//     NO `funded`/`policy_locked` transition. The optional funding port only
//     records the in-flight `reserving` state, which is still inactive.
//
// Institutional signing is server-side and isolated (Requirement 18.4: the
// mobile app never performs organization signing). The organization treasury
// authorizes the inner transaction through the isolated `organization_treasury`
// signer (the "orchestrated remote signer"), `submit` VERIFIES that returned
// institutional signature is present and bound to the exact prepared
// transaction, then the isolated `sponsor` signer adds a fee-bump that pays fees
// only — it can never supply the missing treasury authorization.
//
// Configuration and all I/O are injected, so the module reads no Deno globals
// and stays inside the project-wide type check and the transpile-inject unit
// test harness.
//
// Validates: Requirements 5.3, 5.5, 5.6, 5.7

import {
    Asset,
    BASE_FEE,
    Keypair,
    Operation,
    type Transaction,
    TransactionBuilder,
} from '@stellar/stellar-sdk';

import {
    requireRCPHPIdentifiers,
    type StellarTestnetConfig,
} from '../../../../shared/stellar-config.ts';
import { FinancialErrorException, newCorrelationId } from '../errors.ts';
import { safeLog } from '../redaction.ts';

import type { GuardedHorizonClient } from './horizon.ts';
import {
    type BuildResult,
    type FinancialIntentRecord,
    type OperationProtocol,
    PILOT_WALLET_NETWORK,
    type SigningPackage,
    type StrategyContext,
    type SubmissionAcceptance,
    type TransactionAttemptRecord,
    type TransactionProtocol,
    type VerifyContext,
} from './protocol.ts';
import type { InstitutionalSignerRegistry } from './signers.ts';
import { assertSponsorSeparation } from './sponsorship.ts';
import {
    innerTransactionOf,
    parseTransactionEnvelope,
    transactionHashHex,
} from './xdr.ts';

/** The idempotency scope and operation type for cash-program activation. */
export const CASH_ACTIVATION_SCOPE = 'program_activation' as const;

/** One `RCPHP` unit is 10,000,000 stroops. */
const STROOPS_PER_UNIT = 10_000_000n;

/** Default transaction validity window, in seconds, for the built payment. */
const DEFAULT_VALIDITY_SECONDS = 180;

// ---------------------------------------------------------------------------
// Pure amount + hashing helpers.
// ---------------------------------------------------------------------------

/**
 * Converts a Horizon decimal balance/amount string (e.g. `"1000.5000000"`) to
 * integer stroops. Parsing is exact (no floating point): the fractional part is
 * padded/truncated to seven digits. A malformed value yields `0n`, which fails
 * closed as "insufficient" rather than admitting an unverifiable balance.
 */
export const amountToStroops = (decimal: string): bigint => {
  const trimmed = decimal.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return 0n;
  }
  const [whole, fraction = ''] = trimmed.split('.');
  const fractionStroops = `${fraction}0000000`.slice(0, 7);
  return BigInt(whole) * STROOPS_PER_UNIT + BigInt(fractionStroops);
};

/** Formats integer stroops as a 7-decimal `RCPHP` amount string for an operation. */
export const stroopsToAmount = (stroops: number | bigint): string => {
  const value = BigInt(stroops);
  const whole = value / STROOPS_PER_UNIT;
  const fraction = value % STROOPS_PER_UNIT;
  return `${whole}.${fraction.toString().padStart(7, '0')}`;
};

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

/** The immutable business identity of an activation request. */
export interface ActivationPayload {
  readonly organizationId: string;
  readonly programId: string;
  readonly sourceTreasury: string;
  readonly destinationTreasury: string;
  readonly assetCode: string;
  readonly assetIssuer: string;
  readonly budgetStroops: number;
  readonly networkPassphrase: string;
}

/**
 * Deterministic canonical payload hash for an activation request (64 lowercase
 * hex). It binds the organization, program, both treasury accounts, the asset,
 * the exact budget, and the network — but NOT the transaction sequence — so a
 * retry under the same business idempotency key hashes identically and reuses
 * the one intent instead of reserving twice.
 */
export const computeActivationPayloadHash = async (
  payload: ActivationPayload,
): Promise<string> => {
  const canonical = [
    'program_activation',
    'v1',
    payload.organizationId,
    payload.programId,
    payload.sourceTreasury,
    payload.destinationTreasury,
    payload.assetCode,
    payload.assetIssuer,
    payload.budgetStroops.toString(),
    payload.networkPassphrase,
  ].join('|');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return toHex(digest);
};

/** A single balance line as reported by Horizon (only the fields we read). */
export interface HorizonBalanceLine {
  readonly asset_type: string;
  readonly asset_code?: string;
  readonly asset_issuer?: string;
  readonly balance: string;
}

/**
 * Returns the treasury's confirmed `RCPHP` balance in stroops. A missing
 * trustline (asset absent from the balance set) is `0n`, which fails closed as
 * insufficient rather than assuming an unverified balance.
 */
export const readRcphpBalanceStroops = (
  balances: readonly HorizonBalanceLine[],
  assetCode: string,
  assetIssuer: string,
): bigint => {
  for (const line of balances) {
    if (
      (line.asset_type === 'credit_alphanum4' || line.asset_type === 'credit_alphanum12') &&
      line.asset_code === assetCode &&
      line.asset_issuer === assetIssuer
    ) {
      return amountToStroops(line.balance);
    }
  }
  return 0n;
};

/** Verifies that `transaction` carries a valid signature by `publicKey`. */
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

const assertPositiveBudget = (budgetStroops: number, correlationId: string): void => {
  if (!Number.isInteger(budgetStroops) || budgetStroops <= 0) {
    throw FinancialErrorException.of(
      'validation_failed',
      'The program budget to reserve must be a positive integer number of stroops.',
      { correlationId, fieldErrors: { budgetStroops: ['must be a positive integer'] } },
    );
  }
};

/**
 * Asserts a signed transaction is EXACTLY the reservation the intent describes:
 * a single `RCPHP` payment of the full budget from the organization treasury to
 * the dedicated cash-program treasury. Any deviation (extra operations, wrong
 * destination, wrong asset, wrong amount) is rejected before submission.
 */
const assertReservationMatchesIntent = (
  transaction: Transaction,
  intent: FinancialIntentRecord,
  expected: { readonly destination: string; readonly assetCode: string; readonly assetIssuer: string },
  correlationId: string,
): void => {
  const reject = (detail: string): never => {
    throw FinancialErrorException.of('validation_failed', detail, { correlationId });
  };

  if (transaction.operations.length !== 1) {
    reject('The activation transaction must contain exactly one reservation payment.');
  }
  const operation = transaction.operations[0];
  if (operation.type !== 'payment') {
    reject('The activation transaction must be a single asset payment.');
  }
  const payment = operation as Extract<typeof operation, { type: 'payment' }>;
  if (payment.destination !== expected.destination) {
    reject('The reservation must pay the dedicated cash-program treasury.');
  }
  const asset = payment.asset;
  if (asset.isNative() || asset.getCode() !== expected.assetCode || asset.getIssuer() !== expected.assetIssuer) {
    reject('The reservation must move the configured RCPHP asset, not native XLM.');
  }
  const paidStroops = amountToStroops(payment.amount);
  if (intent.amount_stroops === null || paidStroops !== BigInt(intent.amount_stroops)) {
    reject('The reservation amount must equal the full approved budget.');
  }
};

// ---------------------------------------------------------------------------
// OperationProtocol strategy.
// ---------------------------------------------------------------------------

export interface CashActivationStrategyDependencies {
  readonly horizon: GuardedHorizonClient;
  /** Transaction validity window in seconds; defaults to 180. */
  readonly validitySeconds?: number;
}

/**
 * Builds the cash-activation {@link OperationProtocol} strategy. `build`
 * constructs the exact reservation payment (re-verifying the treasury balance as
 * defense in depth), and `verifyAndAssemble` verifies the returned institutional
 * signature against the exact prepared transaction, then wraps it in a
 * sponsor-signed fee-bump for submission through the guarded Horizon client.
 */
export const createCashActivationStrategy = (
  deps: CashActivationStrategyDependencies,
): OperationProtocol => {
  const validitySeconds = deps.validitySeconds ?? DEFAULT_VALIDITY_SECONDS;

  const resolveAccounts = (context: StrategyContext) => {
    const rcphp = requireRCPHPIdentifiers(context.config);
    return {
      rcphp,
      source: context.signers.publicKeyOf('organization_treasury'),
      destination: context.signers.publicKeyOf('cash_program_treasury'),
    };
  };

  const build = async (context: StrategyContext): Promise<BuildResult> => {
    const { intent, config, correlationId } = context;
    const { rcphp, source, destination } = resolveAccounts(context);

    if (intent.amount_stroops === null) {
      throw FinancialErrorException.of(
        'validation_failed',
        'The activation intent is missing the budget to reserve.',
        { correlationId },
      );
    }
    assertPositiveBudget(intent.amount_stroops, correlationId);

    // Defense in depth: re-read the treasury balance while building. `prepare`
    // already gated on it, but a concurrent spend must not let a reservation be
    // built against funds that are no longer there.
    const account = await deps.horizon.loadAccount(source);
    const available = readRcphpBalanceStroops(
      account.balances as unknown as HorizonBalanceLine[],
      rcphp.code,
      rcphp.issuer,
    );
    if (available < BigInt(intent.amount_stroops)) {
      throw FinancialErrorException.of(
        'insufficient_budget',
        'The organization treasury no longer holds the full approved budget.',
        { correlationId },
      );
    }

    const transaction = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: config.networkPassphrase,
    })
      .addOperation(
        Operation.payment({
          destination,
          asset: new Asset(rcphp.code, rcphp.issuer),
          amount: stroopsToAmount(intent.amount_stroops),
          source,
        }),
      )
      .setTimeout(validitySeconds)
      .build();

    const envelopeXdr = transaction.toXDR();
    const preparedPayloadHash = transactionHashHex(transaction);

    const signingPackage: SigningPackage = {
      kind: 'classic_envelope',
      unsignedEnvelopeXdr: envelopeXdr,
      transactionHash: preparedPayloadHash,
      networkPassphrase: config.networkPassphrase,
    };

    return {
      network: PILOT_WALLET_NETWORK,
      envelopeXdr,
      preparedPayloadHash,
      minLedger: null,
      maxLedger: null,
      signingPackage,
      authorizationPayload: {
        source,
        destination,
        asset_code: rcphp.code,
        asset_issuer: rcphp.issuer,
        amount_stroops: intent.amount_stroops,
      },
    };
  };

  const verifyAndAssemble = async (context: VerifyContext) => {
    const { intent, config, correlationId, parsedBuiltEnvelope, signed } = context;
    const { rcphp, source, destination } = resolveAccounts(context);

    if (signed.kind !== 'classic_envelope') {
      throw FinancialErrorException.of(
        'validation_failed',
        'Cash-program activation expects a signed classic transaction.',
        { correlationId },
      );
    }

    // Parse the returned institutional signature bound to the configured
    // testnet; a fee-bump here would mean the client tried to supply fees.
    const parsedSigned = parseTransactionEnvelope(signed.signedEnvelopeXdr, config.networkPassphrase);
    if (parsedSigned.isFeeBump) {
      throw FinancialErrorException.of(
        'validation_failed',
        'The institutional signature must sign the inner reservation, not a fee-bump.',
        { correlationId },
      );
    }
    const signedTransaction = parsedSigned.transaction as Transaction;
    const builtInner = innerTransactionOf(parsedBuiltEnvelope.transaction);

    // The signature must be over the EXACT prepared transaction. Comparing the
    // transaction hash binds every operation and the sequence in one check.
    if (transactionHashHex(signedTransaction) !== transactionHashHex(builtInner)) {
      throw FinancialErrorException.of(
        'validation_failed',
        'The signed transaction does not match the prepared reservation.',
        { correlationId },
      );
    }

    // Re-verify the reservation fields against the immutable intent.
    assertReservationMatchesIntent(
      signedTransaction,
      intent,
      { destination, assetCode: rcphp.code, assetIssuer: rcphp.issuer },
      correlationId,
    );

    // The organization treasury authorization MUST be present and valid.
    if (!verifyTransactionSignedBy(signedTransaction, source)) {
      throw FinancialErrorException.of(
        'authorization_failed',
        'The reservation is missing a valid organization-treasury signature.',
        { correlationId },
      );
    }

    // The sponsor pays fees only and must be a distinct account; it can never
    // substitute for the treasury authorization verified above.
    const sponsor = context.signers.get('sponsor');
    const sponsorPublicKey = sponsor.publicKey();
    assertSponsorSeparation(
      { sponsor: sponsorPublicKey, organizationTreasury: source, issuer: rcphp.issuer },
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
      submit: async (): Promise<SubmissionAcceptance> => {
        try {
          const response = await deps.horizon.submitTransaction(feeBump);
          const accepted = response as unknown as { hash?: string };
          return {
            transactionHash: accepted.hash ?? transactionHash,
            resultCode: 'txSUCCESS',
          };
        } catch (error: any) {
          if (error.response && (error.response.status === 400 || error.response.status === 504)) {
            return {
              transactionHash,
              resultCode: 'txFAILED',
            };
          }
          throw error;
        }
      },
    };
  };

  return Object.freeze({
    operationType: CASH_ACTIVATION_SCOPE,
    build,
    verifyAndAssemble,
  });
};

// ---------------------------------------------------------------------------
// Prepare / submit orchestration.
// ---------------------------------------------------------------------------

/**
 * Records the program's in-flight funding state. Activation confirmation and the
 * `funded`/policy-freeze transition are reconciliation-owned (Task 6.4 / 10.4);
 * this port only advances the program to `reserving`, which is still INACTIVE.
 * It is optional so the orchestration is usable (and unit-testable) without a
 * program store.
 */
export interface ProgramFundingPort {
  markReserving(params: {
    readonly programId: string;
    readonly organizationId: string;
    readonly correlationId: string;
  }): Promise<void>;
}

/** Signs the unsigned reservation with the isolated organization-treasury signer. */
export type InstitutionalReservationSigner = (unsignedEnvelopeXdr: string) => string;

export interface CashProgramActivationDependencies {
  readonly protocol: TransactionProtocol;
  readonly strategy: OperationProtocol;
  readonly horizon: GuardedHorizonClient;
  readonly config: StellarTestnetConfig;
  readonly signers: InstitutionalSignerRegistry;
  /** Optional; advances the program to the in-flight `reserving` state. */
  readonly funding?: ProgramFundingPort;
  /**
   * Optional override for producing the institutional signature. Defaults to the
   * isolated `organization_treasury` signer (the orchestrated remote signer).
   */
  readonly signReservation?: InstitutionalReservationSigner;
}

export interface CashProgramActivationRequest {
  readonly organizationId: string;
  readonly programId: string;
  /** The full approved budget to reserve, in integer stroops. */
  readonly budgetStroops: number;
  /** Deterministic business idempotency key, e.g. `program-activation:<programId>`. */
  readonly idempotencyKey: string;
  readonly requestedBy?: string | null;
  readonly correlationId?: string;
}

export interface CashProgramActivationPrepared {
  readonly isReplay: boolean;
  readonly intent: FinancialIntentRecord;
  /** The built attempt, or `null` on a replay (reconcile the prior one instead). */
  readonly attempt: TransactionAttemptRecord | null;
  /** ONLY the client-signable package; `null` on a replay. */
  readonly signingPackage: SigningPackage | null;
}

export interface CashProgramActivationSubmitRequest {
  readonly intent: FinancialIntentRecord;
  readonly attempt: TransactionAttemptRecord;
}

/**
 * Builds the cash-program activation orchestrator. It wraps the reusable
 * transaction protocol with the activation-specific treasury balance gate and
 * institutional-signing step, and exposes `prepare` and `submit`.
 */
export const createCashProgramActivation = (deps: CashProgramActivationDependencies) => {
  const defaultSignReservation: InstitutionalReservationSigner = (unsignedEnvelopeXdr) => {
    const parsed = parseTransactionEnvelope(unsignedEnvelopeXdr, deps.config.networkPassphrase);
    deps.signers.get('organization_treasury').signTransaction(parsed.transaction);
    return parsed.transaction.toXDR();
  };
  const signReservation = deps.signReservation ?? defaultSignReservation;

  /**
   * Verifies the treasury balance and, only when it holds the full budget,
   * persists the immutable financial intent and builds the reservation. An
   * insufficient treasury throws a typed `insufficient_budget` error BEFORE any
   * intent is persisted, so nothing is reserved.
   */
  const prepare = async (
    request: CashProgramActivationRequest,
  ): Promise<CashProgramActivationPrepared> => {
    const correlationId = request.correlationId ?? newCorrelationId();
    assertPositiveBudget(request.budgetStroops, correlationId);

    const rcphp = requireRCPHPIdentifiers(deps.config);
    const source = deps.signers.publicKeyOf('organization_treasury');
    const destination = deps.signers.publicKeyOf('cash_program_treasury');

    // Verify treasury balance BEFORE reserving. On a shortfall, fail closed with
    // no intent, no attempt, and no on-chain reservation.
    const account = await deps.horizon.loadAccount(source);
    const available = readRcphpBalanceStroops(
      account.balances as unknown as HorizonBalanceLine[],
      rcphp.code,
      rcphp.issuer,
    );
    if (available < BigInt(request.budgetStroops)) {
      safeLog('cash activation refused: insufficient treasury balance', {
        correlationId,
        programId: request.programId,
        organizationId: request.organizationId,
      });
      throw FinancialErrorException.of(
        'insufficient_budget',
        'The organization treasury does not hold the full approved budget. Nothing was reserved.',
        { correlationId },
      );
    }

    const payloadHash = await computeActivationPayloadHash({
      organizationId: request.organizationId,
      programId: request.programId,
      sourceTreasury: source,
      destinationTreasury: destination,
      assetCode: rcphp.code,
      assetIssuer: rcphp.issuer,
      budgetStroops: request.budgetStroops,
      networkPassphrase: deps.config.networkPassphrase,
    });

    const prepared = await deps.protocol.prepare({
      organizationId: request.organizationId,
      programId: request.programId,
      operationType: CASH_ACTIVATION_SCOPE,
      scope: CASH_ACTIVATION_SCOPE,
      idempotencyKey: request.idempotencyKey,
      payloadHash,
      amountStroops: request.budgetStroops,
      assetCode: rcphp.code,
      assetIssuer: rcphp.issuer,
      requestedBy: request.requestedBy ?? null,
      correlationId,
    });

    // A replayed idempotency key must never reserve a second time; reconcile the
    // prior intent instead of building another attempt.
    if (prepared.isReplay) {
      return { isReplay: true, intent: prepared.intent, attempt: null, signingPackage: null };
    }

    // Record the in-flight `reserving` state (still inactive). The `funded`
    // transition and policy freeze remain reconciliation-owned.
    if (deps.funding) {
      await deps.funding.markReserving({
        programId: request.programId,
        organizationId: request.organizationId,
        correlationId,
      });
    }

    const built = await deps.protocol.build(prepared.intent, deps.strategy);
    return {
      isReplay: false,
      intent: prepared.intent,
      attempt: built.attempt,
      signingPackage: built.signingPackage,
    };
  };

  /**
   * Signs the built reservation with the isolated organization-treasury signer,
   * then submits through the protocol, which verifies the institutional
   * signature and network binding, adds only the sponsor fee-bump, and marks the
   * attempt `submitted` after network acceptance. Confirmation — and therefore
   * program activation and the policy freeze — remain reconciliation-owned.
   */
  const submit = async (request: CashProgramActivationSubmitRequest) => {
    const { intent, attempt } = request;
    if (attempt.envelope_xdr === null) {
      throw FinancialErrorException.of(
        'validation_failed',
        'This activation attempt has no prepared reservation to submit.',
        { correlationId: attempt.correlation_id },
      );
    }
    const signedEnvelopeXdr = signReservation(attempt.envelope_xdr);
    return deps.protocol.submit(
      { intent, attempt },
      { kind: 'classic_envelope', signedEnvelopeXdr },
      deps.strategy,
    );
  };

  return Object.freeze({ prepare, submit });
};

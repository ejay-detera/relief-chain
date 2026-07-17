// Per-recipient cash disbursement: OperationProtocol strategy + orchestration.
//
// A cash disbursement moves a beneficiary's approved allocation FROM the
// dedicated cash-program treasury (funded during activation, Task 10.1) TO the
// beneficiary's currently-active verified wallet (design "Stellar Account and
// Asset Topology"). It is a classic `RCPHP` payment wrapped by a sponsor-signed
// fee-bump so the beneficiary never needs XLM to RECEIVE aid (Requirement 14.1,
// 14.7). The cash-program treasury is an institutional account, so its
// authorization is produced by the isolated `cash_program_treasury` signer (the
// "orchestrated remote signer"); the beneficiary does not sign to receive.
//
// This module is the {@link RecipientProcessor} that Task 10.2's
// {@link runDistributionExecution} consumes: it composes the Task 6.1 security
// utilities and the Task 6.2 guarded clients / isolated institutional signers
// around the Task 6.3 reusable prepare/build/authorize/submit protocol, once per
// recipient, under that recipient's DETERMINISTIC business idempotency key
// (`makeDistributionRecipientKey`). It owns only the disbursement specifics; the
// rail-agnostic invariants (immutable intent, one attempt per business key,
// `submitted`-not-`confirmed`, reconcile-before-retry) stay in
// {@link createTransactionProtocol}.
//
// The disbursement rules this module enforces (Requirements 6.1, 6.2, 6.3, 8.4,
// 8.5, 14.1):
//
//   - TRANSFER ONLY `RCPHP`. The built transaction is a single payment of the
//     configured PHP-denominated asset; native XLM is never substituted
//     (Requirement 6.1). `verifyAndAssemble` re-asserts this before submission.
//   - PAY ONLY THE VERIFIED ACTIVE WALLET. The destination address is bound into
//     the immutable intent (via `request_metadata`) and the deterministic
//     payload hash, and is re-checked against the built and signed transaction.
//     Task 10.2 has already validated it is the current verified beneficiary
//     wallet (Requirement 6.2).
//   - BIND CORRELATION + A DETERMINISTIC KEY. Every transfer references its
//     organization, program, distribution job, and recipient, and claims the
//     per-recipient key so a retry can never create a second payment
//     (Requirements 6.3, 8.4, 8.5).
//   - FEE-BUMP SPONSORSHIP. The isolated `cash_program_treasury` signature
//     authorizes the payment; the isolated `sponsor` signer then wraps it in a
//     fee-bump that pays fees only and can never substitute for that
//     authorization (Requirement 14.1).
//   - NEVER CONFIRM HERE. `submit` only ever marks the attempt `submitted`;
//     finality and the recipient `confirmed` transition are reconciliation-owned
//     (Task 6.4 / 10.4).
//
// Configuration and all I/O are injected, so the module reads no Deno globals
// and stays inside the project-wide type check and the transpile-inject unit
// test harness. Deno.serve entrypoints live in the per-function index.ts files.
//
// Validates: Requirements 6.1, 6.2, 6.3, 8.4, 8.5, 14.1

import {
    Asset,
    BASE_FEE,
    Operation,
    type Transaction,
    TransactionBuilder,
} from '@stellar/stellar-sdk';

import {
    requireRCPHPIdentifiers,
    type StellarTestnetConfig,
} from '../../../../shared/stellar-config.ts';
import { FinancialErrorException, newCorrelationId } from '../errors.ts';

import {
    amountToStroops,
    type HorizonBalanceLine,
    readRcphpBalanceStroops,
    stroopsToAmount,
    verifyTransactionSignedBy,
} from './cash-activation.ts';
import type { RecipientOutcome, RecipientProcessor, RecipientWork } from './distribution.ts';
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

/** The idempotency scope and operation type for a per-recipient cash disbursement. */
export const CASH_DISBURSEMENT_SCOPE = 'cash_distribution' as const;

/** Default transaction validity window, in seconds, for the built payment. */
const DEFAULT_VALIDITY_SECONDS = 180;

/** A funded Stellar public account ID (`G...`). */
const STELLAR_ACCOUNT_PATTERN = /^G[A-Z2-7]{55}$/;

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const assertPositiveAmount = (amountStroops: number, correlationId: string): void => {
  if (!Number.isInteger(amountStroops) || amountStroops <= 0) {
    throw FinancialErrorException.of(
      'validation_failed',
      'The disbursement amount must be a positive integer number of stroops.',
      { correlationId, fieldErrors: { amountStroops: ['must be a positive integer'] } },
    );
  }
};

const assertStellarAccount = (
  value: string,
  field: string,
  correlationId: string,
): void => {
  if (!STELLAR_ACCOUNT_PATTERN.test(value)) {
    throw FinancialErrorException.of(
      'validation_failed',
      'The beneficiary destination wallet is not a valid Stellar account.',
      { correlationId, fieldErrors: { [field]: ['must be a Stellar public account ID'] } },
    );
  }
};

/**
 * Reads a required string from an intent's `request_metadata`. The destination
 * beneficiary wallet is persisted there at prepare time so the strategy can
 * reconstruct the exact payment without trusting any client-supplied value at
 * build or submit time.
 */
const readMetadataString = (
  metadata: FinancialIntentRecord['request_metadata'],
  key: string,
  correlationId: string,
): string => {
  if (metadata !== null && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const value = (metadata as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  throw FinancialErrorException.of(
    'validation_failed',
    'The disbursement intent is missing its destination wallet.',
    { correlationId },
  );
};

/** The immutable business identity of a per-recipient disbursement request. */
export interface DisbursementPayload {
  readonly organizationId: string;
  readonly programId: string;
  readonly distributionJobId: string;
  readonly distributionRecipientId: string;
  readonly beneficiaryIdentityId: string;
  readonly sourceTreasury: string;
  readonly destinationWallet: string;
  readonly assetCode: string;
  readonly assetIssuer: string;
  readonly amountStroops: number;
  readonly networkPassphrase: string;
}

/**
 * Deterministic canonical payload hash for a disbursement request (64 lowercase
 * hex). It binds the organization, program, job, recipient, beneficiary, the
 * cash-program treasury source, the exact destination wallet, the asset, the
 * amount, and the network — but NOT the transaction sequence — so a retry under
 * the same per-recipient idempotency key hashes identically and reuses the one
 * intent instead of paying twice.
 */
export const computeDisbursementPayloadHash = async (
  payload: DisbursementPayload,
): Promise<string> => {
  const canonical = [
    'cash_distribution',
    'v1',
    payload.organizationId,
    payload.programId,
    payload.distributionJobId,
    payload.distributionRecipientId,
    payload.beneficiaryIdentityId,
    payload.sourceTreasury,
    payload.destinationWallet,
    payload.assetCode,
    payload.assetIssuer,
    payload.amountStroops.toString(),
    payload.networkPassphrase,
  ].join('|');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return toHex(digest);
};

/**
 * Asserts a signed transaction is EXACTLY the disbursement the intent describes:
 * a single `RCPHP` payment of the full allocation from the cash-program treasury
 * to the verified beneficiary wallet. Any deviation (extra operations, wrong
 * destination, wrong asset, native XLM, wrong amount) is rejected before
 * submission.
 */
const assertDisbursementMatchesIntent = (
  transaction: Transaction,
  intent: FinancialIntentRecord,
  expected: {
    readonly source: string;
    readonly destination: string;
    readonly assetCode: string;
    readonly assetIssuer: string;
  },
  correlationId: string,
): void => {
  const reject = (detail: string): never => {
    throw FinancialErrorException.of('validation_failed', detail, { correlationId });
  };

  if (transaction.operations.length !== 1) {
    reject('The disbursement transaction must contain exactly one payment.');
  }
  const operation = transaction.operations[0];
  if (operation.type !== 'payment') {
    reject('The disbursement transaction must be a single asset payment.');
  }
  const payment = operation as Extract<typeof operation, { type: 'payment' }>;
  if ((payment.source ?? transaction.source) !== expected.source) {
    reject('The disbursement must be paid by the cash-program treasury.');
  }
  if (payment.destination !== expected.destination) {
    reject('The disbursement must pay the verified beneficiary wallet.');
  }
  const asset = payment.asset;
  if (asset.isNative() || asset.getCode() !== expected.assetCode || asset.getIssuer() !== expected.assetIssuer) {
    reject('The disbursement must move the configured RCPHP asset, not native XLM.');
  }
  const paidStroops = amountToStroops(payment.amount);
  if (intent.amount_stroops === null || paidStroops !== BigInt(intent.amount_stroops)) {
    reject('The disbursement amount must equal the approved allocation.');
  }
};

// ---------------------------------------------------------------------------
// OperationProtocol strategy.
// ---------------------------------------------------------------------------

export interface CashDisbursementStrategyDependencies {
  readonly horizon: GuardedHorizonClient;
  /** Transaction validity window in seconds; defaults to 180. */
  readonly validitySeconds?: number;
}

/**
 * Builds the cash-disbursement {@link OperationProtocol} strategy. `build`
 * constructs the exact `RCPHP` payment from the cash-program treasury to the
 * beneficiary wallet (re-verifying the treasury balance as defense in depth),
 * and `verifyAndAssemble` verifies the institutional treasury signature against
 * the exact prepared transaction, then wraps it in a sponsor-signed fee-bump for
 * submission through the guarded Horizon client.
 */
export const createCashDisbursementStrategy = (
  deps: CashDisbursementStrategyDependencies,
): OperationProtocol => {
  const validitySeconds = deps.validitySeconds ?? DEFAULT_VALIDITY_SECONDS;

  const resolveAccounts = (context: StrategyContext) => {
    const rcphp = requireRCPHPIdentifiers(context.config);
    return {
      rcphp,
      source: context.signers.publicKeyOf('cash_program_treasury'),
      destination: readMetadataString(
        context.intent.request_metadata,
        'destination_address',
        context.correlationId,
      ),
    };
  };

  const build = async (context: StrategyContext): Promise<BuildResult> => {
    const { intent, config, correlationId } = context;
    const { rcphp, source, destination } = resolveAccounts(context);

    if (intent.amount_stroops === null) {
      throw FinancialErrorException.of(
        'validation_failed',
        'The disbursement intent is missing the allocation amount.',
        { correlationId },
      );
    }
    assertPositiveAmount(intent.amount_stroops, correlationId);
    assertStellarAccount(destination, 'destination_address', correlationId);

    // Defense in depth: re-read the cash-program treasury balance while building
    // so a payment is never built against funds that have already been drawn
    // down by concurrent recipients.
    const account = await deps.horizon.loadAccount(source);
    const available = readRcphpBalanceStroops(
      account.balances as unknown as HorizonBalanceLine[],
      rcphp.code,
      rcphp.issuer,
    );
    if (available < BigInt(intent.amount_stroops)) {
      throw FinancialErrorException.of(
        'insufficient_budget',
        'The cash-program treasury no longer holds enough RCPHP for this disbursement.',
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
        'Cash disbursement expects a signed classic transaction.',
        { correlationId },
      );
    }

    // Parse the returned institutional signature bound to the configured
    // testnet; a fee-bump here would mean fees were supplied prematurely.
    const parsedSigned = parseTransactionEnvelope(signed.signedEnvelopeXdr, config.networkPassphrase);
    if (parsedSigned.isFeeBump) {
      throw FinancialErrorException.of(
        'validation_failed',
        'The treasury signature must sign the inner disbursement, not a fee-bump.',
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
        'The signed transaction does not match the prepared disbursement.',
        { correlationId },
      );
    }

    // Re-verify the disbursement fields against the immutable intent.
    assertDisbursementMatchesIntent(
      signedTransaction,
      intent,
      { source, destination, assetCode: rcphp.code, assetIssuer: rcphp.issuer },
      correlationId,
    );

    // The cash-program treasury authorization MUST be present and valid.
    if (!verifyTransactionSignedBy(signedTransaction, source)) {
      throw FinancialErrorException.of(
        'authorization_failed',
        'The disbursement is missing a valid cash-program treasury signature.',
        { correlationId },
      );
    }

    // The sponsor pays fees only and must be distinct from every aid-holding
    // account; it can never substitute for the treasury authorization above.
    const sponsor = context.signers.get('sponsor');
    const sponsorPublicKey = sponsor.publicKey();
    assertSponsorSeparation(
      {
        sponsor: sponsorPublicKey,
        organizationTreasury: source,
        beneficiary: destination,
        issuer: rcphp.issuer,
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
    operationType: CASH_DISBURSEMENT_SCOPE,
    build,
    verifyAndAssemble,
  });
};

// ---------------------------------------------------------------------------
// Prepare / submit orchestration.
// ---------------------------------------------------------------------------

/** Signs the unsigned disbursement with the isolated cash-program-treasury signer. */
export type InstitutionalDisbursementSigner = (unsignedEnvelopeXdr: string) => string;

export interface CashDisbursementDependencies {
  readonly protocol: TransactionProtocol;
  readonly strategy: OperationProtocol;
  readonly config: StellarTestnetConfig;
  readonly signers: InstitutionalSignerRegistry;
  /**
   * Optional override for producing the institutional signature. Defaults to the
   * isolated `cash_program_treasury` signer (the orchestrated remote signer).
   */
  readonly signDisbursement?: InstitutionalDisbursementSigner;
}

export interface CashDisbursementRequest {
  readonly organizationId: string;
  readonly programId: string;
  readonly distributionJobId: string;
  readonly distributionRecipientId: string;
  readonly beneficiaryIdentityId: string;
  /** The verified, currently-active beneficiary wallet address (`G...`). */
  readonly destinationWallet: string;
  /** The approved allocation to transfer, in integer stroops. */
  readonly amountStroops: number;
  /** Deterministic per-recipient business idempotency key (Task 10.2). */
  readonly idempotencyKey: string;
  readonly requestedBy?: string | null;
  readonly correlationId?: string;
}

export interface CashDisbursementPrepared {
  readonly isReplay: boolean;
  readonly intent: FinancialIntentRecord;
  /** The built attempt, or `null` on a replay (reconcile the prior one instead). */
  readonly attempt: TransactionAttemptRecord | null;
  /** The signing package for institutional signing; `null` on a replay. */
  readonly signingPackage: SigningPackage | null;
}

export interface CashDisbursementSubmitRequest {
  readonly intent: FinancialIntentRecord;
  readonly attempt: TransactionAttemptRecord;
}

/** Context for driving a distribution job's per-recipient disbursements. */
export interface RecipientProcessorContext {
  readonly organizationId: string;
  readonly programId: string;
  readonly distributionJobId: string;
  /**
   * Resolves the verified, currently-active beneficiary wallet ADDRESS for a
   * unit of recipient work. Task 10.2 has already validated the wallet; this
   * turns its `destinationWalletId` into the payable `G...` address.
   */
  readonly resolveDestinationAddress: (work: RecipientWork) => Promise<string>;
  readonly correlationId?: string;
}

/**
 * Builds the cash-disbursement orchestrator. It wraps the reusable transaction
 * protocol with the disbursement-specific destination binding and institutional
 * signing step, and exposes `prepare`, `submit`, and a `createRecipientProcessor`
 * factory that produces the {@link RecipientProcessor} Task 10.2's
 * {@link runDistributionExecution} consumes.
 */
export const createCashDisbursement = (deps: CashDisbursementDependencies) => {
  const defaultSignDisbursement: InstitutionalDisbursementSigner = (unsignedEnvelopeXdr) => {
    const parsed = parseTransactionEnvelope(unsignedEnvelopeXdr, deps.config.networkPassphrase);
    deps.signers.get('cash_program_treasury').signTransaction(parsed.transaction);
    return parsed.transaction.toXDR();
  };
  const signDisbursement = deps.signDisbursement ?? defaultSignDisbursement;

  /**
   * Persists the immutable financial intent (binding org/program/job/recipient
   * correlation and the destination wallet) and builds the exact disbursement.
   * A replayed per-recipient key never builds a second attempt; the prior intent
   * is returned for reconciliation instead.
   */
  const prepare = async (
    request: CashDisbursementRequest,
  ): Promise<CashDisbursementPrepared> => {
    const correlationId = request.correlationId ?? newCorrelationId();
    assertPositiveAmount(request.amountStroops, correlationId);
    assertStellarAccount(request.destinationWallet, 'destinationWallet', correlationId);

    const rcphp = requireRCPHPIdentifiers(deps.config);
    const source = deps.signers.publicKeyOf('cash_program_treasury');

    const payloadHash = await computeDisbursementPayloadHash({
      organizationId: request.organizationId,
      programId: request.programId,
      distributionJobId: request.distributionJobId,
      distributionRecipientId: request.distributionRecipientId,
      beneficiaryIdentityId: request.beneficiaryIdentityId,
      sourceTreasury: source,
      destinationWallet: request.destinationWallet,
      assetCode: rcphp.code,
      assetIssuer: rcphp.issuer,
      amountStroops: request.amountStroops,
      networkPassphrase: deps.config.networkPassphrase,
    });

    const prepared = await deps.protocol.prepare({
      organizationId: request.organizationId,
      programId: request.programId,
      operationType: CASH_DISBURSEMENT_SCOPE,
      scope: CASH_DISBURSEMENT_SCOPE,
      idempotencyKey: request.idempotencyKey,
      payloadHash,
      amountStroops: request.amountStroops,
      assetCode: rcphp.code,
      assetIssuer: rcphp.issuer,
      beneficiaryIdentityId: request.beneficiaryIdentityId,
      distributionJobId: request.distributionJobId,
      distributionRecipientId: request.distributionRecipientId,
      requestedBy: request.requestedBy ?? null,
      correlationId,
      requestMetadata: { destination_address: request.destinationWallet },
    });

    // A replayed idempotency key must never pay a second time; reconcile the
    // prior intent instead of building another attempt.
    if (prepared.isReplay) {
      return { isReplay: true, intent: prepared.intent, attempt: null, signingPackage: null };
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
   * Signs the built disbursement with the isolated cash-program-treasury signer,
   * then submits through the protocol, which verifies the institutional
   * signature and network binding, adds only the sponsor fee-bump, and marks the
   * attempt `submitted` after network acceptance. Confirmation stays
   * reconciliation-owned.
   */
  const submit = async (request: CashDisbursementSubmitRequest) => {
    const { intent, attempt } = request;
    if (attempt.envelope_xdr === null) {
      throw FinancialErrorException.of(
        'validation_failed',
        'This disbursement attempt has no prepared payment to submit.',
        { correlationId: attempt.correlation_id },
      );
    }
    const signedEnvelopeXdr = signDisbursement(attempt.envelope_xdr);
    return deps.protocol.submit(
      { intent, attempt },
      { kind: 'classic_envelope', signedEnvelopeXdr },
      deps.strategy,
    );
  };

  /**
   * Produces the {@link RecipientProcessor} the distribution engine drives once
   * per recipient. It resolves the beneficiary destination address, prepares and
   * submits the disbursement under the recipient's deterministic key, and
   * reports a `submitted` outcome (never `confirmed`). A replayed key — an
   * already in-flight or prior attempt — is surfaced as a retryable failure so a
   * later resume pass reconciles it rather than paying twice; the work queue
   * isolates it so one recipient never blocks the batch.
   */
  const createRecipientProcessor = (context: RecipientProcessorContext): RecipientProcessor => {
    return async (work: RecipientWork): Promise<RecipientOutcome> => {
      const destinationWallet = await context.resolveDestinationAddress(work);
      const prepared = await prepare({
        organizationId: context.organizationId,
        programId: context.programId,
        distributionJobId: context.distributionJobId,
        distributionRecipientId: work.recipientId,
        beneficiaryIdentityId: work.beneficiaryIdentityId,
        destinationWallet,
        amountStroops: work.amountStroops,
        idempotencyKey: work.idempotencyKey,
        correlationId: context.correlationId,
      });

      if (prepared.isReplay || prepared.attempt === null) {
        // The transfer was already prepared/submitted under this key. Do NOT
        // build or submit a second attempt; a resume pass reconciles the prior
        // one (Task 10.4). Surfacing it as an unknown/retryable failure keeps
        // the recipient eligible for that later reconciliation.
        return {
          kind: 'failed',
          failureCode: 'submission_unknown',
          failureReason:
            'A prior attempt for this recipient must be reconciled before it can be retried.',
        };
      }

      const result = await submit({ intent: prepared.intent, attempt: prepared.attempt });
      return { kind: 'submitted', transactionHash: result.transactionHash };
    };
  };

  return Object.freeze({ prepare, submit, createRecipientProcessor });
};

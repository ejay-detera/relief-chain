// Beneficiary-initiated merchant payment (cash rail): OperationProtocol strategy
// + prepare/submit orchestration.
//
// A merchant payment moves `RCPHP` FROM the beneficiary's own wallet TO the
// verified merchant SETTLEMENT wallet for a signed cash invoice (design "Stellar
// Account and Asset Topology"; Requirement 12.2). Unlike a disbursement, the
// value leaves the BENEFICIARY's account, so this is a BENEFICIARY-INITIATED
// payment: the beneficiary wallet MUST authorize the exact transaction
// (Requirements 3.6, 6.6, 11.6). The prepare step returns ONLY the exact
// unsigned transaction as the beneficiary's signing package; the client signs it
// locally and returns it, and the isolated `sponsor` signer then wraps the
// beneficiary-signed transaction in a fee-bump that pays fees ONLY — it can never
// supply or substitute for the beneficiary's signature (Requirement 14.1, design
// Property 3). The beneficiary therefore needs no XLM to spend cash aid.
//
// This module composes the Task 6.1 security utilities and the Task 6.2 guarded
// clients / isolated signers around the Task 6.3 reusable prepare/build/
// authorize/submit protocol. It owns only the merchant-payment specifics; the
// rail-agnostic invariants (immutable intent, one attempt per business key,
// `submitted`-not-`confirmed`, reconcile-before-retry) stay in
// {@link createTransactionProtocol}.
//
// The payment rules this module enforces (Requirements 6.1, 6.6, 11.6, 12.2,
// 14.1):
//
//   - TRANSFER ONLY `RCPHP`. The built transaction is a single payment of the
//     configured PHP-denominated asset; native XLM is never substituted
//     (Requirement 6.1). `verifyAndAssemble` re-asserts this before submission.
//   - PAY ONLY THE VERIFIED MERCHANT SETTLEMENT WALLET. The destination is bound
//     into the immutable intent and the deterministic payload hash and re-checked
//     against the built and signed transaction (Requirement 12.2). The caller has
//     already verified the merchant accreditation and settlement wallet.
//   - REQUIRE THE BENEFICIARY SIGNATURE. `verifyAndAssemble` verifies a valid
//     beneficiary-wallet signature over the EXACT prepared transaction and
//     rejects anything else. The sponsor fee-bump is added only AFTER that check
//     and never in its place (Requirements 6.6, 11.6, 14.1).
//   - BIND A DETERMINISTIC KEY TO THE INVOICE. The idempotency key derives from
//     the one-time invoice id (which embeds the invoice nonce), so re-presenting
//     the same invoice can never produce a second payment (design Property 2).
//   - NEVER CONFIRM HERE. `submit` only ever marks the attempt `submitted`;
//     finality is reconciliation-owned (Task 6.4 / 10.4).
//
// Configuration and all I/O are injected, so the module reads no Deno globals
// and stays inside the project-wide type check and the transpile-inject unit
// test harness. Deno.serve entrypoints live in the per-function index.ts files.
//
// Validates: Requirements 6.1, 6.6, 11.6, 12.2, 14.1

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
import type { GuardedHorizonClient } from './horizon.ts';
import {
    type BuildResult,
    type FinancialIntentRecord,
    type OperationProtocol,
    PILOT_WALLET_NETWORK,
    type SignedSubmission,
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

/** The idempotency scope and operation type for a beneficiary cash payment. */
export const MERCHANT_PAYMENT_SCOPE = 'cash_payment' as const;

/** Default transaction validity window, in seconds, for the built payment. */
const DEFAULT_VALIDITY_SECONDS = 180;

/** A funded Stellar public account ID (`G...`). */
const STELLAR_ACCOUNT_PATTERN = /^G[A-Z2-7]{55}$/;
/** A 32-byte SHA-256 invoice id rendered as 64 lowercase hex characters. */
const HEX_32_BYTES = /^[0-9a-f]{64}$/;

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const assertPositiveAmount = (amountStroops: number, correlationId: string): void => {
  if (!Number.isInteger(amountStroops) || amountStroops <= 0) {
    throw FinancialErrorException.of(
      'validation_failed',
      'The payment amount must be a positive integer number of stroops.',
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
      'A payment wallet is not a valid Stellar account.',
      { correlationId, fieldErrors: { [field]: ['must be a Stellar public account ID'] } },
    );
  }
};

const assertInvoiceId = (invoiceId: string, correlationId: string): void => {
  if (!HEX_32_BYTES.test(invoiceId)) {
    throw FinancialErrorException.of(
      'validation_failed',
      'The invoice id must be a 32-byte lowercase hex digest.',
      { correlationId, fieldErrors: { invoiceId: ['must be a 64-character lowercase hex hash'] } },
    );
  }
};

/**
 * The deterministic business idempotency key for a cash payment, bound to the
 * one-time invoice id (which embeds the invoice nonce). Re-presenting the same
 * invoice reuses this key and can never produce a second payment.
 */
export const makeMerchantPaymentKey = (invoiceId: string): string =>
  `cash_payment:invoice:${invoiceId}`;

/**
 * Reads a required string from an intent's `request_metadata`. The beneficiary
 * source and merchant settlement wallets are persisted there at prepare time so
 * the strategy can reconstruct the exact payment without trusting any
 * client-supplied value at build or submit time.
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
    'The payment intent is missing a required wallet address.',
    { correlationId },
  );
};

/** The immutable business identity of a merchant-payment request. */
export interface MerchantPaymentPayload {
  readonly organizationId: string;
  /** The program the cash source belongs to, when applicable (unrestricted cash may be null). */
  readonly programId: string | null;
  readonly invoiceId: string;
  readonly beneficiaryIdentityId: string;
  readonly beneficiaryWallet: string;
  readonly merchantSettlementWallet: string;
  readonly assetCode: string;
  readonly assetIssuer: string;
  readonly amountStroops: number;
  readonly networkPassphrase: string;
}

/**
 * Deterministic canonical payload hash for a merchant-payment request (64
 * lowercase hex). It binds the organization, program, invoice, beneficiary and
 * its wallet, the merchant settlement wallet, the asset, the amount, and the
 * network — but NOT the transaction sequence — so a retry under the same
 * invoice-bound key hashes identically and reuses the one intent.
 */
export const computeMerchantPaymentPayloadHash = async (
  payload: MerchantPaymentPayload,
): Promise<string> => {
  const canonical = [
    'cash_payment',
    'v1',
    payload.organizationId,
    payload.programId ?? '',
    payload.invoiceId,
    payload.beneficiaryIdentityId,
    payload.beneficiaryWallet,
    payload.merchantSettlementWallet,
    payload.assetCode,
    payload.assetIssuer,
    payload.amountStroops.toString(),
    payload.networkPassphrase,
  ].join('|');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return toHex(digest);
};

/**
 * Asserts a signed transaction is EXACTLY the payment the intent describes: a
 * single `RCPHP` payment of the full invoice amount from the beneficiary wallet
 * to the verified merchant settlement wallet. Any deviation (extra operations,
 * wrong source, wrong destination, wrong asset, native XLM, wrong amount) is
 * rejected before submission.
 */
const assertPaymentMatchesIntent = (
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
    reject('The payment transaction must contain exactly one payment.');
  }
  const operation = transaction.operations[0];
  if (operation.type !== 'payment') {
    reject('The payment transaction must be a single asset payment.');
  }
  const payment = operation as Extract<typeof operation, { type: 'payment' }>;
  if ((payment.source ?? transaction.source) !== expected.source) {
    reject('The payment must be sent from the beneficiary wallet.');
  }
  if (payment.destination !== expected.destination) {
    reject('The payment must pay the verified merchant settlement wallet.');
  }
  const asset = payment.asset;
  if (asset.isNative() || asset.getCode() !== expected.assetCode || asset.getIssuer() !== expected.assetIssuer) {
    reject('The payment must move the configured RCPHP asset, not native XLM.');
  }
  const paidStroops = amountToStroops(payment.amount);
  if (intent.amount_stroops === null || paidStroops !== BigInt(intent.amount_stroops)) {
    reject('The payment amount must equal the invoiced amount.');
  }
};

// ---------------------------------------------------------------------------
// OperationProtocol strategy.
// ---------------------------------------------------------------------------

export interface MerchantPaymentStrategyDependencies {
  readonly horizon: GuardedHorizonClient;
  /** Transaction validity window in seconds; defaults to 180. */
  readonly validitySeconds?: number;
}

/**
 * Builds the merchant-payment {@link OperationProtocol} strategy. `build`
 * constructs the exact `RCPHP` payment from the beneficiary wallet to the
 * merchant settlement wallet and returns ONLY the beneficiary signing package.
 * `verifyAndAssemble` verifies the beneficiary signature against the exact
 * prepared transaction, then wraps it in a sponsor-signed fee-bump for
 * submission through the guarded Horizon client.
 */
export const createMerchantPaymentStrategy = (
  deps: MerchantPaymentStrategyDependencies,
): OperationProtocol => {
  const validitySeconds = deps.validitySeconds ?? DEFAULT_VALIDITY_SECONDS;

  const resolveAccounts = (context: StrategyContext) => {
    const rcphp = requireRCPHPIdentifiers(context.config);
    return {
      rcphp,
      source: readMetadataString(context.intent.request_metadata, 'source_address', context.correlationId),
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
        'The payment intent is missing the amount to pay.',
        { correlationId },
      );
    }
    assertPositiveAmount(intent.amount_stroops, correlationId);
    assertStellarAccount(source, 'source_address', correlationId);
    assertStellarAccount(destination, 'destination_address', correlationId);

    // Read the beneficiary account for its sequence, and re-verify it holds
    // enough RCPHP as defense in depth (the caller has already validated the
    // funding source and balance).
    const account = await deps.horizon.loadAccount(source);
    const available = readRcphpBalanceStroops(
      account.balances as unknown as HorizonBalanceLine[],
      rcphp.code,
      rcphp.issuer,
    );
    if (available < BigInt(intent.amount_stroops)) {
      throw FinancialErrorException.of(
        'insufficient_balance',
        'The beneficiary wallet does not hold enough RCPHP for this payment.',
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

    // The beneficiary signs this exact transaction; the package carries no
    // institutional material.
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
        'A merchant payment expects a signed classic transaction.',
        { correlationId },
      );
    }

    // Parse the returned beneficiary signature bound to the configured testnet;
    // a fee-bump here would mean the client tried to supply fees.
    const parsedSigned = parseTransactionEnvelope(signed.signedEnvelopeXdr, config.networkPassphrase);
    if (parsedSigned.isFeeBump) {
      throw FinancialErrorException.of(
        'validation_failed',
        'The beneficiary signature must sign the inner payment, not a fee-bump.',
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
        'The signed transaction does not match the prepared payment.',
        { correlationId },
      );
    }

    // Re-verify the payment fields against the immutable intent.
    assertPaymentMatchesIntent(
      signedTransaction,
      intent,
      { source, destination, assetCode: rcphp.code, assetIssuer: rcphp.issuer },
      correlationId,
    );

    // The BENEFICIARY wallet authorization MUST be present and valid. This is a
    // beneficiary-initiated payment; without the beneficiary signature no value
    // moves (Requirements 6.6, 11.6).
    if (!verifyTransactionSignedBy(signedTransaction, source)) {
      throw FinancialErrorException.of(
        'authorization_failed',
        'The payment is missing a valid beneficiary wallet signature.',
        { correlationId },
      );
    }

    // The sponsor pays fees only and must be distinct from every aid-holding
    // account; it can never substitute for the beneficiary authorization above.
    const sponsor = context.signers.get('sponsor');
    const sponsorPublicKey = sponsor.publicKey();
    assertSponsorSeparation(
      {
        sponsor: sponsorPublicKey,
        beneficiary: source,
        merchant: destination,
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
        const response = await deps.horizon.submitTransaction(feeBump);
        const accepted = response as unknown as { hash?: string; successful?: boolean };
        return {
          transactionHash: accepted.hash ?? transactionHash,
          resultCode: accepted.successful === false ? 'txFAILED' : 'txSUCCESS',
        };
      },
    };
  };

  return Object.freeze({
    operationType: MERCHANT_PAYMENT_SCOPE,
    build,
    verifyAndAssemble,
  });
};

// ---------------------------------------------------------------------------
// Prepare / submit orchestration.
// ---------------------------------------------------------------------------

export interface MerchantPaymentDependencies {
  readonly protocol: TransactionProtocol;
  readonly strategy: OperationProtocol;
  readonly config: StellarTestnetConfig;
  readonly signers: InstitutionalSignerRegistry;
}

export interface MerchantPaymentRequest {
  readonly organizationId: string;
  /** The program the cash source belongs to, when applicable. */
  readonly programId?: string | null;
  /** The one-time invoice id (SHA-256 of the canonical unsigned invoice bytes). */
  readonly invoiceId: string;
  readonly beneficiaryIdentityId: string;
  /** The beneficiary's own wallet address (`G...`); the payment source. */
  readonly beneficiaryWallet: string;
  /** The verified merchant settlement wallet address (`G...`). */
  readonly merchantSettlementWallet: string;
  /** The invoiced amount to pay, in integer stroops. */
  readonly amountStroops: number;
  /**
   * Optional explicit business idempotency key; defaults to a deterministic key
   * derived from the invoice id.
   */
  readonly idempotencyKey?: string;
  readonly requestedBy?: string | null;
  readonly correlationId?: string;
}

export interface MerchantPaymentPrepared {
  readonly isReplay: boolean;
  readonly intent: FinancialIntentRecord;
  /** The built attempt, or `null` on a replay (reconcile the prior one instead). */
  readonly attempt: TransactionAttemptRecord | null;
  /** ONLY the beneficiary's client-signable package; `null` on a replay. */
  readonly signingPackage: SigningPackage | null;
}

export interface MerchantPaymentSubmitRequest {
  readonly intent: FinancialIntentRecord;
  readonly attempt: TransactionAttemptRecord;
  /** The beneficiary-signed transaction returned by the client. */
  readonly signed: SignedSubmission;
}

/**
 * Builds the merchant-payment orchestrator. It wraps the reusable transaction
 * protocol with the payment-specific wallet binding and exposes `prepare` (which
 * returns the beneficiary signing package) and `submit` (which passes the
 * beneficiary-signed transaction through to verification and the sponsor
 * fee-bump).
 */
export const createMerchantPayment = (deps: MerchantPaymentDependencies) => {
  /**
   * Validates the request, persists the immutable financial intent (binding the
   * invoice, beneficiary, and merchant settlement wallet), builds the exact
   * payment, and returns ONLY the beneficiary signing package. A replayed
   * invoice-bound key never builds a second attempt; the prior intent is
   * returned for reconciliation instead.
   */
  const prepare = async (request: MerchantPaymentRequest): Promise<MerchantPaymentPrepared> => {
    const correlationId = request.correlationId ?? newCorrelationId();
    assertPositiveAmount(request.amountStroops, correlationId);
    assertInvoiceId(request.invoiceId, correlationId);
    assertStellarAccount(request.beneficiaryWallet, 'beneficiaryWallet', correlationId);
    assertStellarAccount(request.merchantSettlementWallet, 'merchantSettlementWallet', correlationId);

    const rcphp = requireRCPHPIdentifiers(deps.config);
    const programId = request.programId ?? null;
    const idempotencyKey = request.idempotencyKey ?? makeMerchantPaymentKey(request.invoiceId);

    const payloadHash = await computeMerchantPaymentPayloadHash({
      organizationId: request.organizationId,
      programId,
      invoiceId: request.invoiceId,
      beneficiaryIdentityId: request.beneficiaryIdentityId,
      beneficiaryWallet: request.beneficiaryWallet,
      merchantSettlementWallet: request.merchantSettlementWallet,
      assetCode: rcphp.code,
      assetIssuer: rcphp.issuer,
      amountStroops: request.amountStroops,
      networkPassphrase: deps.config.networkPassphrase,
    });

    const prepared = await deps.protocol.prepare({
      organizationId: request.organizationId,
      programId,
      operationType: MERCHANT_PAYMENT_SCOPE,
      scope: MERCHANT_PAYMENT_SCOPE,
      idempotencyKey,
      payloadHash,
      amountStroops: request.amountStroops,
      assetCode: rcphp.code,
      assetIssuer: rcphp.issuer,
      beneficiaryIdentityId: request.beneficiaryIdentityId,
      requestedBy: request.requestedBy ?? null,
      correlationId,
      requestMetadata: {
        invoice_id: request.invoiceId,
        source_address: request.beneficiaryWallet,
        destination_address: request.merchantSettlementWallet,
      },
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
   * Submits the beneficiary-signed payment through the protocol, which verifies
   * the beneficiary signature and network binding, adds only the sponsor
   * fee-bump, and marks the attempt `submitted` after network acceptance.
   * Confirmation stays reconciliation-owned.
   */
  const submit = async (request: MerchantPaymentSubmitRequest) => {
    const { intent, attempt, signed } = request;
    if (attempt.envelope_xdr === null) {
      throw FinancialErrorException.of(
        'validation_failed',
        'This payment attempt has no prepared transaction to submit.',
        { correlationId: attempt.correlation_id },
      );
    }
    return deps.protocol.submit({ intent, attempt }, signed, deps.strategy);
  };

  return Object.freeze({ prepare, submit });
};

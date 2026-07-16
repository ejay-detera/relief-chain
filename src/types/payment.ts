// Beneficiary payment authorization + reconciled status domain types
// (Requirements 3.6, 11.5, 11.6, 11.8, 11.9, 13.3–13.7, 20.3, 20.4).
//
// The mobile app NEVER moves value directly and NEVER turns a submission into a
// confirmation. The beneficiary authorizes a payment by signing ONLY the exact
// prepared cash transaction or the exact Soroban authorization entry the server
// returned — an approval gate (biometrics with an accessible secure fallback)
// guards that local signing. Confirmation is reconciliation-owned; a rejected or
// expired authorization moves no value and preserves the balance
// (Requirements 11.8, 11.9).
//
// The signing-package and signed-submission shapes here MIRROR the server
// protocol contract (supabase/functions/_shared/stellar/protocol.ts). They carry
// NO secret key material — only the exact bytes the beneficiary must sign.

import type { StroopAmount } from '@/types/blockchain';
import type { FinancialError } from '@/types/errors';
import type { FundingSourceKind, InvoiceV1 } from '@/types/invoice';

/**
 * The exact client-signable package the prepare step returns. It is either the
 * unsigned classic cash transaction (envelope signing) or the exact Soroban
 * authorization entry (auth-entry signing). It never contains an institutional
 * secret or a pre-assembled submittable envelope.
 */
export type ClientSigningPackage =
  | Readonly<{
      kind: 'classic_envelope';
      unsignedEnvelopeXdr: string;
      /** The transaction hash the client signs; binds every operation. */
      transactionHash: string;
      networkPassphrase: string;
    }>
  | Readonly<{
      kind: 'soroban_auth_entry';
      unsignedAuthEntryXdr: string;
      contractId: string;
      functionName: string;
      /** The wallet that must authorize the invocation (the beneficiary). */
      authorizer: string;
      signatureExpirationLedger: number;
      networkPassphrase: string;
    }>;

/** The signed object the client returns for submission. Carries no secret. */
export type ClientSignedSubmission =
  | Readonly<{ kind: 'classic_envelope'; signedEnvelopeXdr: string }>
  | Readonly<{ kind: 'soroban_auth_entry'; signedAuthEntryXdr: string }>;

/**
 * What the beneficiary sends to prepare a payment for a scanned, locally-verified
 * invoice with exactly ONE chosen funding source (Requirement 11.3). The server
 * re-decodes and re-verifies the invoice canonically and revalidates merchant,
 * program, nonce, balance, and expiry ONLINE before returning a signing package
 * (Requirements 10.6, 13.6). The client is never trusted for that revalidation.
 */
export type PaymentPrepareRequest = Readonly<{
  invoice: InvoiceV1;
  /** The single selected source id (`cash` or a program id). */
  fundingSourceId: string;
  fundingSourceKind: FundingSourceKind;
}>;

/**
 * A server-prepared payment awaiting the beneficiary's local signature. The
 * server owns the intent and attempt identity; the client only signs the exact
 * returned package with the wallet named by `expectedSigner`.
 */
export type PreparedPayment = Readonly<{
  intentId: string;
  /** Null on a replay: the prior attempt must be reconciled, not re-signed. */
  attemptId: string | null;
  amountStroops: StroopAmount;
  /** The beneficiary wallet the local signer must match exactly. */
  expectedSigner: string;
  /** Null on a replay; otherwise the exact package to sign. */
  signingPackage: ClientSigningPackage | null;
  /** True when this invoice-bound key was already prepared; do not re-sign. */
  isReplay: boolean;
}>;

/** What the client submits after signing the exact prepared package. */
export type PaymentSubmitRequest = Readonly<{
  intentId: string;
  attemptId: string;
  signed: ClientSignedSubmission;
}>;

/**
 * The accepted-for-processing result of a submission. Acceptance is NOT
 * confirmation: the transfer is `submitted` and finality still comes only from
 * reconciliation observing ledger evidence (Requirements 11.8, 18.8).
 */
export type SubmittedPayment = Readonly<{
  intentId: string;
  transactionHash: string | null;
}>;

/**
 * Honest, reconciliation-backed status of a single payment intent. `confirmed`
 * is reached ONLY when reconciliation has observed matching ledger evidence;
 * everything before that is `pending`/`submitted`. A failed read is
 * `unavailable` and is never converted into a populated success
 * (Requirements 11.8, 21.2, 21.4).
 */
export type ObservedPaymentStatus =
  | Readonly<{ status: 'pending'; intentId: string; transactionHash: string | null }>
  | Readonly<{ status: 'submitted'; intentId: string; transactionHash: string | null }>
  | Readonly<{ status: 'confirmed'; intentId: string; transactionHash: string }>
  | Readonly<{ status: 'failed'; intentId: string; error: FinancialError }>
  | Readonly<{ status: 'unavailable'; reason: string; retryable: boolean }>;

// Typed financial error envelope for Edge Functions.
//
// Every user-facing Edge Function returns a stable, user-safe error envelope
// with a machine code, a human-readable message, a retryability flag, a
// correlation identifier, and optional per-field errors. Internal provider
// details are never placed here — they are logged only after redaction (see
// ./redaction.ts). This module is the single source of the code -> HTTP status
// and code -> retryability mapping described in the design's Error Handling
// table so that every function classifies failures identically.
//
// The wire shape reuses the shared client contract in src/types/errors.ts so the
// mobile application and the Edge Functions agree on exactly one envelope type.
//
// Validates: Requirements 18.3, 20.8

import type {
    ErrorEnvelope,
    FieldErrors,
    FinancialError,
    FinancialErrorCode,
} from '../../../src/types/errors.ts';

export type { ErrorEnvelope, FieldErrors, FinancialError, FinancialErrorCode };

// Retry rule and transport status for each error class, derived directly from
// the design Error Handling table. `retryable` reflects whether an unchanged,
// automatic retry can ever succeed; codes that require user correction,
// re-authentication, re-preparation, a new nonce, or operator resolution are
// never automatically retryable.
interface ErrorClassification {
  readonly status: number;
  readonly retryable: boolean;
}

const ERROR_CLASSIFICATION: Readonly<Record<FinancialErrorCode, ErrorClassification>> = {
  // Validation or authorization: explain and stop; retry only after correction
  // or re-authentication.
  validation_failed: { status: 400, retryable: false },
  authorization_failed: { status: 403, retryable: false },
  authentication_required: { status: 401, retryable: false },
  // Expired/used invoice: require regeneration; never resubmit the same nonce.
  invoice_expired: { status: 409, retryable: false },
  invoice_used: { status: 409, retryable: false },
  // Insufficient balance/budget: explain and stop; re-prepare after state change.
  insufficient_balance: { status: 409, retryable: false },
  insufficient_budget: { status: 409, retryable: false },
  // Signing failed at the client: correct and re-sign.
  signing_failed: { status: 422, retryable: false },
  // Submission rejected: show failed; retry only if a caller classifies it safe.
  submission_rejected: { status: 502, retryable: false },
  // Submission unknown/timeout: show pending; reconcile before any retry.
  submission_unknown: { status: 504, retryable: true },
  // Reconciliation problems.
  reconciliation_failed: { status: 500, retryable: true },
  reconciliation_mismatch: { status: 409, retryable: false },
  // Dependency and sponsor health: temporarily unavailable; resume after health.
  dependency_unavailable: { status: 503, retryable: true },
  sponsor_unavailable: { status: 503, retryable: true },
  // Contract lifecycle: unavailable with incident state.
  contract_paused: { status: 409, retryable: false },
  contract_archived: { status: 409, retryable: false },
};

/** The default retryability for a code, per the design Error Handling table. */
export const defaultRetryable = (code: FinancialErrorCode): boolean =>
  ERROR_CLASSIFICATION[code].retryable;

/** The HTTP status a user-facing Edge Function returns for a code. */
export const httpStatusForCode = (code: FinancialErrorCode): number =>
  ERROR_CLASSIFICATION[code].status;

/** Generates a fresh correlation identifier for tracing a request end to end. */
export const newCorrelationId = (): string => crypto.randomUUID();

export interface FinancialErrorOptions {
  /** Reuse an existing correlation id; a new one is minted when omitted. */
  readonly correlationId?: string;
  readonly fieldErrors?: FieldErrors;
  /** Override the default retryability for the code (rarely needed). */
  readonly retryable?: boolean;
}

/**
 * Builds a user-safe {@link FinancialError}. The message must already be safe to
 * show a user; never place secrets, PII, or raw provider output here.
 */
export const makeFinancialError = (
  code: FinancialErrorCode,
  message: string,
  options: FinancialErrorOptions = {},
): FinancialError => {
  const base = {
    code,
    message,
    retryable: options.retryable ?? defaultRetryable(code),
    correlationId: options.correlationId ?? newCorrelationId(),
  };
  return options.fieldErrors === undefined
    ? Object.freeze(base)
    : Object.freeze({ ...base, fieldErrors: options.fieldErrors });
};

/** Wraps a {@link FinancialError} in its transport envelope. */
export const toErrorEnvelope = (error: FinancialError): ErrorEnvelope =>
  Object.freeze({ error });

/**
 * A throwable carrying a user-safe {@link FinancialError}. Edge handlers throw
 * these and a single top-level catch converts them to a response, guaranteeing
 * that no catch path can turn a failure into a success.
 */
export class FinancialErrorException extends Error {
  readonly financialError: FinancialError;

  constructor(financialError: FinancialError) {
    super(financialError.message);
    this.name = 'FinancialErrorException';
    this.financialError = financialError;
  }

  static of(
    code: FinancialErrorCode,
    message: string,
    options: FinancialErrorOptions = {},
  ): FinancialErrorException {
    return new FinancialErrorException(makeFinancialError(code, message, options));
  }
}

/** Type guard for a {@link FinancialErrorException}. */
export const isFinancialErrorException = (
  value: unknown,
): value is FinancialErrorException => value instanceof FinancialErrorException;

/**
 * Coerces any thrown value into a user-safe {@link FinancialError}. Known
 * financial exceptions are passed through; every other value collapses to an
 * opaque, non-retryable dependency error so that raw internal detail never
 * reaches the client. The caller is responsible for logging the original value
 * after redaction.
 */
export const toFinancialError = (
  value: unknown,
  correlationId: string,
): FinancialError => {
  if (isFinancialErrorException(value)) {
    return value.financialError;
  }
  return makeFinancialError(
    'dependency_unavailable',
    'The service is temporarily unavailable. Please try again later.',
    { correlationId, retryable: true },
  );
};

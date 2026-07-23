export type FinancialErrorCode =
  | 'validation_failed' | 'authorization_failed' | 'authentication_required'
  | 'invoice_expired' | 'invoice_used' | 'insufficient_balance' | 'insufficient_budget'
  | 'signing_failed' | 'submission_rejected' | 'submission_unknown'
  | 'reconciliation_failed' | 'reconciliation_mismatch' | 'dependency_unavailable'
  | 'sponsor_unavailable' | 'contract_paused' | 'contract_archived';

export type FieldErrors = Readonly<Record<string, readonly string[]>>;

export type FinancialError = Readonly<{
  code: FinancialErrorCode;
  message: string;
  retryable: boolean;
  correlationId: string;
  fieldErrors?: FieldErrors;
}>;

export type FinancialResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: FinancialError };

export type ErrorEnvelope = Readonly<{
  error: FinancialError;
}>;

import type { FinancialError, FinancialErrorCode } from '@/types/errors';

/**
 * Shared helpers for the client → Edge Function service boundary. Every financial
 * service relays a request and maps the response to a typed {@link FinancialError}
 * on failure. A dependency failure is never converted into a fabricated success
 * (Requirements 18.3, 18.4, 21.4).
 */

/** An unresolved client-side failure (network, thrown exception) is always retryable. */
export const unknownFinancialError = (message: string): FinancialError => ({
  code: 'dependency_unavailable',
  message,
  retryable: true,
  correlationId: 'client-unresolved',
});

/**
 * Normalizes an arbitrary Edge Function error payload into a typed
 * {@link FinancialError}. Accepts either a bare error object or one nested under
 * an `error` key, preserving the server's stable code, retryability, correlation
 * id, and field errors when present; otherwise falls back to a retryable unknown.
 */
export const toFinancialError = (value: unknown, fallback: string): FinancialError => {
  if (value && typeof value === 'object') {
    const candidate = value as Partial<FinancialError> & { error?: Partial<FinancialError> };
    const source = candidate.error ?? candidate;
    if (typeof source.code === 'string' && typeof source.message === 'string') {
      return {
        code: source.code as FinancialError['code'],
        message: source.message,
        retryable: source.retryable ?? false,
        correlationId: source.correlationId ?? 'client-unresolved',
        fieldErrors: source.fieldErrors,
      };
    }
  }
  return unknownFinancialError(fallback);
};

/** Server error codes this client knows how to surface (mirrors FinancialErrorCode). */
const KNOWN_CODES: ReadonlySet<string> = new Set<string>([
  'validation_failed',
  'authorization_failed',
  'authentication_required',
  'invoice_expired',
  'invoice_used',
  'insufficient_balance',
  'insufficient_budget',
  'signing_failed',
  'submission_rejected',
  'submission_unknown',
  'reconciliation_failed',
  'reconciliation_mismatch',
  'dependency_unavailable',
  'sponsor_unavailable',
  'contract_paused',
  'contract_archived',
]);

/**
 * Extracts the server's structured error envelope from a failed Edge Function
 * invocation. supabase-js surfaces non-2xx responses as a generic transport
 * error ('Edge Function returned a non-2xx status code') while the actionable
 * `{ error: { code, message, ... } }` envelope sits unread in the response
 * body — which is why screens show a mystery failure instead of the server's
 * reason. This reads that body when present so the UI can show the real
 * message. Never throws and never fabricates: returns null when no valid
 * envelope exists and the caller falls back exactly as before.
 */
export const extractEdgeErrorEnvelope = async (error: unknown): Promise<FinancialError | null> => {
  try {
    if (!error || typeof error !== 'object') return null;
    const context = (error as { context?: unknown }).context;
    if (!context || typeof context !== 'object') return null;
    const readJson = (context as { json?: unknown }).json;
    if (typeof readJson !== 'function') return null;
    const body: unknown = await (readJson as () => Promise<unknown>).call(context);
    if (!body || typeof body !== 'object') return null;
    const candidate = body as { error?: unknown };
    const source: unknown = candidate.error ?? body;
    if (!source || typeof source !== 'object') return null;
    const { code, message, retryable, correlationId, fieldErrors } = source as {
      code?: unknown;
      message?: unknown;
      retryable?: unknown;
      correlationId?: unknown;
      fieldErrors?: unknown;
    };
    if (typeof code !== 'string' || typeof message !== 'string') return null;
    if (!KNOWN_CODES.has(code)) return null;
    return {
      code: code as FinancialErrorCode,
      message,
      retryable: typeof retryable === 'boolean' ? retryable : false,
      correlationId: typeof correlationId === 'string' ? correlationId : 'client-unresolved',
      ...(fieldErrors && typeof fieldErrors === 'object'
        ? { fieldErrors: fieldErrors as FinancialError['fieldErrors'] }
        : {}),
    };
  } catch {
    return null;
  }
};

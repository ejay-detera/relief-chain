import type { FinancialError } from '@/types/errors';

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

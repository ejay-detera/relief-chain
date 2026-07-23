// HTTP response helpers for Edge Functions.
//
// Success and error responses share one JSON shape and always carry the
// correlation id both in the body and in an `x-correlation-id` header so a
// client can quote it for support and an operator can trace it in logs. Error
// responses derive their status from the typed code mapping in ./errors.ts.
//
// Validates: Requirements 18.3, 20.8

import {
    httpStatusForCode,
    toErrorEnvelope,
    type FinancialError,
} from './errors.ts';

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';

const baseHeaders = (correlationId: string): Record<string, string> => ({
  'content-type': JSON_CONTENT_TYPE,
  'x-correlation-id': correlationId,
  // Financial responses must never be cached by intermediaries.
  'cache-control': 'no-store',
});

/** Serializes a JSON body with the standard headers and correlation id. */
export const jsonResponse = (
  body: unknown,
  status: number,
  correlationId: string,
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: baseHeaders(correlationId),
  });

/** A successful response envelope: `{ ok: true, data, correlationId }`. */
export const successResponse = <T>(
  data: T,
  correlationId: string,
  status = 200,
): Response =>
  jsonResponse({ ok: true, data, correlationId }, status, correlationId);

/**
 * Maps a typed {@link FinancialError} to its transport envelope and HTTP status.
 * This is the only sanctioned way to emit an error body, so every function
 * reports failures identically and never leaks internal detail.
 */
export const errorResponse = (error: FinancialError): Response =>
  jsonResponse(
    toErrorEnvelope(error),
    httpStatusForCode(error.code),
    error.correlationId,
  );

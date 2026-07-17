// Idempotency-key claim and conflict detection.
//
// Deterministic business idempotency keys are the first line of defense against
// duplicate settlement (design: Property 2, "No Duplicate Settlement"). The
// authoritative claim happens atomically inside the database RPC
// `claim_financial_idempotency_key`, which INSERTs the key or, on a repeat,
// returns the existing row — unless the same key is reused with a different
// payload hash, operation type, or program, which it rejects.
//
// This module wraps that RPC so callers get a typed outcome:
//   - a fresh claim (proceed to build the operation),
//   - a safe replay of an identical request (reconcile / return the prior
//     result rather than creating a second transfer), or
//   - a typed, non-retryable conflict error when the key is reused for
//     different content.
//
// The RPC is service-role only, so `client` must be a service-role client
// (see createServiceClient in ../auth.ts).
//
// Validates: Requirements 18.3, 20.6

import type { Database } from '../../../../src/types/database.types.ts';
import type { TypedSupabaseClient } from '../auth.ts';
import { FinancialErrorException, makeFinancialError } from '../errors.ts';
import { safeLog } from '../redaction.ts';

export type FinancialOperationType = Database['public']['Enums']['financial_operation_type'];
export type IdempotencyKeyRecord = Database['public']['Tables']['idempotency_keys']['Row'];

export interface ClaimIdempotencyKeyParams {
  readonly organizationId: string;
  /** The program the operation belongs to, when applicable. */
  readonly programId: string | null;
  /** Namespace for the key, e.g. `cash_distribution` or `voucher_redemption`. */
  readonly scope: string;
  /** The deterministic business idempotency key. */
  readonly idempotencyKey: string;
  /** Hash of the canonical request payload used to detect reuse conflicts. */
  readonly payloadHash: string;
  readonly operationType: FinancialOperationType;
  readonly correlationId: string;
}

export interface IdempotencyClaim {
  readonly record: IdempotencyKeyRecord;
  /**
   * True when the key already existed for an identical request (a safe replay).
   * Callers must reconcile / return the prior outcome instead of transferring
   * value a second time.
   */
  readonly isReplay: boolean;
}

// SQLSTATE raised by the RPC when a key is reused with different content.
const PAYLOAD_CONFLICT_SQLSTATE = '23514';

const isPayloadConflict = (error: { code?: string; message?: string } | null): boolean =>
  error?.code === PAYLOAD_CONFLICT_SQLSTATE ||
  (typeof error?.message === 'string' &&
    error.message.toLowerCase().includes('idempotency key payload hash conflict'));

/**
 * Atomically claims a business idempotency key. Returns the claimed or existing
 * record along with whether this was a safe replay. Throws a typed,
 * non-retryable conflict error when the key is reused for different content.
 */
export const claimIdempotencyKey = async (
  client: TypedSupabaseClient,
  params: ClaimIdempotencyKeyParams,
): Promise<IdempotencyClaim> => {
  const { data, error } = await client.rpc('claim_financial_idempotency_key', {
    p_organization_id: params.organizationId,
    p_program_id: params.programId as string,
    p_scope: params.scope,
    p_idempotency_key: params.idempotencyKey,
    p_payload_hash: params.payloadHash,
    p_operation_type: params.operationType,
    p_correlation_id: params.correlationId,
  });

  if (error) {
    if (isPayloadConflict(error)) {
      // A reused key with different content must never produce a second
      // transfer; require the caller to correct the request.
      throw FinancialErrorException.of(
        'validation_failed',
        'This request reuses an idempotency key with different details. Start a new request.',
        {
          correlationId: params.correlationId,
          fieldErrors: { idempotencyKey: ['already used for a different operation'] },
        },
      );
    }
    safeLog('claim_financial_idempotency_key failed', {
      correlationId: params.correlationId,
      scope: params.scope,
      error,
    });
    throw new FinancialErrorException(
      makeFinancialError('dependency_unavailable', 'Unable to record this request right now.', {
        correlationId: params.correlationId,
        retryable: true,
      }),
    );
  }

  if (!data) {
    throw new FinancialErrorException(
      makeFinancialError('dependency_unavailable', 'Unable to record this request right now.', {
        correlationId: params.correlationId,
        retryable: true,
      }),
    );
  }

  const record = data as IdempotencyKeyRecord;
  // On a fresh insert both timestamps default to the same now(); on a replay the
  // RPC advances last_seen_at, so an inequality marks a prior identical request.
  const isReplay = record.first_seen_at !== record.last_seen_at;
  return { record, isReplay };
};

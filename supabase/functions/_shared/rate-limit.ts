// Token-bucket rate limiting for privileged financial endpoints.
//
// Requirement 20.7 requires rate limiting invoice creation, payment attempts,
// wallet rotation, sponsorship, and privileged financial endpoints; Requirement
// 22.4 requires that concurrent redemption bursts be rate-limited WITHOUT losing
// accepted idempotent requests. This module implements the pure token-bucket
// arithmetic behind both: a bucket that refills continuously at a sustained rate
// up to a burst capacity, so short bursts are absorbed and sustained abuse is
// throttled.
//
// The arithmetic is pure and deterministic (a clock and the prior bucket state
// are inputs, never `Date.now()` reached directly), so it is unit-testable and
// safe to run identically wherever a limiter is enforced. Bucket persistence is
// injected through a {@link RateLimitStore}; an atomic store keeps the limiter
// correct under concurrency, and this module never assumes a specific backend.
//
// An exceeded limit surfaces as a retryable `dependency_unavailable` error (the
// design's "temporarily unavailable, retry later" class) carrying a computed
// retry-after hint, so a throttled caller backs off rather than being told to
// correct an unfixable request. Rate limiting NEVER drops an already-accepted,
// idempotent request — it only refuses to admit a NEW one before it is accepted.
//
// Validates: Requirements 20.7, 22.4

import { FinancialErrorException, makeFinancialError } from './errors.ts';

// ---------------------------------------------------------------------------
// Policy and bucket state.
// ---------------------------------------------------------------------------

/** A sustained-rate + burst policy for one limiter category. */
export interface RateLimitPolicy {
  /** Maximum burst: the most tokens the bucket can hold. Must be > 0. */
  readonly capacity: number;
  /** Sustained refill rate in tokens per second. Must be > 0. */
  readonly refillPerSecond: number;
}

/** The persisted state of one bucket (one subject × category). */
export interface BucketState {
  /** Tokens available at `updatedAtMs` (fractional; clamped to `[0, capacity]`). */
  readonly tokens: number;
  /** Epoch milliseconds the tokens were last computed. */
  readonly updatedAtMs: number;
}

/** The privileged categories Requirement 20.7 enumerates. */
export const RATE_LIMIT_CATEGORIES = [
  'invoice_creation',
  'payment_attempt',
  'wallet_rotation',
  'sponsorship',
  'privileged_endpoint',
] as const;

export type RateLimitCategory = (typeof RATE_LIMIT_CATEGORIES)[number];

const assertPositive = (value: number, field: string): void => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Rate limit ${field} must be a positive finite number.`);
  }
};

/** A fresh, full bucket for a policy at `nowMs`. */
export const freshBucket = (policy: RateLimitPolicy, nowMs: number): BucketState => {
  assertPositive(policy.capacity, 'capacity');
  assertPositive(policy.refillPerSecond, 'refillPerSecond');
  return { tokens: policy.capacity, updatedAtMs: nowMs };
};

/**
 * Refills a bucket to `nowMs`. Elapsed time adds `refillPerSecond` tokens per
 * second, clamped to `capacity`. A `nowMs` earlier than the last update (clock
 * skew) never removes tokens.
 */
export const refill = (
  state: BucketState,
  policy: RateLimitPolicy,
  nowMs: number,
): BucketState => {
  assertPositive(policy.capacity, 'capacity');
  assertPositive(policy.refillPerSecond, 'refillPerSecond');
  const elapsedMs = Math.max(0, nowMs - state.updatedAtMs);
  const refilled = (elapsedMs / 1000) * policy.refillPerSecond;
  const tokens = Math.min(policy.capacity, state.tokens + refilled);
  return { tokens, updatedAtMs: nowMs };
};

export interface ConsumeDecision {
  readonly allowed: boolean;
  /** The bucket state to persist after this decision. */
  readonly state: BucketState;
  /** Milliseconds until `cost` tokens are available again (0 when allowed). */
  readonly retryAfterMs: number;
  /** Tokens remaining after a permitted consume (informational). */
  readonly remaining: number;
}

/**
 * Attempts to consume `cost` tokens from a bucket at `nowMs`. Refills first, then
 * either deducts (allowed) or computes how long until enough tokens accrue
 * (denied). Purely functional: it returns the next state rather than mutating.
 */
export const tryConsume = (
  state: BucketState,
  policy: RateLimitPolicy,
  nowMs: number,
  cost = 1,
): ConsumeDecision => {
  assertPositive(cost, 'cost');
  if (cost > policy.capacity) {
    // A request that can never fit the burst capacity is refused outright rather
    // than waiting forever; treat as immediately denied.
    const refilledState = refill(state, policy, nowMs);
    return { allowed: false, state: refilledState, retryAfterMs: Infinity, remaining: refilledState.tokens };
  }
  const refilled = refill(state, policy, nowMs);
  if (refilled.tokens >= cost) {
    const nextTokens = refilled.tokens - cost;
    return {
      allowed: true,
      state: { tokens: nextTokens, updatedAtMs: nowMs },
      retryAfterMs: 0,
      remaining: nextTokens,
    };
  }
  const deficit = cost - refilled.tokens;
  const retryAfterMs = Math.ceil((deficit / policy.refillPerSecond) * 1000);
  return { allowed: false, state: refilled, retryAfterMs, remaining: refilled.tokens };
};

// ---------------------------------------------------------------------------
// Store port and limiter.
// ---------------------------------------------------------------------------

/**
 * Atomic bucket persistence. `consume` MUST read, refill, decide, and write the
 * bucket for `key` atomically (e.g. a single Postgres RPC) so concurrent callers
 * cannot both observe the same tokens. This module supplies the pure decision;
 * the store guarantees atomicity.
 */
export interface RateLimitStore {
  consume(params: {
    readonly key: string;
    readonly policy: RateLimitPolicy;
    readonly cost: number;
    readonly nowMs: number;
  }): Promise<ConsumeDecision>;
}

/**
 * A store adapter for backends that only offer compare-and-set on an opaque
 * bucket row. The pure decision is computed here; the adapter reads the prior
 * state and writes the next one.
 */
export interface BucketRepository {
  read(key: string): Promise<BucketState | null>;
  /** Persists the next state; SHOULD be conditional on the read state for atomicity. */
  write(key: string, next: BucketState): Promise<void>;
}

/** Builds a {@link RateLimitStore} from a simple read/write repository. */
export const createRepositoryRateLimitStore = (repo: BucketRepository): RateLimitStore => ({
  async consume({ key, policy, cost, nowMs }) {
    const prior = (await repo.read(key)) ?? freshBucket(policy, nowMs);
    const decision = tryConsume(prior, policy, nowMs, cost);
    // Persist the refilled/decremented state regardless of the outcome so accrued
    // tokens and the throttle both stick.
    await repo.write(key, decision.state);
    return decision;
  },
});

export interface RateLimitDependencies {
  readonly store: RateLimitStore;
  /** Per-category policies. Categories without a policy are not limited. */
  readonly policies: Readonly<Partial<Record<RateLimitCategory, RateLimitPolicy>>>;
  /** Injected clock in epoch milliseconds; defaults to `Date.now`. */
  readonly nowMs?: () => number;
}

export interface RateLimitCheckParams {
  readonly category: RateLimitCategory;
  /** Identifies the throttled subject, e.g. a user id, org id, or merchant id. */
  readonly subject: string;
  readonly correlationId: string;
  /** Token cost of this request; defaults to 1. */
  readonly cost?: number;
}

export interface RateLimiter {
  /** Returns the decision without throwing, for callers that set headers. */
  check(params: RateLimitCheckParams): Promise<ConsumeDecision>;
  /** Consumes a token or throws a retryable `dependency_unavailable`. */
  enforce(params: RateLimitCheckParams): Promise<void>;
}

const retryAfterSeconds = (retryAfterMs: number): number =>
  Number.isFinite(retryAfterMs) ? Math.max(1, Math.ceil(retryAfterMs / 1000)) : 0;

/**
 * Builds a rate limiter over an injected atomic store and per-category policies.
 * A category without a configured policy is unlimited (the limiter is opt-in per
 * endpoint). The bucket key namespaces the subject by category so limits for
 * distinct endpoints never share a bucket.
 */
export const createRateLimiter = (deps: RateLimitDependencies): RateLimiter => {
  const now = deps.nowMs ?? (() => Date.now());

  const check = async (params: RateLimitCheckParams): Promise<ConsumeDecision> => {
    const policy = deps.policies[params.category];
    const cost = params.cost ?? 1;
    if (policy === undefined) {
      // No policy configured: unlimited. Report an allowing decision.
      return { allowed: true, state: { tokens: Infinity, updatedAtMs: now() }, retryAfterMs: 0, remaining: Infinity };
    }
    return deps.store.consume({
      key: `${params.category}:${params.subject}`,
      policy,
      cost,
      nowMs: now(),
    });
  };

  const enforce = async (params: RateLimitCheckParams): Promise<void> => {
    const decision = await check(params);
    if (!decision.allowed) {
      const seconds = retryAfterSeconds(decision.retryAfterMs);
      const wait = seconds > 0 ? ` Please try again in about ${seconds} second${seconds === 1 ? '' : 's'}.` : '';
      throw new FinancialErrorException(
        makeFinancialError(
          'dependency_unavailable',
          `Too many ${params.category.replace(/_/g, ' ')} requests right now.${wait}`,
          { correlationId: params.correlationId, retryable: true },
        ),
      );
    }
  };

  return Object.freeze({ check, enforce });
};

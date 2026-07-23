// Durable work queues with bounded concurrency and backpressure.
//
// Municipal-scale bursts (2,000-recipient distribution jobs, concurrent
// redemption bursts) must be admitted safely, processed with bounded
// parallelism, and survive dependency outages without losing an accepted request
// (Requirements 22.2, 22.4, 22.6). This module provides two composable pieces:
//
//   1. A pure async CONCURRENCY LIMITER that runs at most `maxConcurrency` tasks
//      at once, queueing the rest and preserving submission order. This bounds
//      parallel network/contract work so a burst cannot overwhelm dependencies.
//
//   2. A DURABLE WORK QUEUE over an injected {@link WorkItemStore}. Admission is
//      the durability boundary: an item is PERSISTED before `accept` resolves, so
//      an accepted request is never held only in memory and always survives a
//      restart or a dependency outage. BACKPRESSURE is applied BEFORE admission —
//      when the durable depth is at capacity a NEW request is refused with a
//      retryable error — so the queue rejects rather than silently drops, and an
//      already-accepted idempotent request is never lost.
//
// Processing claims items with a lease, runs them under the concurrency limiter,
// and either completes an item (removing it) or releases it back to the store on
// failure. A single item's failure is caught per-item and never blocks the rest
// of the batch, and a crash mid-batch leaves leased items to be reclaimed after
// the lease expires — the durability property.
//
// All state and I/O are injected, so this module reads no Deno globals and stays
// inside the project-wide type check and the unit-test harness.
//
// Validates: Requirements 22.4, 22.6, 20.7

import { FinancialErrorException, makeFinancialError } from './errors.ts';
import { safeLog } from './redaction.ts';

// ---------------------------------------------------------------------------
// Bounded concurrency limiter (pure, in-process).
// ---------------------------------------------------------------------------

export interface ConcurrencyLimiter {
  /** Runs `task` as soon as a slot is free; resolves/rejects with its result. */
  run<T>(task: () => Promise<T>): Promise<T>;
  /** Tasks currently executing. */
  readonly active: number;
  /** Tasks waiting for a slot. */
  readonly pending: number;
}

/**
 * Builds an async limiter that runs at most `maxConcurrency` tasks concurrently.
 * Waiting tasks start in FIFO order as slots free up. A task's rejection frees
 * its slot and never stalls the queue.
 */
export const createConcurrencyLimiter = (maxConcurrency: number): ConcurrencyLimiter => {
  if (!Number.isInteger(maxConcurrency) || maxConcurrency <= 0) {
    throw new Error('maxConcurrency must be a positive integer.');
  }

  let active = 0;
  const waiters: (() => void)[] = [];

  const acquire = (): Promise<void> => {
    if (active < maxConcurrency) {
      active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      waiters.push(() => {
        active += 1;
        resolve();
      });
    });
  };

  const release = (): void => {
    active -= 1;
    const next = waiters.shift();
    if (next) {
      next();
    }
  };

  const run = async <T>(task: () => Promise<T>): Promise<T> => {
    await acquire();
    try {
      return await task();
    } finally {
      release();
    }
  };

  return {
    run,
    get active() {
      return active;
    },
    get pending() {
      return waiters.length;
    },
  };
};

/**
 * Runs `worker` over every item with bounded concurrency, isolating failures so
 * one item never blocks the rest. Resolves with a per-item result partition once
 * all items settle.
 */
export const mapWithConcurrency = async <T, R>(
  items: readonly T[],
  maxConcurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<{
  readonly succeeded: readonly { index: number; item: T; value: R }[];
  readonly failed: readonly { index: number; item: T; error: unknown }[];
}> => {
  const limiter = createConcurrencyLimiter(maxConcurrency);
  const succeeded: { index: number; item: T; value: R }[] = [];
  const failed: { index: number; item: T; error: unknown }[] = [];

  await Promise.all(
    items.map((item, index) =>
      limiter.run(async () => {
        try {
          const value = await worker(item, index);
          succeeded.push({ index, item, value });
        } catch (error) {
          // Per-item isolation: a single failure is captured, never propagated,
          // so the remaining items still run to completion.
          failed.push({ index, item, error });
        }
      }),
    ),
  );

  succeeded.sort((left, right) => left.index - right.index);
  failed.sort((left, right) => left.index - right.index);
  return { succeeded, failed };
};

// ---------------------------------------------------------------------------
// Durable work queue.
// ---------------------------------------------------------------------------

/** A durably-stored unit of work. `payload` is caller-defined and non-secret. */
export interface WorkItem<TPayload> {
  readonly id: string;
  readonly payload: TPayload;
  /** Prior processing attempts; drives retry/dead-letter policy. */
  readonly attempts: number;
}

export interface EnqueueResult {
  /** True once the item is durably persisted. */
  readonly accepted: boolean;
  /** The durable queue depth observed at admission. */
  readonly depth: number;
}

export interface ClaimedItem<TPayload> extends WorkItem<TPayload> {
  /** Opaque lease token proving this claim; returned when completing/releasing. */
  readonly leaseToken: string;
}

/**
 * The durability boundary. Implementations persist accepted items, claim pending
 * items under a lease (so a crash leaves them reclaimable), and remove only on
 * completion. Releasing returns an item to `pending` for a later claim.
 */
export interface WorkItemStore<TPayload> {
  /**
   * Persists a new item durably and returns the depth AFTER insertion. MUST be
   * atomic so a concurrent admit sees a consistent depth.
   */
  enqueue(item: { readonly id: string; readonly payload: TPayload }): Promise<EnqueueResult>;
  /** Current durable depth of pending + leased items. */
  depth(): Promise<number>;
  /** Atomically claims up to `limit` pending items, leasing them. */
  claim(limit: number): Promise<ClaimedItem<TPayload>[]>;
  /** Removes a completed item. */
  complete(id: string, leaseToken: string): Promise<void>;
  /** Returns an item to pending (or dead-letters it) after a failed attempt. */
  release(params: {
    readonly id: string;
    readonly leaseToken: string;
    readonly requeue: boolean;
    readonly error?: string | null;
  }): Promise<void>;
}

export interface DurableWorkQueueDependencies<TPayload> {
  readonly store: WorkItemStore<TPayload>;
  /** Maximum durable depth before new admissions are refused (backpressure). */
  readonly maxDepth: number;
  /** Maximum items processed concurrently in one drain. */
  readonly maxConcurrency: number;
  /** Attempts after which a failed item is dead-lettered rather than requeued. */
  readonly maxAttempts?: number;
  /** Injected id factory; defaults to `crypto.randomUUID`. */
  readonly newId?: () => string;
}

export interface AcceptRequest<TPayload> {
  readonly payload: TPayload;
  readonly correlationId: string;
  /** Optional caller-supplied id (e.g. a deterministic per-recipient key). */
  readonly id?: string;
}

export interface DrainResult {
  readonly claimed: number;
  readonly completed: number;
  readonly requeued: number;
  readonly deadLettered: number;
}

export interface DurableWorkQueue<TPayload> {
  /**
   * Applies backpressure then durably persists the item. Throws a retryable
   * `dependency_unavailable` when the queue is at capacity — refusing a NEW
   * request rather than dropping an accepted one.
   */
  accept(request: AcceptRequest<TPayload>): Promise<WorkItem<TPayload>>;
  /**
   * Claims and processes up to `batchSize` items with bounded concurrency.
   * Completed items are removed; failed items are requeued (or dead-lettered
   * past `maxAttempts`). One item's failure never blocks the batch.
   */
  drain(
    processor: (item: WorkItem<TPayload>) => Promise<void>,
    batchSize: number,
  ): Promise<DrainResult>;
  /** Current durable depth, for backpressure and health surfaces. */
  depth(): Promise<number>;
}

/**
 * Builds a durable work queue over an injected store. Admission enforces
 * backpressure and persists before returning (durability); draining processes
 * with bounded concurrency and returns failed items to the store so nothing
 * accepted is lost across an outage.
 */
export const createDurableWorkQueue = <TPayload>(
  deps: DurableWorkQueueDependencies<TPayload>,
): DurableWorkQueue<TPayload> => {
  if (!Number.isInteger(deps.maxDepth) || deps.maxDepth <= 0) {
    throw new Error('maxDepth must be a positive integer.');
  }
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const maxAttempts = deps.maxAttempts ?? 5;

  const depth = (): Promise<number> => deps.store.depth();

  const accept = async (request: AcceptRequest<TPayload>): Promise<WorkItem<TPayload>> => {
    // Backpressure BEFORE admission: refuse a new request when the durable depth
    // is at capacity. Nothing already accepted is affected.
    const currentDepth = await deps.store.depth();
    if (currentDepth >= deps.maxDepth) {
      safeLog('work queue backpressure: admission refused', {
        depth: currentDepth,
        maxDepth: deps.maxDepth,
        correlationId: request.correlationId,
      });
      throw new FinancialErrorException(
        makeFinancialError(
          'dependency_unavailable',
          'The system is busy processing a burst of requests. Please try again shortly.',
          { correlationId: request.correlationId, retryable: true },
        ),
      );
    }

    const id = request.id ?? newId();
    // Persist FIRST: once this resolves the request is durable and survives an
    // outage. The item is only ever removed after successful completion.
    const result = await deps.store.enqueue({ id, payload: request.payload });
    if (!result.accepted) {
      throw new FinancialErrorException(
        makeFinancialError('dependency_unavailable', 'Unable to accept this request right now.', {
          correlationId: request.correlationId,
          retryable: true,
        }),
      );
    }
    return { id, payload: request.payload, attempts: 0 };
  };

  const drain = async (
    processor: (item: WorkItem<TPayload>) => Promise<void>,
    batchSize: number,
  ): Promise<DrainResult> => {
    if (!Number.isInteger(batchSize) || batchSize <= 0) {
      throw new Error('batchSize must be a positive integer.');
    }
    const claimed = await deps.store.claim(batchSize);
    let completed = 0;
    let requeued = 0;
    let deadLettered = 0;

    const outcomes = await mapWithConcurrency(claimed, deps.maxConcurrency, async (item) => {
      await processor({ id: item.id, payload: item.payload, attempts: item.attempts });
    });

    for (const success of outcomes.succeeded) {
      const item = claimed[success.index];
      await deps.store.complete(item.id, item.leaseToken);
      completed += 1;
    }

    for (const failure of outcomes.failed) {
      const item = claimed[failure.index];
      const nextAttempts = item.attempts + 1;
      const requeue = nextAttempts < maxAttempts;
      await deps.store.release({
        id: item.id,
        leaseToken: item.leaseToken,
        requeue,
        error: failure.error instanceof Error ? failure.error.message : String(failure.error),
      });
      if (requeue) {
        requeued += 1;
      } else {
        deadLettered += 1;
        safeLog('work item dead-lettered after max attempts', {
          id: item.id,
          attempts: nextAttempts,
          maxAttempts,
        });
      }
    }

    return { claimed: claimed.length, completed, requeued, deadLettered };
  };

  return Object.freeze({ accept, drain, depth });
};

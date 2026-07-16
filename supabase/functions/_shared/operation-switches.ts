// Independent operational kill switches.
//
// A pilot operator must be able to halt one class of financial operation without
// halting the others, and without ever making the reconciled read models
// unreadable. This module models eight INDEPENDENT switches — issuance,
// activation, distribution, sponsorship, redemption, refund, rotation, and
// cash-out — each toggled on its own, and provides the fail-closed gate every
// submit-side Edge Function consults before accepting new work of that class.
//
// Two invariants are load-bearing (design "Security Design", Requirement 22.6):
//   1. Independence — pausing one operation leaves every other switch exactly as
//      it was. Toggling is a pure, single-key update; there is no shared latch.
//   2. Reconciliation stays readable — reconciliation only READS ledger evidence
//      and WRITES read models, so it is deliberately NOT a controlled operation.
//      A paused switch can never gate reconciliation, so operators can always see
//      confirmed state and lag while a class of new work is halted.
//
// The switch STATE lives in a store (a paused operation, its reason, and who
// paused it are operational facts that survive a restart); this module owns the
// pure evaluation and the fail-closed defaults so a store read that omits a
// switch is treated as enabled, and any explicit pause fails closed.
//
// Reuses the typed error envelope (`contract_paused`) so a paused operation
// surfaces to the client as an incident state rather than a generic failure.
// Configuration and I/O are injected, so this module reads no Deno globals and
// stays inside the project-wide type check and the unit-test harness.
//
// Validates: Requirements 22.6, 24.7, 20.7

import { FinancialErrorException } from './errors.ts';
import { safeLog } from './redaction.ts';

// ---------------------------------------------------------------------------
// Controlled operations (each switch is independent).
// ---------------------------------------------------------------------------

/**
 * The eight independently switchable financial operation classes. Reconciliation
 * is intentionally absent: it is never gated so confirmed state stays readable
 * during any pause.
 */
export const CONTROLLED_OPERATIONS = [
  'issuance',
  'activation',
  'distribution',
  'sponsorship',
  'redemption',
  'refund',
  'rotation',
  'cash_out',
] as const;

export type ControlledOperation = (typeof CONTROLLED_OPERATIONS)[number];

const CONTROLLED_OPERATION_SET: ReadonlySet<string> = new Set(CONTROLLED_OPERATIONS);

/** True when `value` names one of the controlled operations. */
export const isControlledOperation = (value: string): value is ControlledOperation =>
  CONTROLLED_OPERATION_SET.has(value);

export type SwitchState = 'enabled' | 'paused';

/** One switch's operational state. `reason`/`updatedBy` are non-secret metadata. */
export interface OperationSwitchRecord {
  readonly operation: ControlledOperation;
  readonly state: SwitchState;
  /** A short, user-safe incident note shown when the operation is paused. */
  readonly reason?: string | null;
  /** The operator identifier that last toggled the switch (never a secret). */
  readonly updatedBy?: string | null;
  /** ISO-8601 timestamp of the last toggle. */
  readonly updatedAt?: string | null;
}

/**
 * A point-in-time view of every switch. A switch that is absent from `records`
 * is treated as ENABLED (a control plane that has never paused an operation runs
 * normally); an explicitly `paused` record fails closed.
 */
export interface OperationSwitchSnapshot {
  readonly records: readonly OperationSwitchRecord[];
}

// ---------------------------------------------------------------------------
// Pure evaluation.
// ---------------------------------------------------------------------------

const recordFor = (
  snapshot: OperationSwitchSnapshot,
  operation: ControlledOperation,
): OperationSwitchRecord | null =>
  snapshot.records.find((record) => record.operation === operation) ?? null;

/**
 * True when `operation` is currently paused. An absent switch is enabled; only an
 * explicit `paused` record pauses (fail-closed on the pause, open on absence).
 */
export const isOperationPaused = (
  snapshot: OperationSwitchSnapshot,
  operation: ControlledOperation,
): boolean => recordFor(snapshot, operation)?.state === 'paused';

/** The user-safe pause reason, when the operation is paused and carries one. */
export const pauseReasonFor = (
  snapshot: OperationSwitchSnapshot,
  operation: ControlledOperation,
): string | null => {
  const record = recordFor(snapshot, operation);
  return record?.state === 'paused' ? record.reason ?? null : null;
};

/**
 * Reconciliation is never gated by a kill switch: it only reads ledger evidence
 * and writes read models. This is a constant so callers can assert the invariant
 * explicitly, and tests can prove reconciliation is not a controlled operation.
 */
export const RECONCILIATION_IS_GATED = false as const;

/**
 * Applies a single toggle and returns a NEW snapshot with only that operation
 * changed; every other switch is preserved byte-for-byte. This is the purity
 * that guarantees independence — there is no way to pause one operation and
 * accidentally alter another.
 */
export const applyToggle = (
  snapshot: OperationSwitchSnapshot,
  toggle: {
    readonly operation: ControlledOperation;
    readonly state: SwitchState;
    readonly reason?: string | null;
    readonly updatedBy?: string | null;
    readonly updatedAt?: string | null;
  },
): OperationSwitchSnapshot => {
  const next: OperationSwitchRecord = {
    operation: toggle.operation,
    state: toggle.state,
    reason: toggle.state === 'paused' ? toggle.reason ?? null : null,
    updatedBy: toggle.updatedBy ?? null,
    updatedAt: toggle.updatedAt ?? null,
  };
  const others = snapshot.records.filter((record) => record.operation !== toggle.operation);
  return Object.freeze({ records: Object.freeze([...others, next]) });
};

const pausedMessageFor = (operation: ControlledOperation, reason: string | null): string => {
  const suffix = reason && reason.trim().length > 0 ? ` (${reason.trim()})` : '';
  return `The ${operation.replace(/_/g, ' ')} operation is temporarily paused by an operator${suffix}. It will resume once the incident is resolved.`;
};

/**
 * Fails closed when `operation` is paused, raising a `contract_paused` incident
 * error the client renders as an unavailable-with-incident state. Enabled (or
 * absent) switches pass. This is the single gate submit-side functions call
 * before accepting new work of a class.
 */
export const assertOperationEnabled = (
  snapshot: OperationSwitchSnapshot,
  operation: ControlledOperation,
  correlationId: string,
): void => {
  if (isOperationPaused(snapshot, operation)) {
    throw FinancialErrorException.of(
      'contract_paused',
      pausedMessageFor(operation, pauseReasonFor(snapshot, operation)),
      { correlationId },
    );
  }
};

// ---------------------------------------------------------------------------
// Store port and governor.
// ---------------------------------------------------------------------------

/** Injected read/write access to the durable switch state. */
export interface OperationSwitchStore {
  /** Loads the current state of every switch. */
  loadSnapshot(): Promise<OperationSwitchSnapshot>;
  /** Persists a single toggle durably; only that switch is changed. */
  saveToggle(record: OperationSwitchRecord): Promise<void>;
}

export interface OperationSwitchGovernorDependencies {
  readonly store: OperationSwitchStore;
  /** Injected clock; defaults to `Date`. */
  readonly clock?: () => Date;
}

export interface OperationSwitchGovernor {
  /**
   * Fails closed with `contract_paused` when the operation is paused. Reads the
   * live snapshot so a just-tripped switch takes effect immediately.
   */
  assertEnabled(operation: ControlledOperation, correlationId: string): Promise<void>;
  /** Pauses a single operation, leaving the other seven untouched. */
  pause(params: {
    readonly operation: ControlledOperation;
    readonly reason: string;
    readonly updatedBy?: string | null;
  }): Promise<void>;
  /** Resumes a single operation, leaving the other seven untouched. */
  resume(params: {
    readonly operation: ControlledOperation;
    readonly updatedBy?: string | null;
  }): Promise<void>;
  /** The current snapshot, for operational health surfaces. */
  snapshot(): Promise<OperationSwitchSnapshot>;
}

/**
 * Builds a governor over an injected switch store. The governor never touches a
 * shared latch: `pause`/`resume` persist exactly one switch record, so the
 * independence invariant holds at the persistence boundary too.
 */
export const createOperationSwitchGovernor = (
  deps: OperationSwitchGovernorDependencies,
): OperationSwitchGovernor => {
  const clock = deps.clock ?? (() => new Date());

  const assertEnabled = async (
    operation: ControlledOperation,
    correlationId: string,
  ): Promise<void> => {
    const snapshot = await deps.store.loadSnapshot();
    assertOperationEnabled(snapshot, operation, correlationId);
  };

  const pause: OperationSwitchGovernor['pause'] = async ({ operation, reason, updatedBy }) => {
    await deps.store.saveToggle({
      operation,
      state: 'paused',
      reason,
      updatedBy: updatedBy ?? null,
      updatedAt: clock().toISOString(),
    });
    safeLog('operation switch paused', { operation, reason, updatedBy });
  };

  const resume: OperationSwitchGovernor['resume'] = async ({ operation, updatedBy }) => {
    await deps.store.saveToggle({
      operation,
      state: 'enabled',
      reason: null,
      updatedBy: updatedBy ?? null,
      updatedAt: clock().toISOString(),
    });
    safeLog('operation switch resumed', { operation, updatedBy });
  };

  const snapshot = (): Promise<OperationSwitchSnapshot> => deps.store.loadSnapshot();

  return Object.freeze({ assertEnabled, pause, resume, snapshot });
};

// Scheduled Soroban state-archival (TTL) keeper and archived-data recovery.
//
// Soroban ledger entries expire. Every voucher contract call already extends the
// TTL of the entries it touches (the Rust contract, Task 9), but entries that
// are NOT touched for a while — the contract instance, its WASM code entry, and
// idle persistent entitlement entries — can drift toward expiry. If a persistent
// entry expires it is ARCHIVED and can no longer be read or written until it is
// restored, which the design treats as an operational incident (design "Voucher
// Contract -> Storage and Events", Requirement 22.5):
//
//   "A scheduled keeper extends instance, WASM, and active persistent entries
//    beyond the program refund window. Archived contract data is treated as an
//    operational incident requiring restore and reconciliation."
//
// This module is the OFF-CHAIN scheduled keeper that backs the
// `maintain-contract-ttl` Edge Function. It provides three capabilities:
//
//   1. A pure extension PLANNER ({@link planTtlMaintenance}) that, given the
//      current ledger, the entries' observed live-until ledgers, and a policy
//      derived from the program refund window, decides which live entries need
//      extension, which entries are close enough to expiry to warrant a
//      pre-expiry ALERT, and which entries are already archived.
//   2. A scheduled keeper ({@link TtlKeeper.runMaintenance}) that reads live
//      entry state through the guarded Soroban RPC client, extends the entries
//      that need it beyond the refund window, and raises pre-expiry / archived
//      alerts on the same alert surface convention the reconciliation worker uses
//      (Requirements 22.5, 22.7).
//   3. An IDEMPOTENT archived-data recovery command ({@link
//      TtlKeeper.restoreArchived}) that treats archived entries as an incident:
//      it restores them and re-extends them, and a second run is a safe no-op
//      because it re-reads state and only acts on entries that are still archived.
//
// A GATE ({@link assertActivationTtlSafe}) makes the keeper a prerequisite for
// activation: a program cannot activate while its instance/WASM entries are
// missing or archived, so the keeper/restore capability must be exercised first.
//
// The arithmetic and classification are pure, and the ledger clock, entry
// reader, extender, restorer, and alert sink are all injected — so this module
// reads no Deno globals and stays inside the project-wide type check and the
// unit-test harness. Sending the actual `ExtendFootprintTTL` / `RestoreFootprint`
// operations is done through the guarded RPC client from Task 6.2, behind the
// injected {@link FootprintExtender} / {@link FootprintRestorer} ports so the
// pure planning logic is fully offline-testable.
//
// Validates: Requirements 22.5, 22.7, 24.7

import type { StellarTestnetConfig } from '../../../../shared/stellar-config.ts';
import { FinancialErrorException, newCorrelationId } from '../errors.ts';
import { safeLog } from '../redaction.ts';

import { createNetworkGuard, type NetworkGuard } from './network-guard.ts';
import type { GuardedRpcClient } from './rpc.ts';

// ---------------------------------------------------------------------------
// Footprint entries and policy (pure inputs).
// ---------------------------------------------------------------------------

/**
 * The three classes of ledger entry the keeper maintains. `instance` is the
 * contract instance entry, `wasm` is the shared WASM code entry the instance
 * references, and `persistent` is an active persistent contract-data entry (for
 * example an entitlement). Temporary entries are intentionally out of scope:
 * they are cheap and re-created by the contract, never restored.
 */
export type FootprintEntryKind = 'instance' | 'wasm' | 'persistent';

/**
 * One footprint entry's observed state. `liveUntilLedger` is the ledger through
 * which the entry remains live, as read from the RPC (`liveUntilLedgerSeq`). It
 * is `null` when the RPC could not report a live-until value; combined with an
 * explicit `archived` flag, the planner classifies liveness conservatively.
 *
 * `ledgerKeyXdr` is the base64 XDR of the entry's ledger key, carried so the RPC
 * adapter can build the exact footprint for an extend/restore operation. It is
 * optional so the planner and unit tests can work with logical keys alone.
 */
export interface FootprintEntry {
  /** A stable, non-secret identifier for the entry (e.g. a ledger-key hash). */
  readonly key: string;
  readonly kind: FootprintEntryKind;
  /** The ledger through which the entry is live, or `null` when unknown. */
  readonly liveUntilLedger: number | null;
  /** Explicit archived flag from the RPC, when known. */
  readonly archived?: boolean;
  /** Base64 XDR of the ledger key, used by the RPC adapter to build footprints. */
  readonly ledgerKeyXdr?: string | null;
}

/**
 * The TTL policy, expressed in ledgers relative to the program refund window.
 * The keeper keeps every live entry live through at least
 * `refundWindowLedgers + safetyBufferLedgers` ledgers from now, and raises a
 * pre-expiry alert once an entry's remaining runway falls to
 * `alertThresholdLedgers` or fewer.
 */
export interface TtlPolicy {
  /** Ledgers of runway the program refund window itself requires (> 0). */
  readonly refundWindowLedgers: number;
  /** Extra safety buffer kept beyond the refund window (>= 0). */
  readonly safetyBufferLedgers: number;
  /** Remaining-runway (in ledgers) at or below which a pre-expiry alert fires. */
  readonly alertThresholdLedgers: number;
}

const isNonNegativeInteger = (value: number): boolean =>
  Number.isInteger(value) && value >= 0;

/**
 * Validates a {@link TtlPolicy}. The refund window must be a positive integer;
 * the buffer and alert threshold must be non-negative integers. Throws a
 * non-retryable validation error naming the offending field.
 */
export const assertValidTtlPolicy = (policy: TtlPolicy, correlationId?: string): void => {
  const cid = correlationId ?? newCorrelationId();
  if (!Number.isInteger(policy.refundWindowLedgers) || policy.refundWindowLedgers <= 0) {
    throw FinancialErrorException.of('validation_failed', 'Invalid TTL policy.', {
      correlationId: cid,
      fieldErrors: { refundWindowLedgers: ['must be a positive integer'] },
    });
  }
  if (!isNonNegativeInteger(policy.safetyBufferLedgers)) {
    throw FinancialErrorException.of('validation_failed', 'Invalid TTL policy.', {
      correlationId: cid,
      fieldErrors: { safetyBufferLedgers: ['must be a non-negative integer'] },
    });
  }
  if (!isNonNegativeInteger(policy.alertThresholdLedgers)) {
    throw FinancialErrorException.of('validation_failed', 'Invalid TTL policy.', {
      correlationId: cid,
      fieldErrors: { alertThresholdLedgers: ['must be a non-negative integer'] },
    });
  }
};

// ---------------------------------------------------------------------------
// Alerts (pure).
// ---------------------------------------------------------------------------

/**
 * A pre-expiry or archived alert for one entry. `pre_expiry` is a warning (the
 * entry is still live but its runway is low); `archived` is critical (the entry
 * has expired out of live state and needs restore + reconciliation).
 */
export interface TtlAlert {
  readonly severity: 'warning' | 'critical';
  readonly reason: 'pre_expiry' | 'archived';
  readonly entryKey: string;
  readonly entryKind: FootprintEntryKind;
  /** Remaining runway in ledgers for a live entry, or `null` when archived. */
  readonly remainingLedgers: number | null;
}

/** An emitted alert, carrying the run correlation id for tracing. */
export type TtlMaintenanceAlert = TtlAlert & { readonly correlationId: string };

/** Sink for pre-expiry / archived alerts (mirrors the reconciliation alert surface). */
export interface TtlAlertSink {
  emit(alert: TtlMaintenanceAlert): void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Assessment and plan (pure).
// ---------------------------------------------------------------------------

/** The classification of a single entry against the current ledger and policy. */
export interface EntryTtlAssessment {
  readonly entry: FootprintEntry;
  /** `liveUntilLedger - currentLedger` for a live entry, or `null` when archived. */
  readonly remainingLedgers: number | null;
  readonly archived: boolean;
  /** A live entry whose runway is below the extend target. */
  readonly needsExtension: boolean;
  /** A live entry whose runway is at or below the alert threshold. */
  readonly belowAlertThreshold: boolean;
}

/** The complete maintenance plan derived from observed entries. */
export interface TtlMaintenancePlan {
  readonly currentLedger: number;
  /** The ledger every live entry should be extended through. */
  readonly targetLiveUntilLedger: number;
  /** Ledgers-from-now to extend to (`refundWindow + safetyBuffer`). */
  readonly extendToLedgers: number;
  readonly assessments: readonly EntryTtlAssessment[];
  /** Live entries that need extension. */
  readonly toExtend: readonly FootprintEntry[];
  /** Archived entries that need restore (an operational incident). */
  readonly toRestore: readonly FootprintEntry[];
  readonly alerts: readonly TtlAlert[];
  readonly archivedCount: number;
}

/**
 * Classifies one entry. An entry is ARCHIVED when it is explicitly flagged, when
 * its live-until ledger is unknown (`null` — the RPC could not confirm
 * liveness, so we treat it conservatively as needing restore), or when its
 * live-until ledger is strictly below the current ledger. A live entry needs
 * extension when its runway is below the extend target, and is below the alert
 * threshold when its runway is at or under `alertThresholdLedgers`.
 */
export const assessEntry = (
  entry: FootprintEntry,
  currentLedger: number,
  policy: TtlPolicy,
): EntryTtlAssessment => {
  const extendToLedgers = policy.refundWindowLedgers + policy.safetyBufferLedgers;
  const archived =
    entry.archived === true ||
    entry.liveUntilLedger === null ||
    entry.liveUntilLedger < currentLedger;

  if (archived) {
    return {
      entry,
      remainingLedgers: null,
      archived: true,
      needsExtension: false,
      belowAlertThreshold: true,
    };
  }

  // liveUntilLedger is a number >= currentLedger here.
  const remainingLedgers = (entry.liveUntilLedger as number) - currentLedger;
  return {
    entry,
    remainingLedgers,
    archived: false,
    needsExtension: remainingLedgers < extendToLedgers,
    belowAlertThreshold: remainingLedgers <= policy.alertThresholdLedgers,
  };
};

/**
 * Builds the full maintenance plan from observed entries. Pure: it performs no
 * I/O and simply partitions entries into "extend", "restore", and "alert"
 * buckets. Archived entries are never placed in `toExtend` (an archived entry
 * cannot be extended — it must be restored first).
 */
export const planTtlMaintenance = (
  entries: readonly FootprintEntry[],
  currentLedger: number,
  policy: TtlPolicy,
  correlationId?: string,
): TtlMaintenancePlan => {
  assertValidTtlPolicy(policy, correlationId);
  if (!Number.isInteger(currentLedger) || currentLedger <= 0) {
    throw FinancialErrorException.of('validation_failed', 'Invalid current ledger.', {
      correlationId: correlationId ?? newCorrelationId(),
      fieldErrors: { currentLedger: ['must be a positive integer'] },
    });
  }

  const extendToLedgers = policy.refundWindowLedgers + policy.safetyBufferLedgers;
  const targetLiveUntilLedger = currentLedger + extendToLedgers;

  const assessments = entries.map((entry) => assessEntry(entry, currentLedger, policy));

  const toExtend: FootprintEntry[] = [];
  const toRestore: FootprintEntry[] = [];
  const alerts: TtlAlert[] = [];

  for (const assessment of assessments) {
    if (assessment.archived) {
      toRestore.push(assessment.entry);
      alerts.push({
        severity: 'critical',
        reason: 'archived',
        entryKey: assessment.entry.key,
        entryKind: assessment.entry.kind,
        remainingLedgers: null,
      });
      continue;
    }
    if (assessment.needsExtension) {
      toExtend.push(assessment.entry);
    }
    if (assessment.belowAlertThreshold) {
      alerts.push({
        severity: 'warning',
        reason: 'pre_expiry',
        entryKey: assessment.entry.key,
        entryKind: assessment.entry.kind,
        remainingLedgers: assessment.remainingLedgers,
      });
    }
  }

  return {
    currentLedger,
    targetLiveUntilLedger,
    extendToLedgers,
    assessments,
    toExtend,
    toRestore,
    alerts,
    archivedCount: toRestore.length,
  };
};

// ---------------------------------------------------------------------------
// Activation gate (pure) — the keeper is a prerequisite for activation.
// ---------------------------------------------------------------------------

export interface ActivationTtlSafetyOptions {
  readonly correlationId?: string;
  /**
   * Require a healthy `instance` and `wasm` entry (default true). Activation
   * escrows the full budget into a contract instance, so its instance/WASM
   * entries must exist and be live with refund-window runway first.
   */
  readonly requireInstanceAndWasm?: boolean;
}

/**
 * The activation gate. A voucher program MUST NOT activate while any contract
 * entry is archived (that is an unresolved operational incident) or while its
 * instance/WASM entries are missing or lack refund-window runway. This makes the
 * keeper/restore capability a hard prerequisite: the plan it produces has to be
 * clean before activation proceeds. Throws `contract_archived` for archived data
 * and `validation_failed` for a missing/short-runway instance or WASM entry.
 */
export const assertActivationTtlSafe = (
  plan: TtlMaintenancePlan,
  options: ActivationTtlSafetyOptions = {},
): void => {
  const correlationId = options.correlationId ?? newCorrelationId();

  if (plan.archivedCount > 0) {
    throw FinancialErrorException.of(
      'contract_archived',
      'Contract data is archived and must be restored and reconciled before activation.',
      { correlationId },
    );
  }

  if (options.requireInstanceAndWasm === false) {
    return;
  }

  // A gate-healthy entry is present, live, and already extended to the full
  // target runway (`needsExtension === false`) — i.e. the keeper has done its
  // job. Anything short means run the keeper again before activating.
  const isGateHealthy = (kind: FootprintEntryKind): boolean =>
    plan.assessments.some(
      (assessment) =>
        assessment.entry.kind === kind && !assessment.archived && !assessment.needsExtension,
    );

  for (const kind of ['instance', 'wasm'] as const) {
    if (!isGateHealthy(kind)) {
      throw FinancialErrorException.of(
        'validation_failed',
        'The voucher contract instance and code must be live with refund-window runway before activation.',
        { correlationId, fieldErrors: { [kind]: ['must be a live contract entry with runway'] } },
      );
    }
  }
};

// ---------------------------------------------------------------------------
// Injected ports (network I/O lives behind these; the guarded RPC client is
// used by the default adapters at the bottom of the file).
// ---------------------------------------------------------------------------

/** Reads the current ledger sequence. */
export interface LedgerClock {
  currentLedger(): Promise<number>;
}

/** Reads the observed state of the footprint entries the keeper maintains. */
export interface FootprintTtlReader {
  readEntries(): Promise<readonly FootprintEntry[]>;
}

/** The result of sending one footprint operation. */
export interface FootprintOperationResult {
  /** True once the operation was accepted by the network. */
  readonly submitted: boolean;
  /** The transaction hash, when known. */
  readonly transactionHash?: string | null;
  /** The number of entries the operation covered. */
  readonly entryCount: number;
}

export interface ExtendFootprintParams {
  readonly entries: readonly FootprintEntry[];
  /** Extend so each entry lives at least this many ledgers from now. */
  readonly extendToLedgers: number;
  readonly correlationId: string;
}

/**
 * Sends an `ExtendFootprintTTL` (bump) operation for the given entries through
 * the guarded RPC client. Implemented by the `maintain-contract-ttl` Edge
 * Function wiring; injected here so the keeper's planning/orchestration logic is
 * offline-testable.
 */
export interface FootprintExtender {
  extend(params: ExtendFootprintParams): Promise<FootprintOperationResult>;
}

export interface RestoreFootprintParams {
  readonly entries: readonly FootprintEntry[];
  readonly correlationId: string;
}

/**
 * Sends a `RestoreFootprint` operation for archived entries through the guarded
 * RPC client. Implemented by the Edge Function wiring; injected here.
 */
export interface FootprintRestorer {
  restore(params: RestoreFootprintParams): Promise<FootprintOperationResult>;
}

// ---------------------------------------------------------------------------
// Keeper.
// ---------------------------------------------------------------------------

export interface TtlKeeperDependencies {
  readonly config: StellarTestnetConfig;
  /** Defaults to a guard built from `config`. */
  readonly guard?: NetworkGuard;
  readonly policy: TtlPolicy;
  readonly ledger: LedgerClock;
  readonly reader: FootprintTtlReader;
  readonly extender: FootprintExtender;
  readonly restorer: FootprintRestorer;
  readonly alerts?: TtlAlertSink;
  /** Injected correlation-id factory; defaults to a fresh UUID. */
  readonly newCorrelationId?: () => string;
}

export type MaintenanceStatus = 'healthy' | 'extended' | 'archived_incident';

export interface TtlMaintenanceSummary {
  readonly status: MaintenanceStatus;
  readonly plan: TtlMaintenancePlan;
  /** The extension operation result, or `null` when nothing needed extending. */
  readonly extension: FootprintOperationResult | null;
  readonly alertsEmitted: number;
  readonly archivedCount: number;
  readonly correlationId: string;
}

export type RestoreStatus = 'noop' | 'restored';

export interface TtlRestoreSummary {
  readonly status: RestoreStatus;
  readonly restoredCount: number;
  /** The restore operation result, or `null` when nothing was archived. */
  readonly restore: FootprintOperationResult | null;
  /** The follow-up extension of the restored entries, or `null` on a no-op. */
  readonly extension: FootprintOperationResult | null;
  readonly correlationId: string;
}

export interface TtlKeeper {
  /**
   * The scheduled maintenance run: reads live entry state, extends the live
   * entries whose runway is below the refund-window target, and raises
   * pre-expiry / archived alerts. It does NOT auto-restore archived entries —
   * an archived entry is an incident surfaced through `archived_incident` status
   * and a critical alert, recovered by {@link restoreArchived}.
   */
  runMaintenance(params?: { readonly correlationId?: string }): Promise<TtlMaintenanceSummary>;
  /**
   * Idempotent archived-data recovery. Re-reads state, restores the entries that
   * are still archived, and re-extends them beyond the refund window. A second
   * call after a successful restore finds nothing archived and returns a `noop`,
   * so the command is safe to re-run.
   */
  restoreArchived(params?: { readonly correlationId?: string }): Promise<TtlRestoreSummary>;
}

/**
 * Builds the TTL keeper bound to its dependencies. The config is asserted to be
 * testnet as defense in depth, mirroring the reconciliation worker.
 */
export const createTtlKeeper = (deps: TtlKeeperDependencies): TtlKeeper => {
  const guard = deps.guard ?? createNetworkGuard(deps.config);
  const mintCorrelationId = deps.newCorrelationId ?? (() => newCorrelationId());

  guard.assertTestnetConfig();
  assertValidTtlPolicy(deps.policy);

  const emitAlerts = async (
    alerts: readonly TtlAlert[],
    correlationId: string,
  ): Promise<number> => {
    if (deps.alerts === undefined) {
      return 0;
    }
    for (const alert of alerts) {
      await deps.alerts.emit({ ...alert, correlationId });
    }
    return alerts.length;
  };

  const buildPlan = async (correlationId: string): Promise<TtlMaintenancePlan> => {
    const currentLedger = await deps.ledger.currentLedger();
    const entries = await deps.reader.readEntries();
    return planTtlMaintenance(entries, currentLedger, deps.policy, correlationId);
  };

  const runMaintenance: TtlKeeper['runMaintenance'] = async (params = {}) => {
    const correlationId = params.correlationId ?? mintCorrelationId();
    const plan = await buildPlan(correlationId);

    const alertsEmitted = await emitAlerts(plan.alerts, correlationId);

    let extension: FootprintOperationResult | null = null;
    if (plan.toExtend.length > 0) {
      extension = await deps.extender.extend({
        entries: plan.toExtend,
        extendToLedgers: plan.extendToLedgers,
        correlationId,
      });
    }

    const status: MaintenanceStatus =
      plan.archivedCount > 0 ? 'archived_incident' : extension !== null ? 'extended' : 'healthy';

    safeLog('ttl maintenance run', {
      status,
      correlationId,
      extended: plan.toExtend.length,
      archived: plan.archivedCount,
      alerts: alertsEmitted,
    });

    return {
      status,
      plan,
      extension,
      alertsEmitted,
      archivedCount: plan.archivedCount,
      correlationId,
    };
  };

  const restoreArchived: TtlKeeper['restoreArchived'] = async (params = {}) => {
    const correlationId = params.correlationId ?? mintCorrelationId();
    const plan = await buildPlan(correlationId);

    if (plan.toRestore.length === 0) {
      // Idempotent: nothing is archived, so recovery is a no-op.
      safeLog('ttl restore noop', { correlationId });
      return {
        status: 'noop',
        restoredCount: 0,
        restore: null,
        extension: null,
        correlationId,
      };
    }

    const restore = await deps.restorer.restore({
      entries: plan.toRestore,
      correlationId,
    });

    // A restored entry comes back with minimal TTL; immediately re-extend it
    // beyond the refund window so the incident does not recur next ledger.
    const extension = await deps.extender.extend({
      entries: plan.toRestore,
      extendToLedgers: plan.extendToLedgers,
      correlationId,
    });

    // Surface the incident on the alert surface even during recovery.
    await emitAlerts(
      plan.toRestore.map((entry) => ({
        severity: 'critical' as const,
        reason: 'archived' as const,
        entryKey: entry.key,
        entryKind: entry.kind,
        remainingLedgers: null,
      })),
      correlationId,
    );

    safeLog('ttl restore', { correlationId, restored: plan.toRestore.length });

    return {
      status: 'restored',
      restoredCount: plan.toRestore.length,
      restore,
      extension,
      correlationId,
    };
  };

  return Object.freeze({ runMaintenance, restoreArchived });
};

// ---------------------------------------------------------------------------
// Default guarded-RPC adapter.
// ---------------------------------------------------------------------------
//
// The ledger clock reads the latest ledger sequence through the guarded RPC
// client, re-asserting the network first so a mutated endpoint fails closed.
// This is the live-network boundary and is exercised by integration tests, not
// the offline unit harness.

/**
 * Builds a {@link LedgerClock} from the guarded RPC client. It verifies the
 * network before reading, so the keeper never trusts a ledger sequence from an
 * unexpected host.
 */
export const createRpcLedgerClock = (rpcClient: GuardedRpcClient): LedgerClock =>
  Object.freeze({
    async currentLedger(): Promise<number> {
      await rpcClient.assertNetwork();
      const latest = await rpcClient.server.getLatestLedger();
      return latest.sequence;
    },
  });

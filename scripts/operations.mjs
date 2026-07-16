import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { redactText } from './validation-runner.mjs';

// Executable operational recovery and health commands (Task 15.2).
//
// A pilot operator needs a small, safe, non-interactive toolbox to answer two
// questions during an incident:
//   1. "What is the system doing right now?"  -> the `health` command surfaces
//      redacted operational health for Edge Functions, transaction queues,
//      sponsor balance, reconciliation lag, failed transactions, and contract
//      events (Requirement 22.5).
//   2. "How do I recover safely?"             -> the recovery commands emit an
//      idempotent, redacted plan for testnet reset, signer rotation, stalled
//      jobs, sponsor depletion, pause/resume, TTL restore, reconciliation
//      backlog, disaster recovery, and partner outage (Requirements 22.7, 24.7).
//
// Load-bearing safety properties:
//   * Non-interactive        — no prompts; every input comes from flags/files.
//   * Never prints secrets    — all output passes through the shared redactor,
//                               and no credential/secret file is ever read.
//   * Idempotent recovery     — a plan applied twice yields the same switch
//                               state; re-pausing a paused operation is a no-op.
//   * Reconciliation readable — recovery pauses only the eight CONTROLLED
//                               financial operations; reconciliation is never a
//                               controlled operation, so confirmed state and lag
//                               stay observable during any recovery.
//   * No hosted mutation      — commands compute plans and read models from
//                               injected/local files; they never connect to or
//                               mutate a hosted Supabase project.
//
// Requirements: 22.5, 22.7, 24.7

// ---------------------------------------------------------------------------
// Controlled financial operations (kept in lock-step with the shared kill
// switches in supabase/functions/_shared/operation-switches.ts). Reconciliation
// is deliberately excluded: it only reads ledger evidence and writes read
// models, so it must never be paused by a recovery command.
// ---------------------------------------------------------------------------

export const CONTROLLED_OPERATIONS = Object.freeze([
  'issuance',
  'activation',
  'distribution',
  'sponsorship',
  'redemption',
  'refund',
  'rotation',
  'cash_out',
]);

export const RECONCILIATION_OPERATION = 'reconciliation';

const CONTROLLED_OPERATION_SET = new Set(CONTROLLED_OPERATIONS);

export const isControlledOperation = (value) => CONTROLLED_OPERATION_SET.has(value);

// ---------------------------------------------------------------------------
// Operational health (Requirement 22.5)
// ---------------------------------------------------------------------------

export const HEALTH_STATUS = Object.freeze({
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNAVAILABLE: 'unavailable',
});

const STATUS_SEVERITY = Object.freeze({
  [HEALTH_STATUS.HEALTHY]: 0,
  [HEALTH_STATUS.DEGRADED]: 1,
  [HEALTH_STATUS.UNAVAILABLE]: 2,
});

export const HEALTH_COMPONENTS = Object.freeze([
  'edge_functions',
  'transaction_queues',
  'sponsor_balance',
  'reconciliation_lag',
  'failed_transactions',
  'contract_events',
]);

const worseStatus = (a, b) => (STATUS_SEVERITY[a] >= STATUS_SEVERITY[b] ? a : b);

// Coerces an integer-stroop / count value (number or numeric string) to BigInt,
// preserving the design's integer-stroop boundaries. Returns null when absent or
// not a finite non-negative integer.
const toBigIntOrNull = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value >= 0n ? value : null;
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 0 ? BigInt(value) : null;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return BigInt(value.trim());
  }
  return null;
};

const NOT_OBSERVED = 'not observed';

// Each classifier fails honest: with no observation the component is reported as
// UNAVAILABLE ("not observed") rather than being assumed healthy.
const CLASSIFIERS = Object.freeze({
  edge_functions(observation) {
    if (!observation || typeof observation.reachable !== 'boolean') {
      return { status: HEALTH_STATUS.UNAVAILABLE, detail: NOT_OBSERVED };
    }
    const failing = Number(observation.failing ?? 0);
    const checked = Number(observation.checkedFunctions ?? 0);
    if (!observation.reachable) {
      return { status: HEALTH_STATUS.UNAVAILABLE, detail: 'edge runtime unreachable' };
    }
    if (failing > 0) {
      return { status: HEALTH_STATUS.DEGRADED, detail: `${failing} of ${checked} function(s) failing` };
    }
    return { status: HEALTH_STATUS.HEALTHY, detail: `${checked} function(s) reachable` };
  },

  transaction_queues(observation) {
    const depth = toBigIntOrNull(observation?.depth);
    const maxDepth = toBigIntOrNull(observation?.maxDepth);
    if (depth === null || maxDepth === null || maxDepth === 0n) {
      return { status: HEALTH_STATUS.UNAVAILABLE, detail: NOT_OBSERVED };
    }
    const detail = `depth ${depth} of ${maxDepth}`;
    if (depth > maxDepth) return { status: HEALTH_STATUS.UNAVAILABLE, detail: `${detail} (over capacity)` };
    // Degraded once the durable queue passes 80% of its bound.
    if (depth * 10n >= maxDepth * 8n) return { status: HEALTH_STATUS.DEGRADED, detail: `${detail} (backpressure near)` };
    return { status: HEALTH_STATUS.HEALTHY, detail };
  },

  sponsor_balance(observation) {
    const available = toBigIntOrNull(observation?.availableStroops);
    const reserve = toBigIntOrNull(observation?.minReserveStroops);
    if (available === null || reserve === null) {
      return { status: HEALTH_STATUS.UNAVAILABLE, detail: NOT_OBSERVED };
    }
    const detail = `available ${available} stroops, reserve floor ${reserve}`;
    if (available < reserve) return { status: HEALTH_STATUS.UNAVAILABLE, detail: `${detail} (below floor)` };
    if (available < reserve * 2n) return { status: HEALTH_STATUS.DEGRADED, detail: `${detail} (approaching floor)` };
    return { status: HEALTH_STATUS.HEALTHY, detail };
  },

  reconciliation_lag(observation) {
    const lag = toBigIntOrNull(observation?.lagSeconds);
    const threshold = toBigIntOrNull(observation?.thresholdSeconds);
    if (lag === null || threshold === null || threshold === 0n) {
      return { status: HEALTH_STATUS.UNAVAILABLE, detail: NOT_OBSERVED };
    }
    const detail = `lag ${lag}s, threshold ${threshold}s`;
    if (lag > threshold * 3n) return { status: HEALTH_STATUS.UNAVAILABLE, detail: `${detail} (backlog)` };
    if (lag > threshold) return { status: HEALTH_STATUS.DEGRADED, detail: `${detail} (elevated)` };
    return { status: HEALTH_STATUS.HEALTHY, detail };
  },

  failed_transactions(observation) {
    const failed = toBigIntOrNull(observation?.failedCount);
    const threshold = toBigIntOrNull(observation?.threshold);
    if (failed === null || threshold === null) {
      return { status: HEALTH_STATUS.UNAVAILABLE, detail: NOT_OBSERVED };
    }
    const window = observation?.windowSeconds ? ` in ${observation.windowSeconds}s` : '';
    const detail = `${failed} failed${window}, threshold ${threshold}`;
    if (failed > threshold * 2n) return { status: HEALTH_STATUS.UNAVAILABLE, detail: `${detail} (spiking)` };
    if (failed > threshold) return { status: HEALTH_STATUS.DEGRADED, detail: `${detail} (elevated)` };
    return { status: HEALTH_STATUS.HEALTHY, detail };
  },

  contract_events(observation) {
    const last = toBigIntOrNull(observation?.lastIngestedLedger);
    const current = toBigIntOrNull(observation?.currentLedger);
    const maxLag = toBigIntOrNull(observation?.maxLagLedgers);
    if (last === null || current === null || maxLag === null) {
      return { status: HEALTH_STATUS.UNAVAILABLE, detail: NOT_OBSERVED };
    }
    const lag = current >= last ? current - last : 0n;
    const detail = `event lag ${lag} ledger(s), max ${maxLag}`;
    if (lag > maxLag * 3n) return { status: HEALTH_STATUS.UNAVAILABLE, detail: `${detail} (stalled ingestion)` };
    if (lag > maxLag) return { status: HEALTH_STATUS.DEGRADED, detail: `${detail} (elevated)` };
    return { status: HEALTH_STATUS.HEALTHY, detail };
  },
});

/** Classifies a single health component from its (possibly missing) observation. */
export function classifyComponent(id, observation) {
  const classify = CLASSIFIERS[id];
  if (!classify) throw new Error(`Unknown health component: ${id}`);
  const { status, detail } = classify(observation ?? null);
  return { id, status, detail };
}

/**
 * Builds a redacted operational-health report over every component in
 * {@link HEALTH_COMPONENTS}. Missing observations are reported as unavailable, so
 * the report never represents unobserved infrastructure as healthy.
 */
export function buildHealthReport({ observations = {}, now = new Date() } = {}) {
  const components = HEALTH_COMPONENTS.map((id) => classifyComponent(id, observations[id]));
  const overall = components.reduce(
    (acc, component) => worseStatus(acc, component.status),
    HEALTH_STATUS.HEALTHY,
  );
  return {
    generatedAt: now.toISOString(),
    overall,
    components,
  };
}

const STATUS_LABEL = Object.freeze({
  [HEALTH_STATUS.HEALTHY]: 'OK',
  [HEALTH_STATUS.DEGRADED]: 'DEGRADED',
  [HEALTH_STATUS.UNAVAILABLE]: 'UNAVAILABLE',
});

export function formatHealthReport(report, environment = process.env) {
  const lines = [`Relief Chain operational health (${report.overall.toUpperCase()})`, `generated: ${report.generatedAt}`, ''];
  for (const component of report.components) {
    const marker = STATUS_LABEL[component.status] ?? component.status.toUpperCase();
    lines.push(`[${marker}] ${component.id}`);
    if (component.detail) lines.push(`    ${component.detail}`);
  }
  return redactText(lines.join('\n'), environment);
}

// ---------------------------------------------------------------------------
// Recovery command catalog (Requirements 22.7, 24.7)
// ---------------------------------------------------------------------------

// Every recovery command is idempotent and keeps reconciliation readable. A
// command either pauses a set of controlled operations (`action: 'pause'`) or
// resumes one (`action: 'resume'`). `targeted` commands require an --operation
// flag; otherwise `pauses` names the operations affected.
export const RECOVERY_COMMANDS = Object.freeze({
  'testnet-reset': Object.freeze({
    id: 'testnet-reset',
    action: 'pause',
    title: 'Testnet reset',
    requirements: Object.freeze(['22.7']),
    pauses: Object.freeze([...CONTROLLED_OPERATIONS]),
    steps: Object.freeze([
      'Pause all controlled financial operations to stop new submissions.',
      'Re-run the local bootstrap to recreate the isolated testnet topology and RCPHP asset.',
      'Re-verify issuer, distribution, sponsor, treasury accounts, trustlines, and the SAC.',
      'Let reconciliation replay confirmed ledger evidence into the read models.',
      'Resume operations only after health reports healthy.',
    ]),
  }),
  'signer-rotation': Object.freeze({
    id: 'signer-rotation',
    action: 'pause',
    title: 'Institutional signer rotation',
    requirements: Object.freeze(['24.7']),
    pauses: Object.freeze([...CONTROLLED_OPERATIONS]),
    steps: Object.freeze([
      'Pause every operation that requires an institutional signature.',
      'Rotate the affected signer secret out-of-band; never store or print the key material.',
      'Update the isolated signer adapter configuration to reference the new authority.',
      'Verify a no-op signed probe against testnet before resuming.',
      'Resume operations in dependency order once the new signer is confirmed.',
    ]),
  }),
  'stalled-jobs': Object.freeze({
    id: 'stalled-jobs',
    action: 'pause',
    title: 'Stalled distribution jobs',
    requirements: Object.freeze(['22.7']),
    pauses: Object.freeze(['distribution']),
    steps: Object.freeze([
      'Pause distribution to stop enqueueing new recipient work.',
      'Reconcile in-flight attempts so confirmed recipients are preserved.',
      'Requeue only unresolved durable work items under their existing idempotency keys.',
      'Resume distribution; resumable jobs continue without duplicating confirmed recipients.',
    ]),
  }),
  'sponsor-depletion': Object.freeze({
    id: 'sponsor-depletion',
    action: 'pause',
    title: 'Sponsor depletion',
    requirements: Object.freeze(['22.7']),
    pauses: Object.freeze(['sponsorship', 'redemption', 'distribution']),
    steps: Object.freeze([
      'Pause sponsorship and the fee-sponsored operations that depend on it.',
      'Top up the sponsor account on testnet and confirm it clears the reserve floor.',
      'Verify sponsor health via the health command before resuming.',
      'Resume sponsorship first, then the dependent operations.',
    ]),
  }),
  pause: Object.freeze({
    id: 'pause',
    action: 'pause',
    title: 'Pause one operation',
    requirements: Object.freeze(['22.7', '24.7']),
    targeted: true,
    steps: Object.freeze([
      'Pause the named controlled operation, leaving every other switch untouched.',
      'Reconciliation remains readable while the operation is paused.',
    ]),
  }),
  resume: Object.freeze({
    id: 'resume',
    action: 'resume',
    title: 'Resume one operation',
    requirements: Object.freeze(['22.7', '24.7']),
    targeted: true,
    steps: Object.freeze([
      'Resume the named controlled operation once its incident is resolved.',
      'Every other switch is left exactly as it was.',
    ]),
  }),
  'ttl-restore': Object.freeze({
    id: 'ttl-restore',
    action: 'pause',
    title: 'Contract TTL restore',
    requirements: Object.freeze(['22.5', '24.7']),
    pauses: Object.freeze(['redemption', 'refund', 'rotation']),
    steps: Object.freeze([
      'Pause contract-touching operations while archived entries are restored.',
      'Run the idempotent restore for the instance, WASM, and persistent entries.',
      'Extend TTL beyond the refund window and reconcile restored state.',
      'Resume contract operations after restore is confirmed.',
    ]),
  }),
  'reconciliation-backlog': Object.freeze({
    id: 'reconciliation-backlog',
    action: 'pause',
    title: 'Reconciliation backlog',
    requirements: Object.freeze(['22.7']),
    pauses: Object.freeze(['distribution', 'redemption']),
    steps: Object.freeze([
      'Reduce new submissions by pausing the highest-volume submit operations.',
      'Reconciliation continues running and stays readable; only intake is throttled.',
      'Let the reconciler drain the backlog until lag returns under threshold.',
      'Resume the paused operations once reconciliation lag is healthy.',
    ]),
  }),
  'disaster-recovery': Object.freeze({
    id: 'disaster-recovery',
    action: 'pause',
    title: 'Disaster recovery',
    requirements: Object.freeze(['24.7']),
    pauses: Object.freeze([...CONTROLLED_OPERATIONS]),
    steps: Object.freeze([
      'Pause all controlled financial operations immediately.',
      'Restore the database and read models from the most recent verified backup.',
      'Replay confirmed ledger and contract-event evidence via reconciliation.',
      'Verify projection integrity and health before any resume.',
      'Resume operations in dependency order.',
    ]),
  }),
  'partner-outage': Object.freeze({
    id: 'partner-outage',
    action: 'pause',
    title: 'Partner outage',
    requirements: Object.freeze(['24.7']),
    pauses: Object.freeze(['cash_out', 'sponsorship']),
    steps: Object.freeze([
      'Pause the operations that depend on the unavailable partner (defaults to cash-out and sponsorship).',
      'Preserve already-accepted intents durably; surface an accurate user-visible unavailable state.',
      'Reconciliation remains readable so confirmed state is still observable.',
      'Resume the affected operations once the partner is restored.',
    ]),
  }),
});

export const recoveryCommandNames = Object.freeze(Object.keys(RECOVERY_COMMANDS));

// A recovery plan must never pause reconciliation.
const assertReconciliationReadable = (operations) => {
  if (operations.includes(RECONCILIATION_OPERATION)) {
    throw new Error('Recovery must not pause reconciliation; it stays readable.');
  }
  for (const operation of operations) {
    if (!isControlledOperation(operation)) {
      throw new Error(`Not a controlled operation: ${operation}`);
    }
  }
};

/**
 * Applies a single switch toggle and returns a NEW snapshot with only that
 * operation changed. Idempotent: toggling to the state it already holds yields
 * equivalent records (metadata refresh only), never a second entry.
 */
export function applySwitchToggle(snapshot, toggle) {
  const records = Array.isArray(snapshot?.records) ? snapshot.records : [];
  const next = {
    operation: toggle.operation,
    state: toggle.state,
    reason: toggle.state === 'paused' ? toggle.reason ?? null : null,
    updatedBy: toggle.updatedBy ?? null,
    updatedAt: toggle.updatedAt ?? null,
  };
  const others = records.filter((record) => record.operation !== toggle.operation);
  const merged = [...others, next].sort((a, b) => a.operation.localeCompare(b.operation));
  return { records: merged };
}

/**
 * Produces an idempotent recovery plan: the resolved operations to toggle, the
 * resulting switch snapshot, and the human-readable steps. Reconciliation is
 * never among the toggled operations, so it stays readable throughout recovery.
 */
export function planRecovery(commandId, options = {}) {
  const command = RECOVERY_COMMANDS[commandId];
  if (!command) throw new Error(`Unknown recovery command: ${commandId}`);

  const now = options.now ?? new Date();
  const actor = options.actor ?? null;
  const reason = options.reason ?? `${command.title} recovery`;
  const baseSnapshot = options.snapshot ?? { records: [] };

  let operations;
  if (command.targeted) {
    if (!options.operation) {
      throw new Error(`The ${commandId} command requires an --operation.`);
    }
    operations = [options.operation];
  } else {
    operations = [...command.pauses];
  }
  assertReconciliationReadable(operations);

  const state = command.action === 'resume' ? 'enabled' : 'paused';
  let snapshot = baseSnapshot;
  for (const operation of operations) {
    snapshot = applySwitchToggle(snapshot, {
      operation,
      state,
      reason: state === 'paused' ? reason : null,
      updatedBy: actor,
      updatedAt: now.toISOString(),
    });
  }

  return {
    command: command.id,
    title: command.title,
    action: command.action,
    requirements: [...command.requirements],
    operations,
    reconciliationReadable: true,
    idempotent: true,
    generatedAt: now.toISOString(),
    steps: [...command.steps],
    resultingSwitches: snapshot,
  };
}

export function formatRecoveryPlan(plan, environment = process.env) {
  const verb = plan.action === 'resume' ? 'Resume' : 'Pause';
  const lines = [
    `Recovery plan: ${plan.title} [${plan.command}]`,
    `requirements: ${plan.requirements.join(', ')}`,
    `generated: ${plan.generatedAt}`,
    `idempotent: ${plan.idempotent}   reconciliation readable: ${plan.reconciliationReadable}`,
    '',
    `${verb} operations: ${plan.operations.length > 0 ? plan.operations.join(', ') : '(none)'}`,
    'steps:',
    ...plan.steps.map((step, index) => `  ${index + 1}. ${step}`),
    '',
    'resulting switch state:',
    ...plan.resultingSwitches.records.map(
      (record) => `  - ${record.operation}: ${record.state}${record.reason ? ` (${record.reason})` : ''}`,
    ),
    '',
    'reconciliation: readable (never a controlled operation)',
  ];
  return redactText(lines.join('\n'), environment);
}

// ---------------------------------------------------------------------------
// Non-interactive CLI
// ---------------------------------------------------------------------------

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const value = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[(i += 1)] : true;
      flags[key] = value;
    }
  }
  return { command, flags };
}

const readJsonFile = (path) => {
  const resolved = resolve(path);
  return JSON.parse(readFileSync(resolved, 'utf8'));
};

const usage = () => {
  const commands = ['health', 'list', ...recoveryCommandNames].join(' | ');
  return `Usage: node scripts/operations.mjs <${commands}> [--input <path>] [--state <path>] [--operation <name>] [--reason <text>] [--actor <id>] [--json]`;
};

export function runCli(argv, { environment = process.env } = {}) {
  const { command, flags } = parseArgs(argv);

  if (!command || command === 'help' || flags.help) {
    return { exitCode: command ? 0 : 2, stdout: usage(), stderr: command ? '' : usage() };
  }

  if (command === 'list') {
    const lines = ['Recovery commands:'];
    for (const name of recoveryCommandNames) {
      const definition = RECOVERY_COMMANDS[name];
      lines.push(`  ${name} — ${definition.title} (req ${definition.requirements.join(', ')})`);
    }
    return { exitCode: 0, stdout: redactText(lines.join('\n'), environment), stderr: '' };
  }

  if (command === 'health') {
    let observations = {};
    if (typeof flags.input === 'string') {
      try {
        observations = readJsonFile(flags.input);
      } catch (error) {
        return { exitCode: 2, stdout: '', stderr: redactText(`Failed to read --input: ${error.message}`, environment) };
      }
    }
    const report = buildHealthReport({ observations });
    const stdout = flags.json ? redactText(JSON.stringify(report, null, 2), environment) : formatHealthReport(report, environment);
    // Non-zero only when overall health is unavailable, so the command is
    // script-friendly for alerting without failing on merely degraded state.
    return { exitCode: report.overall === HEALTH_STATUS.UNAVAILABLE ? 1 : 0, stdout, stderr: '' };
  }

  if (!RECOVERY_COMMANDS[command]) {
    return { exitCode: 2, stdout: '', stderr: redactText(`Unknown command: ${command}\n${usage()}`, environment) };
  }

  let snapshot = { records: [] };
  if (typeof flags.state === 'string') {
    try {
      snapshot = readJsonFile(flags.state);
    } catch (error) {
      return { exitCode: 2, stdout: '', stderr: redactText(`Failed to read --state: ${error.message}`, environment) };
    }
  }

  try {
    const plan = planRecovery(command, {
      snapshot,
      operation: typeof flags.operation === 'string' ? flags.operation : undefined,
      reason: typeof flags.reason === 'string' ? flags.reason : undefined,
      actor: typeof flags.actor === 'string' ? flags.actor : undefined,
    });
    const stdout = flags.json ? redactText(JSON.stringify(plan, null, 2), environment) : formatRecoveryPlan(plan, environment);
    return { exitCode: 0, stdout, stderr: '' };
  } catch (error) {
    return { exitCode: 2, stdout: '', stderr: redactText(`${error.message}\n${usage()}`, environment) };
  }
}

function main() {
  const result = runCli(process.argv.slice(2));
  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
  process.exitCode = result.exitCode;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main();
}

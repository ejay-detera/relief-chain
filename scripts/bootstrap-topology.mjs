import { appendFileSync, chmodSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Secret-safe, idempotent testnet account-topology bootstrap.
//
// This is an operator command (NOT an Edge Function). It provisions the Stellar
// testnet account topology described in design.md's "Stellar Account and Asset
// Topology" table: issuer, distribution, fee/reserve sponsor, contract
// deployer, organization treasury, cash-program treasury, beneficiary, and
// merchant. Each role is kept logically separated (Req 1.4, 14.2).
//
// Design constraints encoded here:
//   - Testnet only. A non-testnet network, passphrase, or an enabled-mainnet
//     flag is a hard, fail-closed error (Req 1.1, 1.3).
//   - Create-or-discover idempotency. A role whose secret is already configured
//     in the environment is DISCOVERED (its public key is derived and the
//     account is funded if missing). A role with no configured secret is
//     CREATED once and its secret persisted to a secret-safe store so a re-run
//     discovers it instead of creating a second account.
//   - Secret safety. Secret seeds are read only from the injected environment
//     and written only to a secret-safe store (never source, never logs). Only
//     PUBLIC identifiers and redacted diagnostics are emitted (Req 1.7, 3.2).
//   - The pure logic (env reading, planning, separation checks, report
//     building, redaction) is decoupled from the live Horizon/friendbot calls
//     via injected dependencies, so it is fully unit-testable offline.
//
// _Requirements: 1.4, 1.7, 3.2, 14.2_

export const STELLAR_TESTNET_NETWORK = 'testnet';
export const STELLAR_TESTNET_NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
export const DEFAULT_HORIZON_URL = 'https://horizon-testnet.stellar.org';
export const DEFAULT_FRIENDBOT_URL = 'https://friendbot.stellar.org';
export const RCPHP_DISCLOSURE = 'Testnet only — no real monetary value.';

const FRIENDBOT_TIMEOUT_MS = 30_000;

// A Stellar secret seed and public key. Public keys begin with 'G' and are safe
// to emit; secret seeds begin with 'S' and must never be logged or committed.
export const STELLAR_SECRET_SEED = /^S[A-Z2-7]{55}$/;
export const STELLAR_PUBLIC_KEY = /^G[A-Z2-7]{55}$/;

export class BootstrapConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BootstrapConfigurationError';
  }
}

// The full topology. `source` at runtime is 'discovered' or 'created'. Each role
// resolves to its own account; the environment variable is the ONLY place a
// secret seed is read from.
export const ROLE_DEFINITIONS = Object.freeze([
  { role: 'issuer', label: 'Issuer', envVar: 'STELLAR_ISSUER_SECRET', mayHoldAid: false },
  { role: 'distribution', label: 'Distribution source', envVar: 'STELLAR_DISTRIBUTION_SECRET', mayHoldAid: true },
  { role: 'sponsor', label: 'Fee/reserve sponsor', envVar: 'STELLAR_SPONSOR_SECRET', mayHoldAid: false },
  { role: 'contract_deployer', label: 'Contract deployer', envVar: 'STELLAR_CONTRACT_DEPLOYER_SECRET', mayHoldAid: false },
  { role: 'organization_treasury', label: 'Organization treasury', envVar: 'STELLAR_ORGANIZATION_TREASURY_SECRET', mayHoldAid: true },
  { role: 'cash_program_treasury', label: 'Cash-program treasury', envVar: 'STELLAR_CASH_PROGRAM_TREASURY_SECRET', mayHoldAid: true },
  { role: 'beneficiary', label: 'Beneficiary (pilot)', envVar: 'STELLAR_BENEFICIARY_SECRET', mayHoldAid: true },
  { role: 'merchant', label: 'Merchant (pilot)', envVar: 'STELLAR_MERCHANT_SECRET', mayHoldAid: true },
]);

const optionalValue = (value) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed ? trimmed : undefined;
};

// --- Redaction ------------------------------------------------------------
//
// Defense in depth for any diagnostic string. Even though this command is
// designed never to place a secret into a message, any secret seed shape and
// every configured environment secret is masked before it can be surfaced.

export const REDACTED = '[REDACTED]';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function redactDiagnostic(value, environment = process.env) {
  let redacted = String(value ?? '');
  const secrets = Object.entries(environment)
    .filter(([, secret]) => typeof secret === 'string' && STELLAR_SECRET_SEED.test(secret.trim()))
    .map(([, secret]) => secret.trim())
    .sort((left, right) => right.length - left.length);
  for (const secret of secrets) {
    redacted = redacted.replace(new RegExp(escapeRegExp(secret), 'g'), REDACTED);
  }
  // Mask any raw secret-seed shape regardless of source.
  return redacted.replace(/\bS[A-Z2-7]{55}\b/g, REDACTED);
}

// --- Testnet guard --------------------------------------------------------

export function assertTestnetEnvironment(environment = process.env) {
  const network = optionalValue(environment.STELLAR_NETWORK) ?? STELLAR_TESTNET_NETWORK;
  if (network !== STELLAR_TESTNET_NETWORK) {
    throw new BootstrapConfigurationError('Bootstrap only supports Stellar testnet.');
  }
  const passphrase =
    optionalValue(environment.STELLAR_NETWORK_PASSPHRASE) ?? STELLAR_TESTNET_NETWORK_PASSPHRASE;
  if (passphrase !== STELLAR_TESTNET_NETWORK_PASSPHRASE) {
    throw new BootstrapConfigurationError('The configured network passphrase is not Stellar testnet.');
  }
  const mainnet = optionalValue(environment.STELLAR_MAINNET_ENABLED)?.toLowerCase();
  if (mainnet !== undefined && mainnet !== 'false') {
    throw new BootstrapConfigurationError('Mainnet is hard-disabled for the pilot.');
  }
}

// --- Keypair dependencies (injectable; default to the Stellar SDK) ---------

export async function defaultDerivePublicKey(secret) {
  const { Keypair } = await import('@stellar/stellar-sdk');
  return Keypair.fromSecret(secret).publicKey();
}

export async function defaultGenerateKeypair() {
  const { Keypair } = await import('@stellar/stellar-sdk');
  const keypair = Keypair.random();
  return { publicKey: keypair.publicKey(), secret: keypair.secret() };
}

// --- Secret sink (secret-safe store; never a log) --------------------------
//
// A sink persists a newly generated secret keyed by its environment variable so
// a subsequent run discovers the account. The default sink appends to a
// gitignored `.env*.local` file with owner-only permissions. When no sink is
// configured, generation is disabled and unconfigured roles become actionable
// failures rather than unrecoverable throwaway accounts.

export function createFileSecretSink(filePath) {
  const absolute = resolve(filePath);
  return {
    describe: () => absolute,
    persist: (envVar, secret) => {
      const isNew = !existsSync(absolute);
      appendFileSync(absolute, `${envVar}=${secret}\n`, { encoding: 'utf8', mode: 0o600 });
      if (isNew) {
        try {
          chmodSync(absolute, 0o600);
        } catch {
          // Best effort on platforms without POSIX permissions (e.g. Windows).
        }
      }
    },
  };
}

export function resolveDefaultSink(environment = process.env) {
  const configured = optionalValue(environment.STELLAR_BOOTSTRAP_SECRET_OUT);
  if (configured) {
    return createFileSecretSink(configured);
  }
  return null;
}

// --- Planning (pure aside from the injected public-key derivation) ---------

export async function planTopology({ environment = process.env, derivePublicKey = defaultDerivePublicKey } = {}) {
  const discovered = [];
  const missing = [];
  for (const definition of ROLE_DEFINITIONS) {
    const secret = optionalValue(environment[definition.envVar]);
    if (secret === undefined) {
      missing.push({ role: definition.role, label: definition.label, envVar: definition.envVar, mayHoldAid: definition.mayHoldAid });
      continue;
    }
    if (!STELLAR_SECRET_SEED.test(secret)) {
      // Never echo the invalid secret; identify it only by role/variable name.
      throw new BootstrapConfigurationError(
        `The secret configured in ${definition.envVar} for role ${definition.role} is not a valid Stellar secret seed.`,
      );
    }
    const publicKey = await derivePublicKey(secret);
    if (!STELLAR_PUBLIC_KEY.test(publicKey)) {
      throw new BootstrapConfigurationError(`Derived public key for role ${definition.role} is malformed.`);
    }
    discovered.push({
      role: definition.role,
      label: definition.label,
      envVar: definition.envVar,
      mayHoldAid: definition.mayHoldAid,
      publicKey,
      source: 'discovered',
    });
  }
  return { discovered, missing };
}

// Generate-and-persist the accounts that have no configured secret. The secret
// is persisted BEFORE it is used on-chain so a funded account is never lost.
export async function provisionMissingSecrets(missing, { generateKeypair = defaultGenerateKeypair, sink } = {}) {
  if (missing.length === 0) {
    return [];
  }
  if (!sink) {
    const roles = missing.map((entry) => entry.envVar).join(', ');
    throw new BootstrapConfigurationError(
      `No secret store is configured, so these roles cannot be created safely: ${roles}. ` +
        'Provide their secrets via the environment, or set STELLAR_BOOTSTRAP_SECRET_OUT to a secret-safe file.',
    );
  }
  const created = [];
  for (const entry of missing) {
    const { publicKey, secret } = await generateKeypair();
    if (!STELLAR_SECRET_SEED.test(secret) || !STELLAR_PUBLIC_KEY.test(publicKey)) {
      throw new BootstrapConfigurationError(`Generated keypair for role ${entry.role} is malformed.`);
    }
    sink.persist(entry.envVar, secret);
    created.push({
      role: entry.role,
      label: entry.label,
      envVar: entry.envVar,
      mayHoldAid: entry.mayHoldAid,
      publicKey,
      source: 'created',
    });
  }
  return created;
}

// --- Separation of duties (Req 1.4, 14.2) ----------------------------------

export function assertAccountSeparation(accounts) {
  const byPublicKey = new Map();
  for (const account of accounts) {
    const existing = byPublicKey.get(account.publicKey);
    if (existing !== undefined && existing !== account.role) {
      throw new BootstrapConfigurationError(
        `Roles ${existing} and ${account.role} must not share the same account; the topology requires logically separated accounts.`,
      );
    }
    byPublicKey.set(account.publicKey, account.role);
  }
  const seenRoles = new Set(accounts.map((account) => account.role));
  const expectedRoles = ROLE_DEFINITIONS.map((definition) => definition.role);
  const missingRoles = expectedRoles.filter((role) => !seenRoles.has(role));
  if (missingRoles.length > 0) {
    throw new BootstrapConfigurationError(`Topology is incomplete; missing roles: ${missingRoles.join(', ')}.`);
  }
}

// --- Live testnet interaction (injected fetch; skipped in dry runs) --------

export async function discoverAccountOnChain({ publicKey, horizonUrl = DEFAULT_HORIZON_URL, fetchImpl = fetch }) {
  const response = await fetchImpl(`${horizonUrl}/accounts/${publicKey}`, { method: 'GET' });
  if (response.status === 200) {
    return true;
  }
  if (response.status === 404) {
    return false;
  }
  throw new BootstrapConfigurationError(`Horizon returned an unexpected status ${response.status} while discovering an account.`);
}

export async function fundAccountOnChain({ publicKey, friendbotUrl = DEFAULT_FRIENDBOT_URL, fetchImpl = fetch }) {
  const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
  const timeout = controller ? setTimeout(() => controller.abort(), FRIENDBOT_TIMEOUT_MS) : undefined;
  try {
    const response = await fetchImpl(`${friendbotUrl}/?addr=${encodeURIComponent(publicKey)}`, {
      method: 'GET',
      signal: controller?.signal,
    });
    return response.status === 200;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function ensureAccountOnChain(account, { horizonUrl, friendbotUrl, fetchImpl } = {}) {
  const existed = await discoverAccountOnChain({ publicKey: account.publicKey, horizonUrl, fetchImpl });
  let funded = false;
  if (!existed) {
    funded = await fundAccountOnChain({ publicKey: account.publicKey, friendbotUrl, fetchImpl });
  }
  return { ...account, existed, funded, onChain: existed || funded };
}

// --- Public report (public identifiers + redacted diagnostics only) --------

export function buildPublicReport(accounts, { executed }) {
  return {
    network: STELLAR_TESTNET_NETWORK,
    networkPassphrase: STELLAR_TESTNET_NETWORK_PASSPHRASE,
    disclosure: RCPHP_DISCLOSURE,
    executed,
    accounts: accounts.map((account) => ({
      role: account.role,
      label: account.label,
      publicKey: account.publicKey,
      source: account.source,
      mayHoldAid: account.mayHoldAid,
      existed: account.existed ?? null,
      funded: account.funded ?? null,
      onChain: executed ? Boolean(account.onChain) : null,
    })),
  };
}

// --- Orchestration ---------------------------------------------------------

export async function runBootstrap({
  environment = process.env,
  execute = false,
  derivePublicKey = defaultDerivePublicKey,
  generateKeypair = defaultGenerateKeypair,
  sink,
  fetchImpl = typeof fetch === 'function' ? fetch : undefined,
  horizonUrl,
  friendbotUrl,
} = {}) {
  assertTestnetEnvironment(environment);

  const { discovered, missing } = await planTopology({ environment, derivePublicKey });
  const resolvedSink = sink === undefined ? resolveDefaultSink(environment) : sink;
  const created = await provisionMissingSecrets(missing, { generateKeypair, sink: resolvedSink });

  const accounts = [...discovered, ...created].sort(
    (left, right) =>
      ROLE_DEFINITIONS.findIndex((definition) => definition.role === left.role) -
      ROLE_DEFINITIONS.findIndex((definition) => definition.role === right.role),
  );
  assertAccountSeparation(accounts);

  let provisioned = accounts;
  if (execute) {
    const resolvedHorizon = horizonUrl ?? optionalValue(environment.STELLAR_HORIZON_URL) ?? DEFAULT_HORIZON_URL;
    const resolvedFriendbot = friendbotUrl ?? optionalValue(environment.STELLAR_FRIENDBOT_URL) ?? DEFAULT_FRIENDBOT_URL;
    if (typeof fetchImpl !== 'function') {
      throw new BootstrapConfigurationError('A fetch implementation is required to execute live testnet provisioning.');
    }
    provisioned = [];
    for (const account of accounts) {
      provisioned.push(
        await ensureAccountOnChain(account, {
          horizonUrl: resolvedHorizon,
          friendbotUrl: resolvedFriendbot,
          fetchImpl,
        }),
      );
    }
  }

  const report = buildPublicReport(provisioned, { executed: execute });
  return { accounts: provisioned, created, report };
}

export function formatReport(report) {
  const lines = ['Relief Chain testnet topology bootstrap', ''];
  lines.push(`network: ${report.network} (${report.disclosure})`);
  lines.push(report.executed ? 'mode: live provisioning' : 'mode: dry run (no network calls)');
  lines.push('');
  for (const account of report.accounts) {
    const onChain = account.onChain === null ? 'not checked' : account.onChain ? 'on-chain' : 'MISSING';
    const funded = account.funded ? ' (funded via friendbot)' : '';
    lines.push(`[${account.source.toUpperCase()}] ${account.label} <${account.role}>`);
    lines.push(`    public key: ${account.publicKey}`);
    lines.push(`    holds aid: ${account.mayHoldAid ? 'yes' : 'no'} | status: ${onChain}${funded}`);
  }
  lines.push('');
  const created = report.accounts.filter((account) => account.source === 'created').length;
  lines.push(
    created > 0
      ? `${created} account(s) created; secrets written only to the configured secret-safe store, never to this log.`
      : 'All accounts discovered from configured secrets.',
  );
  return lines.join('\n');
}

async function main() {
  const execute = process.argv.includes('--execute');
  try {
    const { report } = await runBootstrap({ execute });
    console.log(formatReport(report));
    const missingOnChain = report.executed && report.accounts.some((account) => account.onChain === false);
    process.exitCode = missingOnChain ? 1 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Bootstrap failed: ${redactDiagnostic(message)}`);
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main();
}

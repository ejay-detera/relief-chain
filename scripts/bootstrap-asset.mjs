import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    assertAccountSeparation,
    assertTestnetEnvironment,
    BootstrapConfigurationError,
    defaultDerivePublicKey,
    planTopology,
    RCPHP_DISCLOSURE,
    redactDiagnostic,
    STELLAR_PUBLIC_KEY,
    STELLAR_TESTNET_NETWORK,
    STELLAR_TESTNET_NETWORK_PASSPHRASE
} from './bootstrap-topology.mjs';

// Secret-safe, idempotent RCPHP asset-layer bootstrap.
//
// This operator command extends the account-topology bootstrap (Task 7.1) with
// the asset layer described in design.md's "Stellar Account and Asset Topology":
//
//   1. Issue ONLY the non-monetary testnet asset RCPHP from the issuer to the
//      distribution source (Req 1.2, 1.5, 6.1). RCPHP is a classic issued
//      Stellar asset (code, issuer) and is the ONLY asset this pilot issues.
//   2. Provision the authorized trustlines every aid-holding account needs so
//      that only provisioned accounts can hold RCPHP (design AUTH_REQUIRED).
//   3. Resolve and verify the canonical Stellar Asset Contract (SAC) address
//      for the configured network so the voucher rail escrows the exact asset
//      (Req 7.2). A configured SAC that disagrees with the canonical derivation
//      is a fail-closed error.
//   4. Sponsor the trustline reserves through the dedicated fee/reserve sponsor
//      so beneficiaries and merchants never have to acquire XLM (Req 14.1,
//      14.2, 14.4, 14.7).
//
// Regulated live-PHP asset configuration is NEVER hard-coded here. It must be
// obtained from a regulated-partner adapter (Req 1.6); the pilot adapter below
// resolves RCPHP testnet identifiers only and fails closed on any live-asset
// request.
//
// The pure logic (issuance planning, trustline planning, SAC resolution and
// verification, sponsor reserve planning, redaction) is decoupled from live
// Horizon/RPC/SDK access via injected dependencies, so it is fully
// unit-testable offline. Live provisioning is injected; when signer and network
// access are unavailable the command reports an explicit, redacted blocker
// rather than fabricating success.
//
// _Requirements: 1.2, 1.5, 1.6, 6.1, 7.2, 14.1, 14.2, 14.4, 14.7_

export const RCPHP_ASSET_CODE = 'RCPHP';
export const STELLAR_CONTRACT_ID = /^C[A-Z2-7]{55}$/;

// Stellar reserve accounting is denominated in stroops (1 XLM = 10,000,000
// stroops). The base reserve is 0.5 XLM; each additional ledger entry such as a
// trustline costs one base reserve.
export const XLM_STROOPS_PER_UNIT = 10_000_000n;
export const BASE_RESERVE_STROOPS = 5_000_000n; // 0.5 XLM
export const TRUSTLINE_RESERVE_STROOPS = BASE_RESERVE_STROOPS;
export const INT64_MAX_STROOPS = 9_223_372_036_854_775_807n;

// A conservative non-monetary default supply: 100,000 RCPHP in stroops. RCPHP
// has no real value; this is only a testnet ceiling for pilot distributions.
export const DEFAULT_ISSUANCE_STROOPS = 1_000_000_000_000n; // 100,000.0000000 RCPHP

const optionalValue = (value) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed ? trimmed : undefined;
};

// --- Regulated-partner asset adapter (Req 1.6) -----------------------------
//
// The ONLY place asset identifiers are resolved. The pilot adapter resolves the
// non-monetary RCPHP testnet asset and fails closed on any live-PHP request so
// that regulated issuer/redemption configuration can never be hard-coded into a
// client build. A future production adapter would implement `resolveLiveAsset`
// by calling the regulated partner.

export function createPilotAssetAdapter({ issuer } = {}) {
  return Object.freeze({
    kind: 'pilot-testnet',
    resolveIssuedAsset() {
      if (!STELLAR_PUBLIC_KEY.test(String(issuer ?? ''))) {
        throw new BootstrapConfigurationError(
          'The RCPHP issuer is not a valid Stellar public key; run the topology bootstrap first.',
        );
      }
      return Object.freeze({
        code: RCPHP_ASSET_CODE,
        issuer,
        network: STELLAR_TESTNET_NETWORK,
        networkPassphrase: STELLAR_TESTNET_NETWORK_PASSPHRASE,
        hasMonetaryValue: false,
        disclosure: RCPHP_DISCLOSURE,
      });
    },
    resolveLiveAsset() {
      throw new BootstrapConfigurationError(
        'Live PHP asset configuration must be obtained from a regulated-partner adapter, ' +
          'not hard-coded pilot values. The pilot issues only the non-monetary RCPHP testnet asset.',
      );
    },
  });
}

// --- Identity verification (verify issuer/code/network before use) ---------

export function verifyAssetIdentity({ code, issuer, networkPassphrase } = {}) {
  if (code !== RCPHP_ASSET_CODE) {
    throw new BootstrapConfigurationError(
      `Only the ${RCPHP_ASSET_CODE} testnet asset may be issued by this pilot.`,
    );
  }
  if (!STELLAR_PUBLIC_KEY.test(String(issuer ?? ''))) {
    throw new BootstrapConfigurationError('The RCPHP issuer must be a valid Stellar public account ID.');
  }
  const passphrase = optionalValue(networkPassphrase) ?? STELLAR_TESTNET_NETWORK_PASSPHRASE;
  if (passphrase !== STELLAR_TESTNET_NETWORK_PASSPHRASE) {
    throw new BootstrapConfigurationError('The configured network passphrase is not Stellar testnet.');
  }
  return Object.freeze({ code, issuer, networkPassphrase: passphrase });
}

// --- SAC resolution and verification (Req 7.2) -----------------------------
//
// The canonical SAC address is a deterministic function of (code, issuer,
// networkPassphrase). Derivation is pure cryptography and needs no network, so
// it works offline; the SDK dependency is injected for testability.

export async function defaultDeriveContractId(code, issuer, networkPassphrase) {
  const { Asset } = await import('@stellar/stellar-sdk');
  return new Asset(code, issuer).contractId(networkPassphrase);
}

export async function resolveStellarAssetContractId({
  code,
  issuer,
  networkPassphrase,
  deriveContractId = defaultDeriveContractId,
} = {}) {
  const identity = verifyAssetIdentity({ code, issuer, networkPassphrase });
  const contractId = await deriveContractId(identity.code, identity.issuer, identity.networkPassphrase);
  if (!STELLAR_CONTRACT_ID.test(String(contractId ?? ''))) {
    throw new BootstrapConfigurationError('The derived RCPHP Stellar Asset Contract address is malformed.');
  }
  return contractId;
}

// Verify a configured/expected SAC matches the canonical derivation. A mismatch
// means the configured SAC does not belong to (code, issuer, network) and must
// be rejected before any escrow references it.
export async function verifyStellarAssetContractId({
  code,
  issuer,
  networkPassphrase,
  expected,
  deriveContractId = defaultDeriveContractId,
} = {}) {
  if (!STELLAR_CONTRACT_ID.test(String(expected ?? ''))) {
    throw new BootstrapConfigurationError('The configured RCPHP SAC address is not a valid Stellar contract ID.');
  }
  const canonical = await resolveStellarAssetContractId({ code, issuer, networkPassphrase, deriveContractId });
  if (canonical !== expected) {
    // Identify only by role; never echo secrets. Public identifiers are safe.
    throw new BootstrapConfigurationError(
      'The configured RCPHP SAC address does not match the canonical address for this issuer/code/network.',
    );
  }
  return canonical;
}

// --- Stroop/amount helpers -------------------------------------------------

export function parseStroops(value, { field = 'amount' } = {}) {
  const raw = typeof value === 'bigint' ? value.toString() : String(value ?? '').trim();
  if (!/^\d+$/.test(raw)) {
    throw new BootstrapConfigurationError(`The ${field} must be a non-negative integer number of stroops.`);
  }
  const stroops = BigInt(raw);
  if (stroops <= 0n) {
    throw new BootstrapConfigurationError(`The ${field} must be a positive number of stroops.`);
  }
  if (stroops > INT64_MAX_STROOPS) {
    throw new BootstrapConfigurationError(`The ${field} exceeds the maximum Stellar amount.`);
  }
  return stroops;
}

// Convert integer stroops to the classic decimal amount string (7 dp) that the
// Stellar payment operation expects. Decimal formatting happens only at this
// on-chain boundary; planning keeps integer stroops.
export function stroopsToClassicAmount(stroops) {
  const value = typeof stroops === 'bigint' ? stroops : parseStroops(stroops);
  const whole = value / XLM_STROOPS_PER_UNIT;
  const fraction = (value % XLM_STROOPS_PER_UNIT).toString().padStart(7, '0').replace(/0+$/, '');
  return fraction.length > 0 ? `${whole}.${fraction}` : `${whole}`;
}

// --- Issuance planning (Req 1.2, 1.5, 6.1) ---------------------------------
//
// RCPHP is created by a classic payment from the issuer to the distribution
// source. It is the only asset issued; native XLM is never substituted for aid.

export function planIssuance({ issuer, distribution, amountStroops = DEFAULT_ISSUANCE_STROOPS } = {}) {
  if (!STELLAR_PUBLIC_KEY.test(String(issuer ?? ''))) {
    throw new BootstrapConfigurationError('The issuer must be a valid Stellar public account ID.');
  }
  if (!STELLAR_PUBLIC_KEY.test(String(distribution ?? ''))) {
    throw new BootstrapConfigurationError('The distribution source must be a valid Stellar public account ID.');
  }
  if (issuer === distribution) {
    throw new BootstrapConfigurationError('The issuer and distribution source must be logically separated accounts.');
  }
  const stroops = parseStroops(amountStroops, { field: 'RCPHP issuance amount' });
  return Object.freeze({
    type: 'issue_rcphp',
    from: issuer,
    to: distribution,
    asset: Object.freeze({ code: RCPHP_ASSET_CODE, issuer }),
    amountStroops: stroops.toString(),
    amount: stroopsToClassicAmount(stroops),
    // The distribution trustline must exist and be authorized before issuance.
    requiresAuthorizedTrustline: distribution,
  });
}

// --- Trustline planning ----------------------------------------------------
//
// Every account that may hold RCPHP needs an authorized trustline. The issuer
// never trustlines its own asset; the sponsor holds XLM only; the deployer and
// reconciler hold no aid. `mayHoldAid` in the topology encodes exactly this.

export function planTrustlines({ accounts, issuer } = {}) {
  if (!Array.isArray(accounts)) {
    throw new BootstrapConfigurationError('A topology account list is required to plan trustlines.');
  }
  const asset = Object.freeze({ code: RCPHP_ASSET_CODE, issuer });
  const trustlines = accounts
    .filter((account) => account.mayHoldAid === true && account.role !== 'issuer')
    .map((account) =>
      Object.freeze({
        role: account.role,
        publicKey: account.publicKey,
        asset,
      }),
    );
  if (trustlines.length === 0) {
    throw new BootstrapConfigurationError('No aid-holding accounts were found; run the topology bootstrap first.');
  }
  return trustlines;
}

// The issuer sets AUTH_REQUIRED so only provisioned accounts hold RCPHP; it does
// NOT enable clawback because confirmed unrestricted cash is final (Req 6.5).
export function planIssuerFlags() {
  return Object.freeze({
    account: 'issuer',
    setFlags: Object.freeze(['AUTH_REQUIRED']),
    clearFlags: Object.freeze([]),
    clawbackEnabled: false,
  });
}

// Under AUTH_REQUIRED the issuer must authorize each holder trustline.
export function planTrustlineAuthorization({ issuer, trustlines, authRequired = true } = {}) {
  if (!STELLAR_PUBLIC_KEY.test(String(issuer ?? ''))) {
    throw new BootstrapConfigurationError('The issuer must be a valid Stellar public account ID.');
  }
  if (!authRequired) {
    return [];
  }
  return (trustlines ?? []).map((trustline) =>
    Object.freeze({
      type: 'authorize_trustline',
      issuer,
      holder: trustline.publicKey,
      role: trustline.role,
      asset: trustline.asset,
      authorize: true,
    }),
  );
}

// --- Sponsor reserve planning (Req 14.1, 14.2, 14.4, 14.7) -----------------
//
// The dedicated fee/reserve sponsor covers each holder's trustline reserve so
// beneficiaries and merchants never buy XLM to participate. The sponsor must be
// separate from every aid-bearing and issuing account.

export function assertSponsorSeparation({ sponsor, accounts } = {}) {
  if (!STELLAR_PUBLIC_KEY.test(String(sponsor ?? ''))) {
    throw new BootstrapConfigurationError('The fee/reserve sponsor must be a valid Stellar public account ID.');
  }
  for (const account of accounts ?? []) {
    if (account.role !== 'sponsor' && account.publicKey === sponsor) {
      throw new BootstrapConfigurationError(
        `The sponsor account must be separate from the ${account.role} account (Req 14.2).`,
      );
    }
  }
}

export function planSponsorReserves({ sponsor, trustlines, accounts } = {}) {
  assertSponsorSeparation({ sponsor, accounts });
  const sponsored = (trustlines ?? []).map((trustline) =>
    Object.freeze({
      type: 'sponsor_trustline_reserve',
      sponsor,
      beneficiary: trustline.publicKey,
      role: trustline.role,
      reserveStroops: TRUSTLINE_RESERVE_STROOPS.toString(),
    }),
  );
  const totalStroops = sponsored.reduce((sum, entry) => sum + BigInt(entry.reserveStroops), 0n);
  return Object.freeze({
    sponsor,
    sponsored,
    totalReserveStroops: totalStroops.toString(),
    totalReserveXlm: stroopsToClassicAmount(totalStroops),
  });
}

// --- Full asset plan (pure) ------------------------------------------------

export function planAssetBootstrap({ accounts, sac, amountStroops } = {}) {
  assertAccountSeparation(accounts);
  const byRole = new Map(accounts.map((account) => [account.role, account]));
  const issuerAccount = byRole.get('issuer');
  const distributionAccount = byRole.get('distribution');
  const sponsorAccount = byRole.get('sponsor');
  if (!issuerAccount || !distributionAccount || !sponsorAccount) {
    throw new BootstrapConfigurationError(
      'The issuer, distribution, and sponsor accounts must all be present; run the topology bootstrap first.',
    );
  }
  const issuer = issuerAccount.publicKey;
  const asset = createPilotAssetAdapter({ issuer }).resolveIssuedAsset();

  const issuerFlags = planIssuerFlags();
  const trustlines = planTrustlines({ accounts, issuer });
  const authorization = planTrustlineAuthorization({ issuer, trustlines, authRequired: true });
  const issuance = planIssuance({ issuer, distribution: distributionAccount.publicKey, amountStroops });
  const sponsorReserves = planSponsorReserves({ sponsor: sponsorAccount.publicKey, trustlines, accounts });

  return Object.freeze({
    asset,
    sac: sac ?? null,
    issuerFlags,
    trustlines,
    authorization,
    issuance,
    sponsorReserves,
  });
}

// --- Public report (public identifiers + redacted diagnostics only) --------

export function buildAssetReport(plan, { executed, steps = [] } = {}) {
  return {
    network: STELLAR_TESTNET_NETWORK,
    networkPassphrase: STELLAR_TESTNET_NETWORK_PASSPHRASE,
    disclosure: RCPHP_DISCLOSURE,
    executed,
    asset: {
      code: plan.asset.code,
      issuer: plan.asset.issuer,
      stellarAssetContractId: plan.sac,
      hasMonetaryValue: plan.asset.hasMonetaryValue,
    },
    issuerFlags: plan.issuerFlags,
    issuance: {
      from: plan.issuance.from,
      to: plan.issuance.to,
      amount: plan.issuance.amount,
      amountStroops: plan.issuance.amountStroops,
    },
    trustlines: plan.trustlines.map((trustline) => ({ role: trustline.role, publicKey: trustline.publicKey })),
    authorization: plan.authorization.map((entry) => ({ role: entry.role, holder: entry.holder })),
    sponsorReserves: {
      sponsor: plan.sponsorReserves.sponsor,
      count: plan.sponsorReserves.sponsored.length,
      totalReserveStroops: plan.sponsorReserves.totalReserveStroops,
      totalReserveXlm: plan.sponsorReserves.totalReserveXlm,
    },
    steps: steps.map((step) => ({ step: step.step, status: step.status })),
  };
}

export function formatAssetReport(report) {
  const lines = ['Relief Chain RCPHP asset bootstrap', ''];
  lines.push(`network: ${report.network} (${report.disclosure})`);
  lines.push(report.executed ? 'mode: live provisioning' : 'mode: dry run (no network calls)');
  lines.push('');
  lines.push(`asset: ${report.asset.code} (no real monetary value)`);
  lines.push(`    issuer:     ${report.asset.issuer}`);
  lines.push(`    SAC:        ${report.asset.stellarAssetContractId ?? 'not resolved'}`);
  lines.push(`    issuer flags: set ${report.issuerFlags.setFlags.join(', ') || 'none'} (clawback ${report.issuerFlags.clawbackEnabled ? 'ON' : 'off'})`);
  lines.push('');
  lines.push(`issuance: ${report.issuance.amount} ${report.asset.code}`);
  lines.push(`    from ${report.issuance.from}`);
  lines.push(`    to   ${report.issuance.to}`);
  lines.push('');
  lines.push(`trustlines (${report.trustlines.length}), authorized: ${report.authorization.length}`);
  for (const trustline of report.trustlines) {
    lines.push(`    [${trustline.role}] ${trustline.publicKey}`);
  }
  lines.push('');
  lines.push(
    `sponsor: ${report.sponsorReserves.sponsor} covers ${report.sponsorReserves.count} trustline reserve(s) = ${report.sponsorReserves.totalReserveXlm} XLM`,
  );
  if (report.steps.length > 0) {
    lines.push('');
    lines.push('live steps:');
    for (const step of report.steps) {
      lines.push(`    ${step.status === 'ok' ? '[OK]' : '[FAILED]'} ${step.step}`);
    }
  }
  return lines.join('\n');
}

// --- Live provisioning (injected; reports blockers when unavailable) -------
//
// Live provisioning requires an authorized signer and reachable testnet
// endpoints, neither of which is guaranteed in an offline development
// environment. The default provisioner therefore reports an explicit,
// redacted blocker; a caller with signer/network access injects a real
// provisioner. This keeps the command honest: it never fabricates success.

export async function defaultProvisionOnChain() {
  throw new BootstrapConfigurationError(
    'Live RCPHP provisioning requires an authorized testnet signer and reachable Horizon/RPC endpoints, ' +
      'which are unavailable in this environment. Re-run --execute in an authorized environment or inject a provisioner.',
  );
}

// --- Orchestration ---------------------------------------------------------

export async function runAssetBootstrap({
  environment = process.env,
  execute = false,
  derivePublicKey = defaultDerivePublicKey,
  deriveContractId = defaultDeriveContractId,
  provisionOnChain = defaultProvisionOnChain,
  amountStroops,
} = {}) {
  assertTestnetEnvironment(environment);

  // Discover the already-provisioned topology (public keys only). The asset
  // layer runs after Task 7.1, so any missing role is an actionable blocker.
  const { discovered, missing } = await planTopology({ environment, derivePublicKey });
  if (missing.length > 0) {
    const roles = missing.map((entry) => entry.envVar).join(', ');
    throw new BootstrapConfigurationError(
      `The account topology is incomplete; these roles are not configured: ${roles}. Run the topology bootstrap (Task 7.1) first.`,
    );
  }
  assertAccountSeparation(discovered);

  const issuerAccount = discovered.find((account) => account.role === 'issuer');
  const resolvedAmount =
    amountStroops ?? optionalValue(environment.STELLAR_RCPHP_ISSUANCE_STROOPS) ?? DEFAULT_ISSUANCE_STROOPS;

  // Resolve and verify the canonical SAC. If a SAC is already configured, it
  // must match the canonical derivation exactly (fail closed on a mismatch).
  const configuredSac = optionalValue(environment.STELLAR_RCPHP_SAC_ID);
  let sac;
  if (configuredSac) {
    sac = await verifyStellarAssetContractId({
      code: RCPHP_ASSET_CODE,
      issuer: issuerAccount.publicKey,
      networkPassphrase: STELLAR_TESTNET_NETWORK_PASSPHRASE,
      expected: configuredSac,
      deriveContractId,
    });
  } else {
    sac = await resolveStellarAssetContractId({
      code: RCPHP_ASSET_CODE,
      issuer: issuerAccount.publicKey,
      networkPassphrase: STELLAR_TESTNET_NETWORK_PASSPHRASE,
      deriveContractId,
    });
  }

  const plan = planAssetBootstrap({ accounts: discovered, sac, amountStroops: resolvedAmount });

  let steps = [];
  if (execute) {
    steps = await provisionOnChain({ plan, environment });
    if (!Array.isArray(steps)) {
      throw new BootstrapConfigurationError('The provisioner must return an array of step results.');
    }
  }

  const report = buildAssetReport(plan, { executed: execute, steps });
  return { plan, report, steps };
}

async function main() {
  const execute = process.argv.includes('--execute');
  try {
    const { report } = await runAssetBootstrap({ execute });
    console.log(formatAssetReport(report));
    const failed = report.steps.some((step) => step.status !== 'ok');
    process.exitCode = failed ? 1 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Asset bootstrap failed: ${redactDiagnostic(message)}`);
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main();
}

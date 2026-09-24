// Provisions STELLAR_CONTRACT_ADMIN_SECRET, which bootstrap-topology.mjs does
// NOT create (build-reliefchain.md §8 item 9) even though the Edge signing code
// in supabase/functions/_shared/edge.ts expects it for contract operations.
//
// Idempotent and secret-safe:
//   - If STELLAR_CONTRACT_ADMIN_SECRET is already in the environment, it is
//     DISCOVERED: the public key is derived and the account funded if missing.
//   - Otherwise a keypair is CREATED and the seed appended to the file named by
//     STELLAR_BOOTSTRAP_SECRET_OUT, mode 0600.
//   - Only the PUBLIC key is ever printed.
//
// Usage:
//   node --env-file=.env.bootstrap.local .\scripts\provision-contract-admin.mjs
//   node --env-file=.env.bootstrap.local .\scripts\provision-contract-admin.mjs --execute

import { appendFileSync, chmodSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Keypair } from '@stellar/stellar-sdk';

const ENV_VAR = 'STELLAR_CONTRACT_ADMIN_SECRET';
const FRIENDBOT = process.env.STELLAR_FRIENDBOT_URL || 'https://friendbot.stellar.org';
const HORIZON = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';

const execute = process.argv.includes('--execute');

if ((process.env.STELLAR_NETWORK || 'testnet') !== 'testnet') {
  console.error('Refusing to run: STELLAR_NETWORK is not testnet.');
  process.exit(1);
}
if ((process.env.STELLAR_MAINNET_ENABLED || 'false').toLowerCase() !== 'false') {
  console.error('Refusing to run: mainnet is hard-disabled for the pilot.');
  process.exit(1);
}

const existing = (process.env[ENV_VAR] || '').trim();
let keypair;
let source;

if (existing) {
  if (!/^S[A-Z2-7]{55}$/.test(existing)) {
    console.error(`${ENV_VAR} is set but is not a valid Stellar secret seed.`);
    process.exit(1);
  }
  keypair = Keypair.fromSecret(existing);
  source = 'DISCOVERED';
} else {
  keypair = Keypair.random();
  source = 'CREATED';

  const sinkPath = (process.env.STELLAR_BOOTSTRAP_SECRET_OUT || '').trim();
  if (!sinkPath) {
    console.error(`No secret store configured. Set STELLAR_BOOTSTRAP_SECRET_OUT before creating ${ENV_VAR}.`);
    process.exit(1);
  }
  if (!execute) {
    console.log(`[DRY RUN] would CREATE ${ENV_VAR} and append it to ${sinkPath}`);
    console.log(`          public key: ${keypair.publicKey()}`);
    console.log('\nRe-run with --execute to persist and fund.');
    process.exit(0);
  }

  const absolute = resolve(process.cwd(), sinkPath);
  const isNew = !existsSync(absolute);
  appendFileSync(absolute, `${ENV_VAR}=${keypair.secret()}\n`, { encoding: 'utf8', mode: 0o600 });
  if (isNew) {
    try { chmodSync(absolute, 0o600); } catch { /* Windows has no POSIX modes */ }
  }
  console.log(`[CREATED] ${ENV_VAR} appended to ${sinkPath} (value not shown)`);
}

const publicKey = keypair.publicKey();
console.log(`[${source}] Contract admin`);
console.log(`    public key: ${publicKey}`);

if (!execute) {
  console.log('\nDry run: account funding skipped. Re-run with --execute.');
  process.exit(0);
}

const accountUrl = `${HORIZON}/accounts/${publicKey}`;
let onChain = false;
try {
  const res = await fetch(accountUrl);
  onChain = res.ok;
} catch { /* treat as absent */ }

if (onChain) {
  console.log('    status: already on-chain');
} else {
  const res = await fetch(`${FRIENDBOT}?addr=${encodeURIComponent(publicKey)}`);
  if (!res.ok) {
    console.error(`    status: FRIENDBOT FAILED (${res.status})`);
    process.exit(1);
  }
  console.log('    status: on-chain (funded via friendbot)');
}

console.log('\nNext: set it as a Supabase Function secret (never a client env var):');
console.log(`  npx supabase secrets set ${ENV_VAR}=<seed from .env.bootstrap.local>`);

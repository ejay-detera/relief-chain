import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Secret-safe operator utility: transfer already-issued RCPHP between two
// aid-holding topology accounts (e.g. distribution -> organization_treasury, or
// distribution -> beneficiary, or beneficiary -> merchant).
//
// This is a plain classic Stellar payment of the RCPHP asset. Both accounts
// must already have an authorized RCPHP trustline (the asset bootstrap does
// this for every aid-holding role). Secret seeds are read only from the
// environment and never logged.
//
// Usage (secrets must already be loaded into the environment):
//   node ./scripts/seed-treasury.mjs <fromRole> <toRole> <amount>
//   node ./scripts/seed-treasury.mjs distribution organization_treasury 50000
//   node ./scripts/seed-treasury.mjs distribution beneficiary 500
//   node ./scripts/seed-treasury.mjs beneficiary merchant 200
//
// Backwards-compatible: with two args it defaults fromRole to `distribution`:
//   node ./scripts/seed-treasury.mjs organization_treasury 50000

import {
    DEFAULT_HORIZON_URL,
    ROLE_DEFINITIONS,
    STELLAR_PUBLIC_KEY,
    STELLAR_SECRET_SEED,
    STELLAR_TESTNET_NETWORK_PASSPHRASE,
    redactDiagnostic,
} from './bootstrap-topology.mjs';

const RCPHP_ASSET_CODE = 'RCPHP';

function requireRoleSecret(role) {
  const definition = ROLE_DEFINITIONS.find((entry) => entry.role === role);
  const secret = definition ? (process.env[definition.envVar] ?? '').trim() : '';
  if (!STELLAR_SECRET_SEED.test(secret)) {
    throw new Error(`A valid secret seed for role ${role} is required; run the topology bootstrap first.`);
  }
  return secret;
}

async function main() {
  const positional = process.argv.slice(2);
  // Two-arg form keeps the original behaviour: <toRole> <amount> from distribution.
  const [fromRole, toRole, amount] =
    positional.length >= 3
      ? positional
      : ['distribution', positional[0] ?? 'organization_treasury', positional[1] ?? '50000'];

  if (!/^\d+(\.\d{1,7})?$/.test(amount)) {
    throw new Error('Amount must be a positive decimal with up to 7 places.');
  }
  if (fromRole === toRole) {
    throw new Error('The source and destination roles must differ.');
  }

  const { Horizon, Keypair, TransactionBuilder, Operation, Asset, BASE_FEE } = await import('@stellar/stellar-sdk');
  const server = new Horizon.Server(process.env.STELLAR_HORIZON_URL?.trim() || DEFAULT_HORIZON_URL);
  const networkPassphrase = STELLAR_TESTNET_NETWORK_PASSPHRASE;

  const fromKeypair = Keypair.fromSecret(requireRoleSecret(fromRole));
  const issuerPublicKey = Keypair.fromSecret(requireRoleSecret('issuer')).publicKey();
  const toPublicKey = Keypair.fromSecret(requireRoleSecret(toRole)).publicKey();
  if (!STELLAR_PUBLIC_KEY.test(toPublicKey)) {
    throw new Error(`Destination role ${toRole} did not resolve to a valid public key.`);
  }

  const asset = new Asset(RCPHP_ASSET_CODE, issuerPublicKey);
  const source = await server.loadAccount(fromKeypair.publicKey());
  const transaction = new TransactionBuilder(source, {
    fee: String(BASE_FEE * 100),
    networkPassphrase,
  })
    .addOperation(Operation.payment({ destination: toPublicKey, asset, amount }))
    .setTimeout(180)
    .build();
  transaction.sign(fromKeypair);
  const result = await server.submitTransaction(transaction);

  const destination = await server.loadAccount(toPublicKey);
  const line = destination.balances.find(
    (balance) => balance.asset_code === RCPHP_ASSET_CODE && balance.asset_issuer === issuerPublicKey,
  );
  console.log(`Transferred ${amount} ${RCPHP_ASSET_CODE}: ${fromRole} -> ${toRole}`);
  console.log(`  from:        ${fromKeypair.publicKey()}`);
  console.log(`  destination: ${toPublicKey}`);
  console.log(`  tx hash:     ${result.hash}`);
  console.log(`  new balance: ${line ? line.balance : 'unknown'} ${RCPHP_ASSET_CODE} (${toRole})`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main().catch((error) => {
    console.error(`seed-treasury failed: ${redactDiagnostic(error instanceof Error ? error.message : String(error))}`);
    process.exitCode = 1;
  });
}

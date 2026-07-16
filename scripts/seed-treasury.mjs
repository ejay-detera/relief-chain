import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Secret-safe operator utility: transfer already-issued RCPHP from the
// distribution source into another aid-holding topology account (e.g. the
// organization treasury) so an org/LGU has a spendable budget.
//
// This is a plain classic Stellar payment of the RCPHP asset. Both accounts
// must already have an authorized RCPHP trustline (the asset bootstrap does
// this). Secret seeds are read only from the environment and never logged.
//
// Usage (secrets must already be loaded into the environment):
//   node ./scripts/seed-treasury.mjs <toRole> <amount>
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
  const toRole = process.argv[2] ?? 'organization_treasury';
  const amount = process.argv[3] ?? '50000';
  if (!/^\d+(\.\d{1,7})?$/.test(amount)) {
    throw new Error('Amount must be a positive decimal with up to 7 places.');
  }

  const { Horizon, Keypair, TransactionBuilder, Operation, Asset, BASE_FEE } = await import('@stellar/stellar-sdk');
  const server = new Horizon.Server(process.env.STELLAR_HORIZON_URL?.trim() || DEFAULT_HORIZON_URL);
  const networkPassphrase = STELLAR_TESTNET_NETWORK_PASSPHRASE;

  const distributionKeypair = Keypair.fromSecret(requireRoleSecret('distribution'));
  const issuerKeypair = Keypair.fromSecret(requireRoleSecret('issuer'));
  const toSecret = requireRoleSecret(toRole);
  const toPublicKey = Keypair.fromSecret(toSecret).publicKey();
  if (!STELLAR_PUBLIC_KEY.test(toPublicKey)) {
    throw new Error(`Destination role ${toRole} did not resolve to a valid public key.`);
  }

  const asset = new Asset(RCPHP_ASSET_CODE, issuerKeypair.publicKey());
  const source = await server.loadAccount(distributionKeypair.publicKey());
  const transaction = new TransactionBuilder(source, {
    fee: String(BASE_FEE * 100),
    networkPassphrase,
  })
    .addOperation(Operation.payment({ destination: toPublicKey, asset, amount }))
    .setTimeout(180)
    .build();
  transaction.sign(distributionKeypair);
  const result = await server.submitTransaction(transaction);

  const destination = await server.loadAccount(toPublicKey);
  const line = destination.balances.find(
    (balance) => balance.asset_code === RCPHP_ASSET_CODE && balance.asset_issuer === issuerKeypair.publicKey(),
  );
  console.log(`Transferred ${amount} ${RCPHP_ASSET_CODE} to ${toRole}`);
  console.log(`  destination:   ${toPublicKey}`);
  console.log(`  tx hash:       ${result.hash}`);
  console.log(`  new balance:   ${line ? line.balance : 'unknown'} ${RCPHP_ASSET_CODE}`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main().catch((error) => {
    console.error(`seed-treasury failed: ${redactDiagnostic(error instanceof Error ? error.message : String(error))}`);
    process.exitCode = 1;
  });
}

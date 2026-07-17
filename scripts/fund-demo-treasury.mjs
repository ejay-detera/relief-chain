// Development/operator-only helper to fund the organization treasury with RCPHP.
//
// Usage:
//   node ./scripts/fund-demo-treasury.mjs --amount 1000
//
// Note: Amount is in RCPHP (e.g., 1000 = 1000.0000000 RCPHP).

import { Keypair, Horizon, Asset, TransactionBuilder, Networks, BASE_FEE, Operation } from '@stellar/stellar-sdk';
import fs from 'node:fs';
import path from 'node:path';

// Load env file if exists
try {
  const envPath = path.resolve('supabase/functions/.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
      const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)$/);
      if (match) {
        const key = match[1].trim();
        let val = match[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.substring(1, val.length - 1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
} catch (e) {
  console.warn('Could not read env file:', e);
}

const networkPassphrase = process.env.STELLAR_NETWORK_PASSPHRASE || Networks.TESTNET;
if (networkPassphrase === Networks.PUBLIC) {
  throw new Error('This script is strictly for Testnet. Mainnet is rejected.');
}

const horizonUrl = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const server = new Horizon.Server(horizonUrl);

const distributionSecret = process.env.STELLAR_DISTRIBUTION_SECRET?.trim();
const treasurySecret = process.env.STELLAR_ORGANIZATION_TREASURY_SECRET?.trim();

if (!distributionSecret || !treasurySecret) {
  throw new Error(
    'Missing required Stellar secrets.\n' +
    'Please ensure STELLAR_DISTRIBUTION_SECRET and STELLAR_ORGANIZATION_TREASURY_SECRET are set.'
  );
}

const distributionKeypair = Keypair.fromSecret(distributionSecret);
const treasuryKeypair = Keypair.fromSecret(treasurySecret);

const ASSET_CODE = 'RCPHP';
const ASSET_ISSUER = 'GBC6HZTIUH6C3KQR5D3NOS2PJ7YKQJQNAQGAO3WO4PICJEXPAPGRKSQ7';
const rcphpAsset = new Asset(ASSET_CODE, ASSET_ISSUER);

// Parse arguments
let amount = '1000';
const args = process.argv.slice(2);
const amountIdx = args.indexOf('--amount');
if (amountIdx !== -1 && args.length > amountIdx + 1) {
  amount = args[amountIdx + 1];
}

async function main() {
  console.log(`Funding Treasury with ${amount} ${ASSET_CODE}...`);
  console.log(`From Distribution: ${distributionKeypair.publicKey()}`);
  console.log(`To Treasury:       ${treasuryKeypair.publicKey()}`);

  // 1. Verify accounts exist on the network
  let treasuryAccount;
  try {
    treasuryAccount = await server.loadAccount(treasuryKeypair.publicKey());
  } catch (e) {
    throw new Error(`Treasury account not found on network. Ensure it is funded with XLM first. (${e.message})`);
  }

  let distributionAccount;
  try {
    distributionAccount = await server.loadAccount(distributionKeypair.publicKey());
  } catch (e) {
    throw new Error(`Distribution account not found on network. (${e.message})`);
  }

  // 2. Verify trustline on treasury
  const hasTrustline = treasuryAccount.balances.some(
    (b) => b.asset_type !== 'native' && b.asset_code === ASSET_CODE && b.asset_issuer === ASSET_ISSUER
  );

  if (!hasTrustline) {
    console.log('Treasury missing trustline. Adding trustline first...');
    const trustTx = new TransactionBuilder(treasuryAccount, {
      fee: BASE_FEE,
      networkPassphrase,
    })
      .addOperation(
        Operation.changeTrust({
          asset: rcphpAsset,
        })
      )
      .setTimeout(30)
      .build();

    trustTx.sign(treasuryKeypair);
    
    console.log('Submitting trustline transaction...');
    const trustRes = await server.submitTransaction(trustTx);
    console.log(`Trustline transaction successful: ${trustRes.hash}`);
    
    // Reload distribution account since sequence number doesn't matter for treasury now,
    // but we want to make sure we're clean.
  } else {
    console.log('Trustline already exists.');
  }

  // 3. Transfer RCPHP
  const tx = new TransactionBuilder(distributionAccount, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      Operation.payment({
        destination: treasuryKeypair.publicKey(),
        asset: rcphpAsset,
        amount: amount,
      })
    )
    .setTimeout(30)
    .build();

  tx.sign(distributionKeypair);

  console.log('Submitting payment transaction...');
  try {
    const res = await server.submitTransaction(tx);
    console.log(`Payment transaction successful! Hash: ${res.hash}`);
  } catch (e) {
    console.error('Payment failed:');
    if (e.response && e.response.data && e.response.data.extras) {
      console.error(JSON.stringify(e.response.data.extras.result_codes, null, 2));
    } else {
      console.error(e.message);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Funding failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

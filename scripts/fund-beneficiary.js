import { Keypair, Asset, Operation, TransactionBuilder, Networks, Horizon } from '@stellar/stellar-sdk';
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
        process.env[key] = val;
      }
    }
  }
} catch (e) {
  console.warn('Could not read env file:', e);
}

// Load bootstrap env
try {
  const envPath = path.resolve('.env.bootstrap.local');
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
        process.env[key] = val;
      }
    }
  }
} catch (e) {
  console.warn('Could not read bootstrap env file:', e);
}

const horizonUrl = 'https://horizon-testnet.stellar.org';
const server = new Horizon.Server(horizonUrl);

let programTreasurySecret = process.env.STELLAR_PROGRAM_TREASURY_SECRET?.trim();
const issuerPublicKey = process.env.STELLAR_RCPHP_ISSUER?.trim();
const beneficiaryWallet = 'GBBWRJELHDPMFPAB3PJIIOSSXJ2A6URZMGK6L6UPHBS7KKAZ7373TDEQ';

if (!programTreasurySecret) {
  // Fallback to cash program treasury if specific program treasury is not set
  programTreasurySecret = process.env.STELLAR_CASH_PROGRAM_TREASURY_SECRET?.trim();
}
if (!programTreasurySecret || !issuerPublicKey) {
  throw new Error('Neither STELLAR_PROGRAM_TREASURY_SECRET nor STELLAR_CASH_PROGRAM_TREASURY_SECRET is set, or STELLAR_RCPHP_ISSUER is missing');
}

const programKeypair = Keypair.fromSecret(programTreasurySecret);

async function main() {
  console.log(`Loading program treasury account: ${programKeypair.publicKey()}...`);
  const account = await server.loadAccount(programKeypair.publicKey());

  const asset = new Asset('RCPHP', issuerPublicKey);

  console.log(`Building payment of 1,000 RCPHP to ${beneficiaryWallet}...`);
  const tx = new TransactionBuilder(account, {
    fee: '100000',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.payment({
        destination: beneficiaryWallet,
        asset,
        amount: '1000.0000000',
      })
    )
    .setTimeout(180)
    .build();

  tx.sign(programKeypair);

  console.log("Submitting transaction on-chain...");
  const result = await server.submitTransaction(tx);
  console.log("Submitted successfully! Hash:", result.hash);
}

main().catch(console.error);

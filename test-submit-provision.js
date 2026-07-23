import { createClient } from '@supabase/supabase-js';
import { TransactionBuilder, Keypair } from '@stellar/stellar-sdk';
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

const url = process.env.SUPABASE_URL?.trim() || 'http://127.0.0.1:54321';
const anonKey = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'; // From .env

const supabase = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const beneficiaryKeypair = Keypair.random(); // Keep for signing, though it won't match, we want to see Deno output first
const walletAddress = 'GDMNWNBUNRY2V5EVQTXPMYVBKVB2NB5HLRLTOWNEA6OGUSO4KFSZGSNV';

async function main() {
  console.log("Signing in as beneficiary...");
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'beneficiary@example.com',
    password: 'ReliefChain!123',
  });

  if (authError || !authData.session) {
    throw new Error(`Auth failed: ${authError?.message}`);
  }

  const token = authData.session.access_token;
  console.log("Signed in successfully.");

  console.log(`Calling prepare-wallet-provision...`);
  const prepResponse = await fetch(`${url}/functions/v1/prepare-wallet-provision`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ walletAddress })
  });

  const prepJson = await prepResponse.json();
  if (!prepJson.provision || !prepJson.provision.unsignedTxXdr) {
    console.log("Response:", JSON.stringify(prepJson, null, 2));
    throw new Error("Failed to prepare provisioning");
  }

  const unsignedTxXdr = prepJson.provision.unsignedTxXdr;
  const networkPassphrase = prepJson.provision.networkPassphrase;

  console.log("Signing transaction on client side...");
  const tx = TransactionBuilder.fromXDR(unsignedTxXdr, networkPassphrase);
  tx.sign(beneficiaryKeypair);
  const signedTxXdr = tx.toXDR();

  console.log("Submitting signed transaction...");
  const submitResponse = await fetch(`${url}/functions/v1/submit-wallet-provision`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ walletAddress, signedTxXdr })
  });

  console.log(`Submit response status: ${submitResponse.status}`);
  const submitJson = await submitResponse.json();
  console.log("Submit response body:", JSON.stringify(submitJson, null, 2));
}

main().catch(console.error);

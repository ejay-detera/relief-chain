import { createClient } from '@supabase/supabase-js';
import { TransactionBuilder, Networks } from '@stellar/stellar-sdk';
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
  console.log("Signed in successfully. Token obtained.");

  // Let's generate a temporary random wallet address to test provision
  const walletAddress = 'GB2LV6NIVVIYNHALFDC7RZX5LG2T3WRYP4HPOVGUMKVETMV6TPGYL57J';

  console.log(`Calling prepare-wallet-provision for ${walletAddress}...`);
  const response = await fetch(`${url}/functions/v1/prepare-wallet-provision`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ walletAddress })
  });

  console.log(`Response status: ${response.status}`);
  const json = await response.json();
  console.log("Response body:", JSON.stringify(json, null, 2));

  if (json.provision && json.provision.unsignedTxXdr) {
    console.log("Parsing XDR on client...");
    const tx = TransactionBuilder.fromXDR(json.provision.unsignedTxXdr, json.provision.networkPassphrase || Networks.TESTNET);
    console.log("Parsed XDR successfully!");
  }
}

main().catch(console.error);

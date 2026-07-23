// Test script for merchant wallet provisioning.
import { createClient } from '@supabase/supabase-js';
import { Keypair, Transaction, Networks } from '@stellar/stellar-sdk';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

// Load env file if exists
let serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
let url = 'http://127.0.0.1:54321';
const databaseUrl = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

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
        if (key === 'SUPABASE_URL') url = val;
      }
    }
  }
} catch (e) {
  console.warn('Could not read env file:', e);
}

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const runId = Date.now().toString(36);
  const merchantEmail = `provision-merchant-${runId}@example.test`;
  const password = 'ReliefChain!123';

  console.log(`Creating test merchant user: ${merchantEmail}`);
  const { data, error } = await admin.auth.admin.createUser({
    email: merchantEmail,
    password,
    email_confirm: true,
    user_metadata: { role: 'merchant', registration_role: 'merchant' },
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  const merchantUserId = data.user.id;

  // Insert profile and merchant entity
  const db = new pg.Client(databaseUrl);
  await db.connect();
  try {
    await db.query(
      `update public.profiles set role = 'merchant', full_name = 'Provision Demo Merchant', verification_status = 'Verified'
       where id = $1`,
      [merchantUserId]
    );
    await db.query(
      `insert into public.merchant_entities (profile_id, display_name)
       values ($1, 'Provision Test Store')`,
      [merchantUserId]
    );
  } finally {
    await db.end();
  }

  // Sign in as the new merchant
  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const signInRes = await client.auth.signInWithPassword({
    email: merchantEmail,
    password,
  });
  if (signInRes.error || !signInRes.data.session) {
    throw new Error(`sign-in failed: ${signInRes.error?.message}`);
  }
  const token = signInRes.data.session.access_token;

  // Generate a new keypair
  const newWallet = Keypair.random();
  console.log(`Generated wallet: Address=${newWallet.publicKey()}`);

  console.log('--- Calling prepare-merchant-provision ---');
  const prepare = await client.functions.invoke('prepare-merchant-provision', {
    headers: { Authorization: `Bearer ${token}` },
    body: {
      walletAddress: newWallet.publicKey(),
    },
  });

  if (prepare.error) {
    throw new Error(`prepare failed: ${prepare.error.message}`);
  }
  console.log('Prepared response:', prepare.data);

  const { unsignedTxXdr, networkPassphrase } = prepare.data.provision;

  // Sign with merchant keypair
  console.log('Signing transaction with merchant wallet...');
  const tx = new Transaction(unsignedTxXdr, networkPassphrase);
  tx.sign(newWallet);
  const signedTxXdr = tx.toXDR();

  console.log('--- Calling submit-merchant-provision ---');
  const submit = await client.functions.invoke('submit-merchant-provision', {
    headers: { Authorization: `Bearer ${token}` },
    body: {
      walletAddress: newWallet.publicKey(),
      signedTxXdr,
    },
  });

  if (submit.error) {
    throw new Error(`submit failed: ${submit.error.message}`);
  }
  console.log('Submitted response:', submit.data);

  // Check database if wallet is inserted and verified
  const checkDb = new pg.Client(databaseUrl);
  await checkDb.connect();
  try {
    const res = await checkDb.query(
      `select * from public.wallets where address = $1`,
      [newWallet.publicKey()]
    );
    console.log('Database wallet row:', res.rows[0]);
    if (res.rows[0] && res.rows[0].verification_status === 'verified') {
      console.log('Wallet provisioning test PASSED!');
    } else {
      console.log('Wallet provisioning test FAILED - verification status mismatch.');
    }
  } finally {
    await checkDb.end();
  }
}

main().catch(console.error);

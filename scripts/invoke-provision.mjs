// Live end-to-end test of the app-signed wallet provisioning flow (local stack).
//
// Simulates the phone: creates a fresh beneficiary user, generates a wallet
// keypair (as the phone's SecureStore would), signs in, calls
// prepare-wallet-provision, signs the sponsored trustline with the wallet key,
// calls submit-wallet-provision, and verifies the wallet is authorized on-chain
// and bound in the database.
//
// Requires functions serve --env-file and SUPABASE_SERVICE_ROLE_KEY (from
// npx supabase status -o env).

import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const url = process.env.SUPABASE_URL?.trim() || 'http://127.0.0.1:54321';
const anonKey =
  process.env.SUPABASE_ANON_KEY?.trim() ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required.');
const horizonUrl = process.env.STELLAR_HORIZON_URL?.trim() || 'https://horizon-testnet.stellar.org';

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
const runId = Date.now().toString(36);
const email = `provision-bene-${runId}@example.test`;
const password = 'ReliefChain!123';

async function main() {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: 'beneficiary', registration_role: 'beneficiary' },
  });
  if (createError || !created.user) throw new Error(`createUser failed: ${createError?.message}`);
  console.log(`beneficiary user: ${email}`);

  const walletKeypair = Keypair.random();
  console.log(`phone wallet: ${walletKeypair.publicKey()}`);

  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: auth, error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError || !auth.session) throw new Error(`sign-in failed: ${signInError?.message}`);

  console.log('\n--- prepare-wallet-provision ---');
  const prepare = await client.functions.invoke('prepare-wallet-provision', {
    body: { walletAddress: walletKeypair.publicKey() },
  });
  if (prepare.error) {
    console.error('prepare error:', prepare.error.message, await safeCtx(prepare.error));
    return;
  }
  console.log(JSON.stringify(prepare.data, null, 2));
  const { unsignedTxXdr, networkPassphrase } = prepare.data.provision;

  // Sign exactly the returned transaction with the wallet key (as the phone would).
  const tx = TransactionBuilder.fromXDR(unsignedTxXdr, networkPassphrase);
  tx.sign(walletKeypair);
  const signedTxXdr = tx.toXDR();

  console.log('\n--- submit-wallet-provision ---');
  const submit = await client.functions.invoke('submit-wallet-provision', {
    body: { walletAddress: walletKeypair.publicKey(), signedTxXdr },
  });
  if (submit.error) {
    console.error('submit error:', submit.error.message, await safeCtx(submit.error));
    return;
  }
  console.log(JSON.stringify(submit.data, null, 2));

  // Verify on-chain authorization and DB binding.
  const res = await fetch(`${horizonUrl}/accounts/${walletKeypair.publicKey()}`);
  const account = await res.json();
  const line = (account.balances ?? []).find((b) => b.asset_code === 'RCPHP');
  console.log('\non-chain RCPHP trustline authorized:', line?.is_authorized === true);

  const db = new pg.Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
  await db.connect();
  const w = await db.query(
    "select verification_status, is_active from public.wallets where address=$1 and owner_type='beneficiary_identity'",
    [walletKeypair.publicKey()],
  );
  console.log('db wallet row:', JSON.stringify(w.rows[0] ?? null));
  await db.end();
}

async function safeCtx(error) {
  try {
    return typeof error.context?.json === 'function' ? JSON.stringify(await error.context.json()) : '';
  } catch {
    return '';
  }
}

main().catch((error) => {
  console.error(`invoke failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

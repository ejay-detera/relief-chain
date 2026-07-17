// Live end-to-end invoke of the cash disbursement Edge Functions (local stack).
//
// Signs in as the seeded org-admin, calls prepare-disbursement to create a job,
// then submit-disbursement (mode=authorize) to execute it. On success the real
// RCPHP payment is submitted to Stellar testnet from the cash-program treasury;
// confirmation still comes only from reconciliation.
//
// Requires: `npx supabase functions serve --env-file supabase/functions/.env`
// running, and the values printed by scripts/seed-cash-demo.mjs.
//
// Usage (PowerShell):
//   $env:ADMIN_EMAIL="cash-admin-xxxx@example.test"
//   $env:ADMIN_PASSWORD="ReliefChain!123"
//   $env:PROGRAM_ID="<program id>"
//   $env:BENEFICIARY_PROFILE_ID="<beneficiary profile id>"
//   node ./scripts/invoke-disbursement.mjs

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL?.trim() || 'http://127.0.0.1:54321';
const anonKey =
  process.env.SUPABASE_ANON_KEY?.trim() ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const adminEmail = process.env.ADMIN_EMAIL?.trim();
const adminPassword = process.env.ADMIN_PASSWORD?.trim() || 'ReliefChain!123';
const programId = process.env.PROGRAM_ID?.trim();
const beneficiaryProfileId = process.env.BENEFICIARY_PROFILE_ID?.trim();
const amountStroops = Number(process.env.AMOUNT_STROOPS?.trim() || '1000000000');

if (!adminEmail || !programId || !beneficiaryProfileId) {
  throw new Error('ADMIN_EMAIL, PROGRAM_ID, and BENEFICIARY_PROFILE_ID are required (see seed output).');
}

const client = createClient(url, anonKey, { auth: { persistSession: false } });

async function main() {
  const { data: auth, error: signInError } = await client.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword,
  });
  if (signInError || !auth.session) {
    throw new Error(`sign-in failed: ${signInError?.message}`);
  }
  console.log(`Signed in as ${adminEmail}`);

  console.log('\n--- prepare-disbursement ---');
  const prepare = await client.functions.invoke('prepare-disbursement', {
    body: { programId, recipients: [{ beneficiaryProfileId, amountStroops }] },
  });
  if (prepare.error) {
    console.error('prepare error:', prepare.error.message, await safeContext(prepare.error));
    return;
  }
  console.log(JSON.stringify(prepare.data, null, 2));
  const jobId = prepare.data?.job?.jobId;
  if (!jobId) {
    console.error('No jobId returned; stopping.');
    return;
  }

  console.log('\n--- submit-disbursement (authorize) ---');
  const submit = await client.functions.invoke('submit-disbursement', {
    body: { jobId, mode: 'authorize', authorizedAt: new Date().toISOString() },
  });
  if (submit.error) {
    console.error('submit error:', submit.error.message, await safeContext(submit.error));
    return;
  }
  console.log(JSON.stringify(submit.data, null, 2));
  console.log('\nDone. Run reconcile-stellar (next milestone) to confirm and populate projections.');
}

async function safeContext(error) {
  try {
    const ctx = error?.context;
    if (ctx && typeof ctx.json === 'function') return await ctx.json();
    return ctx ?? '';
  } catch {
    return '';
  }
}

main().catch((error) => {
  console.error(`invoke failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

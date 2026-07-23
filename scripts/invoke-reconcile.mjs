// Live invoke of reconcile-stellar for one distribution job (local stack).
//
// Usage (PowerShell):
//   $env:ADMIN_EMAIL="cash-admin-xxxx@example.test"
//   $env:ADMIN_PASSWORD="ReliefChain!123"
//   $env:JOB_ID="<distribution job id>"
//   node ./scripts/invoke-reconcile.mjs

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL?.trim() || 'http://127.0.0.1:54321';
const anonKey =
  process.env.SUPABASE_ANON_KEY?.trim() ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const adminEmail = process.env.ADMIN_EMAIL?.trim();
const adminPassword = process.env.ADMIN_PASSWORD?.trim() || 'ReliefChain!123';
const jobId = process.env.JOB_ID?.trim();
if (!adminEmail || !jobId) {
  throw new Error('ADMIN_EMAIL and JOB_ID are required.');
}

const client = createClient(url, anonKey, { auth: { persistSession: false } });

async function main() {
  const { data: auth, error: signInError } = await client.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword,
  });
  if (signInError || !auth.session) throw new Error(`sign-in failed: ${signInError?.message}`);
  console.log(`Signed in as ${adminEmail}`);

  console.log('\n--- reconcile-stellar ---');
  const res = await client.functions.invoke('reconcile-stellar', { body: { jobId } });
  if (res.error) {
    let ctx = '';
    try {
      ctx = typeof res.error.context?.json === 'function' ? JSON.stringify(await res.error.context.json()) : '';
    } catch {
      /* ignore */
    }
    console.error('reconcile error:', res.error.message, ctx);
    return;
  }
  console.log(JSON.stringify(res.data, null, 2));
}

main().catch((error) => {
  console.error(`invoke failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

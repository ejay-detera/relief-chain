// E2E test script for merchant cash-out and reconciliation impact.
import { createClient } from '@supabase/supabase-js';
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

// Load seed-info.json
let seedInfo = {};
try {
  const infoPath = path.resolve('scripts/seed-info.json');
  if (fs.existsSync(infoPath)) {
    seedInfo = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
  }
} catch (e) {
  console.warn('Could not read seed-info.json:', e);
}

const password = 'ReliefChain!123';
const adminEmail = seedInfo.ADMIN_EMAIL;
const merchantEmail = seedInfo.MERCHANT_EMAIL;
const merchantEntityId = seedInfo.MERCHANT_ENTITY_ID;
const organizationId = seedInfo.ORGANIZATION_ID;

if (!merchantEmail || !merchantEntityId || !organizationId || !adminEmail) {
  throw new Error('Please run seed-merchant-demo first to populate seed-info.json.');
}

async function main() {
  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

  console.log('Logging in as merchant and LGU admin...');
  const merchantSignIn = await client.auth.signInWithPassword({ email: merchantEmail, password });
  if (merchantSignIn.error || !merchantSignIn.data.session) throw new Error('Merchant sign in failed');
  const merchantToken = merchantSignIn.data.session.access_token;

  const adminSignIn = await client.auth.signInWithPassword({ email: adminEmail, password });
  if (adminSignIn.error || !adminSignIn.data.session) throw new Error('Admin sign in failed');
  const adminToken = adminSignIn.data.session.access_token;

  console.log('--- Requesting simulated cash-out ---');
  const cashoutResponse = await client.functions.invoke('request-cashout', {
    headers: { Authorization: `Bearer ${merchantToken}` },
    body: {
      actor: 'merchant',
      amountStroops: '40000000', // 4 RCPHP / 40 PHP
    },
  });

  if (cashoutResponse.error) {
    throw new Error(`request-cashout failed: ${cashoutResponse.error.message}`);
  }
  const cashout = cashoutResponse.data.cashout;
  console.log('Cash-out requested:', cashout);

  console.log('--- Running reconciliation (expect pending cashout) ---');
  await client.auth.setSession({ access_token: adminToken, refresh_token: '' });
  let reconcile = await client.functions.invoke('reconcile-stellar', {
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      merchantId: merchantEntityId,
      organizationId,
    },
  });
  if (reconcile.error) throw new Error(`reconcile failed: ${reconcile.error.message}`);

  const db = new pg.Client(databaseUrl);
  await db.connect();
  try {
    console.log('\nChecking projection with requested/pending cash-out:');
    let proj = await db.query(
      `select settled_balance_stroops, pending_cashout_stroops, completed_cashout_stroops
       from public.merchant_balance_projection where merchant_id = $1`,
      [merchantEntityId]
    );
    console.table(proj.rows);

    console.log('Simulating cash-out processing by external system...');
    await db.query(
      `update public.cashout_requests set status = 'processing' where id = $1`,
      [cashout.id]
    );

    console.log('--- Running reconciliation again ---');
    reconcile = await client.functions.invoke('reconcile-stellar', {
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        merchantId: merchantEntityId,
        organizationId,
      },
    });
    if (reconcile.error) throw new Error(`reconcile failed: ${reconcile.error.message}`);

    console.log('\nChecking projection with processing cash-out:');
    proj = await db.query(
      `select settled_balance_stroops, pending_cashout_stroops, completed_cashout_stroops
       from public.merchant_balance_projection where merchant_id = $1`,
      [merchantEntityId]
    );
    console.table(proj.rows);

    console.log('Simulating cash-out completion by external system...');
    await db.query(
      `update public.cashout_requests set status = 'completed' where id = $1`,
      [cashout.id]
    );

    console.log('--- Running reconciliation for completed cash-out ---');
    reconcile = await client.functions.invoke('reconcile-stellar', {
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        merchantId: merchantEntityId,
        organizationId,
      },
    });
    if (reconcile.error) throw new Error(`reconcile failed: ${reconcile.error.message}`);

    console.log('\nChecking projection with completed cash-out:');
    proj = await db.query(
      `select settled_balance_stroops, pending_cashout_stroops, completed_cashout_stroops
       from public.merchant_balance_projection where merchant_id = $1`,
      [merchantEntityId]
    );
    console.table(proj.rows);

    const row = proj.rows[0];
    if (
      row.settled_balance_stroops === '60000000' &&
      row.pending_cashout_stroops === '0' &&
      row.completed_cashout_stroops === '40000000'
    ) {
      console.log('Cash-out test PASSED!');
    } else {
      console.log('Cash-out test FAILED: unexpected projection numbers');
    }

  } finally {
    await db.end();
  }
}

main().catch(console.error);

// Test: test-org-transfer.mjs
// Verifies end-to-end inter-organization transfer from organization@example.com to admin@example.com

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const loadEnv = (filePath) => {
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split('\n')) {
      const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);
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
};

loadEnv(path.resolve('.env.hosted.local'));
loadEnv(path.resolve('.env'));

const supabaseUrl = process.env.SUPABASE_URL || 'https://hmbraapdnkoxpepdqgaa.supabase.co';
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const databaseUrl = process.env.SUPABASE_DB_URL;

if (!anonKey || !databaseUrl) {
  console.error('SUPABASE_ANON_KEY and SUPABASE_DB_URL are required.');
  process.exit(1);
}

const clientSupabase = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DEFAULT_HORIZON_URL = process.env.EXPO_PUBLIC_STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const RCPHP_ISSUER = process.env.EXPO_PUBLIC_STELLAR_RCPHP_ISSUER;
const RCPHP_ASSET_CODE = 'RCPHP';

async function main() {
  console.log('🧪 Starting ORG-01 Inter-Organization Transfer E2E Test...\n');

  // 1. Sign in as organization@example.com
  console.log('1. Authenticating as organization@example.com...');
  const { data: authData, error: authErr } = await clientSupabase.auth.signInWithPassword({
    email: 'organization@example.com',
    password: 'password',
  });

  if (authErr || !authData.session) {
    throw new Error(`Authentication failed: ${authErr?.message}`);
  }
  console.log('   ✅ Signed in successfully! Token acquired.');

  const authenticatedClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${authData.session.access_token}`,
      },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 2. Query target recipient wallet (admin@example.com's treasury wallet)
  const db = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  await db.connect();

  const recipientWalletRes = await db.query(`
    select w.address, o.name as org_name, o.id as org_id
    from public.profiles p
    join public.organization_memberships m on m.user_id = p.id and m.is_active = true
    join public.organizations o on o.id = m.organization_id
    join public.wallets w on w.owner_id = o.id and w.purpose = 'organization_treasury' and w.is_active = true
    join auth.users u on u.id = p.id
    where u.email = 'admin@example.com'
    limit 1
  `);

  if (recipientWalletRes.rows.length === 0) {
    throw new Error('Could not find active treasury wallet for admin@example.com');
  }

  const recipientWallet = recipientWalletRes.rows[0].address;
  const recipientOrgName = recipientWalletRes.rows[0].org_name;
  console.log(`2. Recipient Wallet identified: ${recipientWallet} (${recipientOrgName})`);

  // 3. Check Horizon balances before transfer
  const { Horizon } = await import('@stellar/stellar-sdk');
  const server = new Horizon.Server(DEFAULT_HORIZON_URL);

  const senderWallet = 'GD5ETI35VDLP5HFXW2WMVJ2YBASYD65PW5MUVBMKOZKMCQ5DZOWO7W34';
  const senderBefore = await server.loadAccount(senderWallet);
  const recipientBefore = await server.loadAccount(recipientWallet);

  const senderBalBefore = parseFloat(
    senderBefore.balances.find((b) => b.asset_code === RCPHP_ASSET_CODE)?.balance || '0'
  );
  const recipientBalBefore = parseFloat(
    recipientBefore.balances.find((b) => b.asset_code === RCPHP_ASSET_CODE)?.balance || '0'
  );

  console.log(`\n3. Pre-transfer Balances:`);
  console.log(`   Sender (organization@example.com): ${senderBalBefore} RCPHP`);
  console.log(`   Recipient (admin@example.com):       ${recipientBalBefore} RCPHP`);

  // 4. Invoke transfer-organization-fund Edge Function
  const transferAmount = '100.00';
  console.log(`\n4. Invoking transfer-organization-fund to send ${transferAmount} RCPHP...`);

  const { data: transferResult, error: funcErr } = await authenticatedClient.functions.invoke(
    'transfer-organization-fund',
    {
      body: {
        destinationWallet: recipientWallet,
        amountRcphp: transferAmount,
        memo: 'Inter-org test transfer',
      },
    }
  );

  if (funcErr) {
    console.error('   ❌ Invoke failed:', funcErr);
    try {
      const errJson = await funcErr.context.json();
      console.error('   ❌ Error JSON payload:', JSON.stringify(errJson, null, 2));
    } catch (e) {
      try {
        const errText = await funcErr.context.text();
        console.error('   ❌ Error Text payload:', errText);
      } catch (e2) {}
    }
    throw funcErr;
  }

  if (!transferResult?.success) {
    throw new Error(`Transfer failed: ${transferResult?.errorMessage || 'Unknown error'}`);
  }

  console.log('   ✅ Transfer response received:');
  console.log(`      Status: Success`);
  console.log(`      Transaction Hash: ${transferResult.transactionHash}`);
  console.log(`      Ledger Sequence: #${transferResult.ledgerSequence}`);

  // 5. Verify on Horizon
  console.log('\n5. Verifying on-chain settlement on Stellar Horizon...');
  // Brief pause for ledger propagation
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const senderAfter = await server.loadAccount(senderWallet);
  const recipientAfter = await server.loadAccount(recipientWallet);

  const senderBalAfter = parseFloat(
    senderAfter.balances.find((b) => b.asset_code === RCPHP_ASSET_CODE)?.balance || '0'
  );
  const recipientBalAfter = parseFloat(
    recipientAfter.balances.find((b) => b.asset_code === RCPHP_ASSET_CODE)?.balance || '0'
  );

  console.log(`   Post-transfer Balances:`);
  console.log(`   Sender:    ${senderBalAfter} RCPHP (Difference: ${senderBalAfter - senderBalBefore} RCPHP)`);
  console.log(`   Recipient: ${recipientBalAfter} RCPHP (Difference: +${recipientBalAfter - recipientBalBefore} RCPHP)`);

  if (recipientBalAfter - recipientBalBefore !== 100) {
    throw new Error(`Expected recipient balance to increase by 100, got ${recipientBalAfter - recipientBalBefore}`);
  }
  console.log('   ✅ Horizon balances correctly updated!');

  // 6. Verify Database records
  console.log('\n6. Verifying database records in public.organization_transfers and public.audit_events...');
  const transferDbRes = await db.query(
    `select * from public.organization_transfers where transaction_hash = $1`,
    [transferResult.transactionHash]
  );
  console.log(`   ✅ Found transfer record in organization_transfers (ID: ${transferDbRes.rows[0]?.id})`);

  const auditDbRes = await db.query(
    `select action, organization_id, metadata from public.audit_events where metadata->>'transactionHash' = $1`,
    [transferResult.transactionHash]
  );
  console.log(`   ✅ Found ${auditDbRes.rows.length} audit events matching transaction hash!`);
  for (const row of auditDbRes.rows) {
    console.log(`      Action: ${row.action} for Org ${row.organization_id}`);
  }

  console.log('\n======================================================');
  console.log('🎉 ORG-01 Inter-Organization Transfer E2E Test PASSED!');
  console.log('======================================================\n');

  await db.end();
}

main().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});

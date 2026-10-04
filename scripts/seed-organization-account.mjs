// Script: seed-organization-account.mjs
// Provisions organization@example.com / password, establishes its Stellar testnet treasury
// wallet, authorizes its RCPHP trustline, and funds it with RCPHP.
// Also ensures admin@example.com has its active treasury wallet properly bound.

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
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
loadEnv(path.resolve('.env.bootstrap.local'));
loadEnv(path.resolve('.env'));

const hex64 = (value) => createHash('sha256').update(value).digest('hex');

const supabaseUrl = process.env.SUPABASE_URL || 'https://hmbraapdnkoxpepdqgaa.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.SUPABASE_DB_URL;

if (!serviceRoleKey || !databaseUrl) {
  console.error('SUPABASE_SERVICE_ROLE_KEY and SUPABASE_DB_URL are required.');
  process.exit(1);
}

const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DEFAULT_HORIZON_URL = process.env.EXPO_PUBLIC_STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const DEFAULT_FRIENDBOT_URL = 'https://friendbot.stellar.org';
const STELLAR_TESTNET_NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
const RCPHP_ASSET_CODE = 'RCPHP';

async function main() {
  const db = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  await db.connect();

  const { Horizon, Keypair, TransactionBuilder, Operation, Asset, BASE_FEE } = await import('@stellar/stellar-sdk');
  const server = new Horizon.Server(DEFAULT_HORIZON_URL);
  const fee = String(BASE_FEE * 100);

  const issuerSecret = process.env.STELLAR_ISSUER_SECRET?.trim();
  const sponsorSecret = process.env.STELLAR_SPONSOR_SECRET?.trim();
  const distributionSecret = process.env.STELLAR_DISTRIBUTION_SECRET?.trim();
  const orgTreasurySecret = process.env.STELLAR_ORGANIZATION_TREASURY_SECRET?.trim();

  if (!issuerSecret || !sponsorSecret || !distributionSecret || !orgTreasurySecret) {
    throw new Error('Institutional secrets (issuer, sponsor, distribution, org treasury) must be set in .env.bootstrap.local');
  }

  const issuerKp = Keypair.fromSecret(issuerSecret);
  const sponsorKp = Keypair.fromSecret(sponsorSecret);
  const distributionKp = Keypair.fromSecret(distributionSecret);
  const adminTreasuryKp = Keypair.fromSecret(orgTreasurySecret);
  const rcphpAsset = new Asset(RCPHP_ASSET_CODE, issuerKp.publicKey());

  console.log('--- Step 1: Ensure admin@example.com active treasury wallet is correctly set ---');
  // Find admin user
  const adminUserRes = await db.query(
    `select id from auth.users where email = 'admin@example.com'`
  );
  if (adminUserRes.rows.length > 0) {
    const adminUserId = adminUserRes.rows[0].id;
    // Get admin org
    const adminMemRes = await db.query(
      `select organization_id from public.organization_memberships where user_id = $1 and is_active = true limit 1`,
      [adminUserId]
    );
    if (adminMemRes.rows.length > 0) {
      const adminOrgId = adminMemRes.rows[0].organization_id;
      // Ensure GA4KQ3G... is the active wallet for admin org
      await db.query(
        `update public.wallets set is_active = false where owner_id = $1 and purpose = 'organization_treasury'`,
        [adminOrgId]
      );
      await db.query(
        `insert into public.wallets (
          owner_type, owner_id, purpose, network, address,
          verification_status, is_active,
          proof_challenge_digest, proof_signature_digest,
          proof_challenge_issued_at, verified_at, verified_by
        ) values (
          'organization', $1, 'organization_treasury', 'stellar_testnet', $2,
          'verified', true,
          $3, $4, now(), now(), $5
        )
        on conflict (network, address) do update set
          owner_id = excluded.owner_id,
          verification_status = 'verified',
          is_active = true`,
        [
          adminOrgId,
          adminTreasuryKp.publicKey(),
          hex64(`challenge:${adminTreasuryKp.publicKey()}`),
          hex64(`signature:${adminTreasuryKp.publicKey()}`),
          adminUserId,
        ]
      );
      // Store key in private store
      await db.query(
        `insert into private.organization_treasury_keys (organization_id, secret_seed)
         values ($1, $2)
         on conflict (organization_id) do update set secret_seed = excluded.secret_seed`,
        [adminOrgId, orgTreasurySecret]
      );
      console.log(`  ✅ Admin treasury wallet set to: ${adminTreasuryKp.publicKey()}`);
    }
  }

  console.log('\n--- Step 2: Provision organization@example.com user ---');
  let orgUserId;
  const listRes = await adminSupabase.auth.admin.listUsers({ perPage: 1000 });
  const existingOrgUser = listRes.data?.users?.find(
    (u) => u.email?.toLowerCase() === 'organization@example.com'
  );

  if (existingOrgUser) {
    orgUserId = existingOrgUser.id;
    console.log(`  ✅ Found existing auth user: ${orgUserId}`);
    await adminSupabase.auth.admin.updateUserById(orgUserId, {
      password: 'password',
      email_confirm: true,
      user_metadata: { role: 'lgu' },
    });
  } else {
    const { data: created, error: createErr } = await adminSupabase.auth.admin.createUser({
      email: 'organization@example.com',
      password: 'password',
      email_confirm: true,
      user_metadata: {
        role: 'lgu',
        registration_role: 'lgu',
        organization_name: 'Partner Relief Organization',
        organization_type: 'NGO',
        location: 'Metro Manila',
        representative_first_name: 'Partner',
        representative_last_name: 'Admin',
        representative_position: 'Administrator',
        organization_document_reference: 'PARTNER-DOC-001',
      },
    });
    if (createErr) throw createErr;
    orgUserId = created.user.id;
    console.log(`  ✅ Created new auth user: ${orgUserId}`);
  }

  // Profile
  await db.query(
    `insert into public.profiles (id, role, full_name, verification_status)
     values ($1, 'lgu', 'Partner Relief Org Admin', 'Verified')
     on conflict (id) do update set
       role = 'lgu',
       full_name = 'Partner Relief Org Admin',
       verification_status = 'Verified'`,
    [orgUserId]
  );
  console.log('  ✅ Profile configured');

  // Organization
  const orgSlug = 'partner-relief-organization';
  const orgName = 'Partner Relief Organization';
  const orgRes = await db.query(
    `insert into public.organizations (name, slug, created_by)
     values ($1, $2, $3)
     on conflict (slug) do update set name = excluded.name
     returning id, name`,
    [orgName, orgSlug, orgUserId]
  );
  const organizationId = orgRes.rows[0].id;
  console.log(`  ✅ Organization: ${orgRes.rows[0].name} (${organizationId})`);

  // Membership
  await db.query(
    `insert into public.organization_memberships (organization_id, user_id, role, is_active, granted_by)
     values ($1, $2, 'organization_administrator', true, $2)
     on conflict (organization_id, user_id) do update set is_active = true, role = 'organization_administrator'`,
    [organizationId, orgUserId]
  );
  console.log('  ✅ Organization administrator membership linked');

  console.log('\n--- Step 3: Setup Stellar testnet treasury wallet for Partner Relief Organization ---');
  // Check if private key already exists for this organization
  const existingKeyRes = await db.query(
    `select secret_seed from private.organization_treasury_keys where organization_id = $1`,
    [organizationId]
  );

  let newOrgKp;
  if (existingKeyRes.rows.length > 0 && existingKeyRes.rows[0].secret_seed.startsWith('S')) {
    newOrgKp = Keypair.fromSecret(existingKeyRes.rows[0].secret_seed);
    console.log(`  Using existing keypair: ${newOrgKp.publicKey()}`);
  } else {
    newOrgKp = Keypair.random();
    console.log(`  Generated new keypair: ${newOrgKp.publicKey()}`);
  }

  // 1. Friendbot account creation
  try {
    await server.loadAccount(newOrgKp.publicKey());
    console.log('  [ok] Account already exists on Stellar testnet');
  } catch (err) {
    if (err?.response?.status === 404 || err?.name === 'NotFoundError') {
      console.log('  Funding via Friendbot...');
      const fRes = await fetch(`${DEFAULT_FRIENDBOT_URL}/?addr=${encodeURIComponent(newOrgKp.publicKey())}`);
      if (fRes.status !== 200) throw new Error('Friendbot funding failed.');
      console.log('  [ok] Account funded via Friendbot');
    } else {
      throw err;
    }
  }

  // 2. Sponsored RCPHP trustline
  const loadedOrgAccount = await server.loadAccount(newOrgKp.publicKey());
  const hasTrustline = loadedOrgAccount.balances.some(
    (b) => b.asset_code === RCPHP_ASSET_CODE && b.asset_issuer === issuerKp.publicKey()
  );

  if (!hasTrustline) {
    console.log('  Creating sponsored RCPHP trustline...');
    const sponsorAccount = await server.loadAccount(sponsorKp.publicKey());
    const trustlineTx = new TransactionBuilder(sponsorAccount, {
      fee,
      networkPassphrase: STELLAR_TESTNET_NETWORK_PASSPHRASE,
    })
      .addOperation(
        Operation.beginSponsoringFutureReserves({
          sponsoredId: newOrgKp.publicKey(),
          source: sponsorKp.publicKey(),
        })
      )
      .addOperation(Operation.changeTrust({ asset: rcphpAsset, source: newOrgKp.publicKey() }))
      .addOperation(Operation.endSponsoringFutureReserves({ source: newOrgKp.publicKey() }))
      .setTimeout(180)
      .build();
    trustlineTx.sign(sponsorKp, newOrgKp);
    await server.submitTransaction(trustlineTx);
    console.log('  [ok] RCPHP trustline created');
  } else {
    console.log('  [ok] RCPHP trustline already exists');
  }

  // 3. Issuer authorizes trustline
  console.log('  Authorizing RCPHP trustline with issuer...');
  const issuerAccount = await server.loadAccount(issuerKp.publicKey());
  const authTx = new TransactionBuilder(issuerAccount, {
    fee,
    networkPassphrase: STELLAR_TESTNET_NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.setTrustLineFlags({
        trustor: newOrgKp.publicKey(),
        asset: rcphpAsset,
        flags: { authorized: true },
      })
    )
    .setTimeout(180)
    .build();
  authTx.sign(issuerKp);
  await server.submitTransaction(authTx);
  console.log('  [ok] Issuer authorized RCPHP trustline');

  // 4. Fund organization with RCPHP
  const reloadedOrg = await server.loadAccount(newOrgKp.publicKey());
  const orgBalanceLine = reloadedOrg.balances.find(
    (b) => b.asset_code === RCPHP_ASSET_CODE && b.asset_issuer === issuerKp.publicKey()
  );
  const currentRcphp = parseFloat(orgBalanceLine?.balance || '0');
  console.log(`  Current RCPHP Balance: ${currentRcphp} RCPHP`);

  if (currentRcphp < 10000) {
    const fundAmount = '50000';
    console.log(`  Funding wallet with ${fundAmount} RCPHP from issuer account (minting)...`);
    const issuerAccount = await server.loadAccount(issuerKp.publicKey());
    const payTx = new TransactionBuilder(issuerAccount, {
      fee,
      networkPassphrase: STELLAR_TESTNET_NETWORK_PASSPHRASE,
    })
      .addOperation(
        Operation.payment({
          destination: newOrgKp.publicKey(),
          asset: rcphpAsset,
          amount: fundAmount,
        })
      )
      .setTimeout(180)
      .build();
    payTx.sign(issuerKp);
    try {
      const payResult = await server.submitTransaction(payTx);
      console.log(`  [ok] Transferred ${fundAmount} RCPHP! Tx hash: ${payResult.hash}`);
    } catch (payErr) {
      console.error('Payment error result_codes:', JSON.stringify(payErr.response?.data?.extras?.result_codes, null, 2));
      throw payErr;
    }
  }

  // 5. Save wallet and private key
  await db.query(
    `update public.wallets set is_active = false where owner_id = $1 and purpose = 'organization_treasury'`,
    [organizationId]
  );
  await db.query(
    `insert into public.wallets (
      owner_type, owner_id, purpose, network, address,
      verification_status, is_active,
      proof_challenge_digest, proof_signature_digest,
      proof_challenge_issued_at, verified_at, verified_by
    ) values (
      'organization', $1, 'organization_treasury', 'stellar_testnet', $2,
      'verified', true,
      $3, $4, now(), now(), $5
    )
    on conflict (network, address) do update set
      owner_id = excluded.owner_id,
      verification_status = 'verified',
      is_active = true`,
    [
      organizationId,
      newOrgKp.publicKey(),
      hex64(`challenge:${newOrgKp.publicKey()}`),
      hex64(`signature:${newOrgKp.publicKey()}`),
      orgUserId,
    ]
  );

  await db.query(
    `insert into private.organization_treasury_keys (organization_id, secret_seed)
     values ($1, $2)
     on conflict (organization_id) do update set secret_seed = excluded.secret_seed`,
    [organizationId, newOrgKp.secret()]
  );
  await db.query(
    `insert into public.organization_treasury_keys (organization_id, secret_seed)
     values ($1, $2)
     on conflict (organization_id) do update set secret_seed = excluded.secret_seed`,
    [organizationId, newOrgKp.secret()]
  );
  console.log('  ✅ Wallet and secure keys saved in database');

  // Verify final balances
  const finalOrg = await server.loadAccount(newOrgKp.publicKey());
  const finalLine = finalOrg.balances.find(
    (b) => b.asset_code === RCPHP_ASSET_CODE && b.asset_issuer === issuerKp.publicKey()
  );
  console.log('\n======================================================');
  console.log('🎉 Setup Complete!');
  console.log(`Sender: organization@example.com (Org: ${orgName})`);
  console.log(`  Treasury Wallet: ${newOrgKp.publicKey()}`);
  console.log(`  RCPHP Balance:   ${finalLine?.balance} RCPHP`);
  console.log('------------------------------------------------------');
  console.log(`Recipient: admin@example.com (Org: Merchant Demo LGU)`);
  console.log(`  Treasury Wallet: ${adminTreasuryKp.publicKey()}`);
  console.log('======================================================\n');

  await db.end();
}

main().catch((err) => {
  console.error('❌ Setup failed:', err);
  process.exit(1);
});

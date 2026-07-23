// Local-only demo seed for the UI-testable flow.
// Usage:
//   npx supabase db reset --local
//   node ./scripts/seed-ui-demo.mjs

import { Keypair } from '@stellar/stellar-sdk';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import pg from 'pg';
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
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
} catch (e) {
  console.warn('Could not read env file:', e);
}

const hex64 = (value) => createHash('sha256').update(value).digest('hex');

const url = process.env.SUPABASE_URL?.trim() || 'http://127.0.0.1:54321';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!serviceRoleKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required.');
}

const beneficiarySecret = process.env.STELLAR_BENEFICIARY_SECRET?.trim();
const merchantSecret = process.env.STELLAR_MERCHANT_SECRET?.trim();
const orgTreasurySecret = process.env.STELLAR_ORGANIZATION_TREASURY_SECRET?.trim();

if (!beneficiarySecret || !merchantSecret || !orgTreasurySecret) {
  throw new Error(
    'Missing required Stellar testnet accounts in environment variables.\n' +
    'Please ensure STELLAR_BENEFICIARY_SECRET, STELLAR_MERCHANT_SECRET, and STELLAR_ORGANIZATION_TREASURY_SECRET are set.'
  );
}

const beneficiaryWalletAddress = Keypair.fromSecret(beneficiarySecret).publicKey();
const merchantWalletAddress = Keypair.fromSecret(merchantSecret).publicKey();
const orgTreasuryAddress = Keypair.fromSecret(orgTreasurySecret).publicKey();
const cashProgramTreasuryAddress = Keypair.random().publicKey(); // Generate a new one for each program to avoid conflicts

const databaseUrl = process.env.SUPABASE_DB_URL?.trim() || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const runId = Date.now().toString(36);
const adminEmail = `admin-${runId}@example.test`;
const beneficiaryEmail = `beneficiary-${runId}@example.test`;
const merchantEmail = `merchant-${runId}@example.test`;
const password = 'ReliefChain!123';

const createUser = async (email, role) => {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role, registration_role: role },
  });
  if (error || !data.user) {
    throw new Error(`createUser(${email}) failed: ${error?.message}`);
  }
  return data.user.id;
};

async function main() {
  const db = new pg.Client(databaseUrl);
  await db.connect();

  // Basic check for clean database to prevent unique constraint conflicts
  const existingOrg = (await db.query(`select count(*) from public.organizations`)).rows[0].count;
  if (parseInt(existingOrg, 10) > 0) {
    console.warn('\nWARNING: Database is not empty. You may encounter unique constraint errors.');
    console.warn('Recommended: run `npx supabase db reset --local` first.\n');
  }

  try {
    const adminUserId = await createUser(adminEmail, 'lgu');
    const beneficiaryUserId = await createUser(beneficiaryEmail, 'beneficiary');
    const merchantUserId = await createUser(merchantEmail, 'merchant');

    // Upsert profiles
    await db.query(
      `insert into public.profiles (id, role, full_name, verification_status)
       values ($1,'lgu','LGU Admin','Verified'), 
              ($2,'beneficiary','Juan Dela Cruz','Verified'),
              ($3,'merchant','Aling Nena Store','Verified')
       on conflict (id) do update set verification_status = 'Verified'`,
      [adminUserId, beneficiaryUserId, merchantUserId],
    );

    // Create organization
    const org = (await db.query(
      `insert into public.organizations (name, slug, created_by)
       values ($1,$2,$3) returning id`,
      [`Quezon City Relief ${runId}`, `qc-relief-${runId}`, adminUserId],
    )).rows[0];

    // Membership for admin
    await db.query(
      `insert into public.organization_memberships (organization_id, user_id, role, is_active, granted_by)
       values ($1,$2,'organization_administrator',true,$2)`,
      [org.id, adminUserId],
    );

    // Beneficiary identity
    const identity = (await db.query(
      `update public.beneficiary_identities 
       set verification_status = 'Verified', verified_at = now() 
       where user_id = $1 returning id`,
      [beneficiaryUserId],
    )).rows[0];

    // Cash Program
    const program = (await db.query(
      `insert into public.programs (name, organization_id, aid_type, created_by,
         total_budget, amount_per_beneficiary, asset_code, asset_issuer)
       values ($1,$2,'cash',$3,50000,1000,'RCPHP','GBC6HZTIUH6C3KQR5D3NOS2PJ7YKQJQNAQGAO3WO4PICJEXPAPGRKSQ7') returning id`,
      [`QC Typhoon Cash Aid ${runId}`, org.id, adminUserId],
    )).rows[0];

    // Enrollment
    await db.query(
      `insert into public.enrollments (program_id, beneficiary_id, beneficiary_identity_id,
         approval_status, category, allocation_amount_stroops, approved_by, approved_at)
       values ($1,$2,$3,'Approved','Cash',10000000000,$4,now())`,
      [program.id, beneficiaryUserId, identity.id, adminUserId],
    );

    // Organization Treasury Wallet
    await db.query(
      `insert into public.wallets (owner_type, owner_id, purpose, network, address,
         verification_status, is_active, proof_challenge_digest, proof_signature_digest,
         proof_challenge_issued_at, verified_at, verified_by)
       values ('organization',$1,'organization_treasury','stellar_testnet',$2,'verified',true,
         $3,$4,now(),now(),$5)`,
      [
        org.id,
        orgTreasuryAddress,
        hex64(`challenge:${orgTreasuryAddress}`),
        hex64(`signature:${orgTreasuryAddress}`),
        adminUserId,
      ],
    );

    // Cash-Program Treasury Wallet
    await db.query(
      `insert into public.wallets (owner_type, owner_id, purpose, network, address,
         verification_status, is_active, proof_challenge_digest, proof_signature_digest,
         proof_challenge_issued_at, verified_at, verified_by)
       values ('organization',$1,'cash_program_treasury','stellar_testnet',$2,'verified',true,
         $3,$4,now(),now(),$5)`,
      [
        org.id,
        cashProgramTreasuryAddress,
        hex64(`challenge:${cashProgramTreasuryAddress}`),
        hex64(`signature:${cashProgramTreasuryAddress}`),
        adminUserId,
      ],
    );

    // Beneficiary wallet
    await db.query(
      `insert into public.wallets (owner_type, owner_id, purpose, network, address,
         verification_status, is_active, proof_challenge_digest, proof_signature_digest,
         proof_challenge_issued_at, verified_at, verified_by)
       values ('beneficiary_identity',$1,'beneficiary','stellar_testnet',$2,'verified',true,
         $3,$4,now(),now(),$5)`,
      [
        identity.id,
        beneficiaryWalletAddress,
        hex64(`challenge:${beneficiaryWalletAddress}`),
        hex64(`signature:${beneficiaryWalletAddress}`),
        adminUserId,
      ],
    );

    // Merchant entity
    const merchant = (await db.query(
      `insert into public.merchant_entities (profile_id, display_name)
       values ($1, 'Aling Nena Grocery') returning id`,
      [merchantUserId],
    )).rows[0];

    // Merchant accreditation
    await db.query(
      `insert into public.merchant_accreditations (organization_id, merchant_id, category, status, valid_from, valid_until, approved_by, approved_at)
       values ($1, $2, 'Grocery', 'active', now() - interval '1 day', now() + interval '1 year', $3, now())`,
      [org.id, merchant.id, adminUserId],
    );

    // Program merchant authorization
    await db.query(
      `insert into public.program_merchants (program_id, merchant_id, category, status, correlation_id, authorized_by)
       values ($1, $2, 'Grocery', 'authorized', gen_random_uuid(), $3)`,
      [program.id, merchant.id, adminUserId],
    );

    // Merchant settlement wallet
    await db.query(
      `insert into public.wallets (owner_type, owner_id, purpose, network, address,
         verification_status, is_active, proof_challenge_digest, proof_signature_digest,
         proof_challenge_issued_at, verified_at, verified_by)
       values ('merchant_entity',$1,'merchant_settlement','stellar_testnet',$2,'verified',true,
         $3,$4,now(),now(),$5)`,
      [
        merchant.id,
        merchantWalletAddress,
        hex64(`challenge:${merchantWalletAddress}`),
        hex64(`signature:${merchantWalletAddress}`),
        adminUserId,
      ],
    );

    console.log('UI Demo seed complete.');
    console.log('\n--- Test Credentials ---');
    console.log('  LGU Admin Email:        ', adminEmail);
    console.log('  Beneficiary Email:      ', beneficiaryEmail);
    console.log('  Merchant Email:         ', merchantEmail);
    console.log('  Password (all):         ', password);
    
    console.log('\n--- Public IDs ---');
    console.log('  Organization ID:        ', org.id);
    console.log('  Program ID:             ', program.id);
    console.log('  Beneficiary Identity ID:', identity.id);
    console.log('  Merchant Entity ID:     ', merchant.id);
    
    console.log('\n--- Wallets ---');
    console.log('  Org Treasury:           ', orgTreasuryAddress);
    console.log('  Program Treasury:       ', cashProgramTreasuryAddress);
    console.log('  Beneficiary Wallet:     ', beneficiaryWalletAddress);
    console.log('  Merchant Wallet:        ', merchantWalletAddress);
    console.log('\nSeed successful! Please ensure you fund the org treasury before testing disbursements.');
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(`seed failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

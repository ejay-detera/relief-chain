// Local-only demo seed for the merchant payment flow.
//
// Creates the organization, program, beneficiary identity, merchant entity,
// accreditation, and verified wallets for BOTH beneficiary and merchant.
//
// Usage (PowerShell):
//   $env:SUPABASE_URL="http://127.0.0.1:54321"
//   $env:SUPABASE_SERVICE_ROLE_KEY="<from: npx supabase status -o env>"
//   node ./scripts/seed-merchant-demo.mjs

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
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
if (!serviceRoleKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required (get it from: npx supabase status -o env).');
}
const beneficiarySecret = process.env.STELLAR_BENEFICIARY_SECRET?.trim();
if (!beneficiarySecret) {
  throw new Error('STELLAR_BENEFICIARY_SECRET is required.');
}
const beneficiaryWalletAddress = Keypair.fromSecret(beneficiarySecret).publicKey();

const merchantSecret = process.env.STELLAR_MERCHANT_SECRET?.trim();
if (!merchantSecret) {
  throw new Error('STELLAR_MERCHANT_SECRET is required (load .env.bootstrap.local into the env first).');
}
const merchantWalletAddress = Keypair.fromSecret(merchantSecret).publicKey();

const databaseUrl = process.env.SUPABASE_DB_URL?.trim() || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const runId = Date.now().toString(36);
const adminEmail = `merchant-admin-${runId}@example.test`;
const beneficiaryEmail = `merchant-beneficiary-${runId}@example.test`;
const merchantEmail = `merchant-user-${runId}@example.test`;
const password = 'ReliefChain!123';

const createUser = async (email, role) => {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role, registration_role: role },
  });
  if (error || !data.user) throw new Error(`createUser(${email}) failed: ${error?.message}`);
  return data.user.id;
};

async function main() {
  const adminUserId = await createUser(adminEmail, 'lgu');
  const beneficiaryUserId = await createUser(beneficiaryEmail, 'beneficiary');
  const merchantUserId = await createUser(merchantEmail, 'merchant');

  const db = new pg.Client(databaseUrl);
  await db.connect();
  try {
    // Upsert profiles
    await db.query(
      `insert into public.profiles (id, role, full_name, verification_status)
       values ($1,'lgu','Merchant Demo Admin','Verified'), 
              ($2,'beneficiary','Merchant Demo Beneficiary','Verified'),
              ($3,'merchant','Merchant Demo User','Verified')
       on conflict (id) do update set verification_status = 'Verified'`,
      [adminUserId, beneficiaryUserId, merchantUserId],
    );

    // Create organization
    const org = (await db.query(
      `insert into public.organizations (name, slug, created_by)
       values ($1,$2,$3) returning id`,
      [`Merchant Demo LGU ${runId}`, `merchant-demo-lgu-${runId}`, adminUserId],
    )).rows[0];

    // Membership for admin
    await db.query(
      `insert into public.organization_memberships (organization_id, user_id, role, is_active, granted_by)
       values ($1,$2,'finance_approver',true,$2)`,
      [org.id, adminUserId],
    );

    // Beneficiary identity
    const identity = (await db.query(
      `insert into public.beneficiary_identities (user_id, verification_status, verified_at)
       values ($1,'Verified',now())
       on conflict (user_id) do update set verification_status = 'Verified', verified_at = now()
       returning id`,
      [beneficiaryUserId],
    )).rows[0];

    // Program (aid_type = 'cash')
    const program = (await db.query(
      `insert into public.programs (name, organization_id, aid_type, created_by,
         total_budget, amount_per_beneficiary, asset_code, asset_issuer)
       values ($1,$2,'cash',$3,50000,1000,'RCPHP',$4) returning id`,
      [`Merchant Demo Program ${runId}`, org.id, adminUserId, 'GBC6HZTIUH6C3KQR5D3NOS2PJ7YKQJQNAQGAO3WO4PICJEXPAPGRKSQ7'],
    )).rows[0];

    // Enrollment
    await db.query(
      `insert into public.enrollments (program_id, beneficiary_id, beneficiary_identity_id,
         approval_status, category, allocation_amount_stroops, approved_by, approved_at)
       values ($1,$2,$3,'Approved','Cash',10000000000,$4,now())`,
      [program.id, beneficiaryUserId, identity.id, adminUserId],
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
       values ($1, 'Merchant Demo Store') returning id`,
      [merchantUserId],
    )).rows[0];

    // Merchant accreditation (valid from 1 day ago to 1 year from now)
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

    // Merchant wallet
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

    const seedInfo = {
      ORGANIZATION_ID: org.id,
      PROGRAM_ID: program.id,
      ADMIN_EMAIL: adminEmail,
      BENEFICIARY_EMAIL: beneficiaryEmail,
      MERCHANT_EMAIL: merchantEmail,
      MERCHANT_ENTITY_ID: merchant.id,
    };
    fs.writeFileSync(path.resolve('scripts/seed-info.json'), JSON.stringify(seedInfo, null, 2), 'utf8');

    console.log('Merchant demo seed complete.');
    console.log('  org id:                 ', org.id);
    console.log('  program id:             ', program.id);
    console.log('  org-admin email:        ', adminEmail);
    console.log('  org-admin password:     ', password);
    console.log('  beneficiary email:      ', beneficiaryEmail);
    console.log('  beneficiary password:   ', password);
    console.log('  beneficiary identity id:', identity.id);
    console.log('  beneficiary wallet addr:', beneficiaryWalletAddress);
    console.log('  merchant email:         ', merchantEmail);
    console.log('  merchant password:      ', password);
    console.log('  merchant entity id:     ', merchant.id);
    console.log('  merchant wallet addr:   ', merchantWalletAddress);
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(`seed failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

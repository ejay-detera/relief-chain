// Local-only demo seed for the cash distribution flow.
//
// Creates the minimal data prepare/submit-disbursement need to run end-to-end
// against the LOCAL Supabase stack:
//   - an organization + an org-admin user with a finance_approver membership,
//   - a beneficiary user + stable beneficiary identity,
//   - an ACTIVE cash program,
//   - an APPROVED enrollment linking the beneficiary to the program,
//   - a VERIFIED, ACTIVE beneficiary-identity wallet whose address is the
//     already-provisioned pilot beneficiary account (so it can actually receive
//     RCPHP under AUTH_REQUIRED).
//
// Auth users are created through the local Auth admin API; all domain rows are
// written over the direct superuser Postgres connection so table GRANTs / RLS on
// hardened tables do not block the seed. Local pilot only; never hosted.
//
// Usage (PowerShell), with the topology secrets already loaded into the env:
//   $env:SUPABASE_URL="http://127.0.0.1:54321"
//   $env:SUPABASE_SERVICE_ROLE_KEY="<from: npx supabase status -o env>"
//   node ./scripts/seed-cash-demo.mjs

import { Keypair } from '@stellar/stellar-sdk';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import pg from 'pg';

const hex64 = (value) => createHash('sha256').update(value).digest('hex');

const url = process.env.SUPABASE_URL?.trim() || 'http://127.0.0.1:54321';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!serviceRoleKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required (get it from: npx supabase status -o env).');
}
const beneficiarySecret = process.env.STELLAR_BENEFICIARY_SECRET?.trim();
if (!beneficiarySecret) {
  throw new Error('STELLAR_BENEFICIARY_SECRET is required (load .env.bootstrap.local into the env first).');
}
const beneficiaryWalletAddress = Keypair.fromSecret(beneficiarySecret).publicKey();
const databaseUrl = process.env.SUPABASE_DB_URL?.trim() || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const runId = Date.now().toString(36);
const adminEmail = `cash-admin-${runId}@example.test`;
const beneficiaryEmail = `cash-beneficiary-${runId}@example.test`;
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

  const db = new pg.Client(databaseUrl);
  await db.connect();
  try {
    // The signup trigger creates profile rows; make sure both exist with a role.
    await db.query(
      `insert into public.profiles (id, role, full_name, verification_status)
       values ($1,'lgu','Cash Demo Admin','Verified'), ($2,'beneficiary','Cash Demo Beneficiary','Verified')
       on conflict (id) do update set verification_status = 'Verified'`,
      [adminUserId, beneficiaryUserId],
    );

    const org = (await db.query(
      `insert into public.organizations (name, slug, created_by)
       values ($1,$2,$3) returning id`,
      [`Cash Demo LGU ${runId}`, `cash-demo-lgu-${runId}`, adminUserId],
    )).rows[0];

    await db.query(
      `insert into public.organization_memberships (organization_id, user_id, role, is_active, granted_by)
       values ($1,$2,'finance_approver',true,$2)`,
      [org.id, adminUserId],
    );

    const identity = (await db.query(
      `insert into public.beneficiary_identities (user_id, verification_status, verified_at)
       values ($1,'Verified',now())
       on conflict (user_id) do update set verification_status = 'Verified', verified_at = now()
       returning id`,
      [beneficiaryUserId],
    )).rows[0];

    // Left as the default 'draft' status: a DB trigger forbids seeding an
    // 'active' program without on-chain funding evidence, and prepare-disbursement
    // only requires aid_type = 'cash', not an active status.
    const program = (await db.query(
      `insert into public.programs (name, organization_id, aid_type, created_by,
         total_budget, amount_per_beneficiary, asset_code)
       values ($1,$2,'cash',$3,10000,100,'RCPHP') returning id`,
      [`Cash Demo Program ${runId}`, org.id, adminUserId],
    )).rows[0];

    await db.query(
      `insert into public.enrollments (program_id, beneficiary_id, beneficiary_identity_id,
         approval_status, category, allocation_amount_stroops, approved_by, approved_at)
       values ($1,$2,$3,'Approved','Cash',1000000000,$4,now())`,
      [program.id, beneficiaryUserId, identity.id, adminUserId],
    );

    // The verification-state check requires proof digests + verified_at/by when
    // verified. This is seed evidence for a local pilot wallet whose address is
    // an already-provisioned testnet account; no raw proof material is retained.
    const wallet = (await db.query(
      `insert into public.wallets (owner_type, owner_id, purpose, network, address,
         verification_status, is_active, proof_challenge_digest, proof_signature_digest,
         proof_challenge_issued_at, verified_at, verified_by)
       values ('beneficiary_identity',$1,'beneficiary','stellar_testnet',$2,'verified',true,
         $3,$4,now(),now(),$5)
       returning id`,
      [
        identity.id,
        beneficiaryWalletAddress,
        hex64(`challenge:${beneficiaryWalletAddress}`),
        hex64(`signature:${beneficiaryWalletAddress}`),
        adminUserId,
      ],
    )).rows[0];

    console.log('Cash demo seed complete.');
    console.log('  org id:                 ', org.id);
    console.log('  program id:             ', program.id);
    console.log('  org-admin email:        ', adminEmail);
    console.log('  org-admin password:     ', password);
    console.log('  org-admin user id:      ', adminUserId);
    console.log('  beneficiary profile id: ', beneficiaryUserId, '(send as beneficiaryProfileId)');
    console.log('  beneficiary identity id:', identity.id);
    console.log('  beneficiary wallet id:  ', wallet.id);
    console.log('  beneficiary wallet addr:', beneficiaryWalletAddress);
    console.log('');
    console.log('prepare-disbursement body:');
    console.log(
      JSON.stringify(
        { programId: program.id, recipients: [{ beneficiaryProfileId: beneficiaryUserId, amountStroops: 1_000_000_000 }] },
        null,
        2,
      ),
    );
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(`seed failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

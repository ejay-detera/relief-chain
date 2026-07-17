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

const databaseUrl = process.env.SUPABASE_DB_URL?.trim() || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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

  try {
    // 1. Get an active LGU admin (to act as verifier)
    const adminUser = (await db.query(`SELECT id FROM public.profiles WHERE role = 'lgu' LIMIT 1`)).rows[0];
    if (!adminUser) throw new Error("No LGU admin found to verify users.");
    const adminUserId = adminUser.id;

    // 2. See if there is a program with locations we can match
    const program = (await db.query(`
      SELECT p.id, pa.area_id, pb.barangay_id 
      FROM programs p
      LEFT JOIN program_areas pa ON pa.program_id = p.id
      LEFT JOIN program_barangays pb ON pb.program_id = p.id
      WHERE p.status = 'active' OR p.status = 'published' OR p.status = 'funding'
      LIMIT 1
    `)).rows[0];

    const areaId = program?.area_id || null;
    const barangayId = program?.barangay_id || null;

    console.log(`Matching seeded beneficiaries to Area: ${areaId}, Barangay: ${barangayId}`);

    for (let i = 1; i <= 5; i++) {
      const runId = Date.now().toString(36) + i;
      const email = `test-beneficiary-${runId}@example.test`;
      
      console.log(`Creating beneficiary ${i}/5: ${email}`);
      const userId = await createUser(email, 'beneficiary');

      // Update profile to Verified and set location
      await db.query(
        `update public.profiles 
         set full_name = $2, verification_status = 'Verified', area_id = $3, barangay_id = $4 
         where id = $1`,
        [userId, `Test Beneficiary ${i}`, areaId, barangayId],
      );

      // Verify beneficiary identity
      const identity = (await db.query(
        `update public.beneficiary_identities 
         set verification_status = 'Verified', verified_at = now() 
         where user_id = $1 returning id`,
        [userId],
      )).rows[0];

      // Add a Stellar Wallet
      const walletSecret = Keypair.random().secret();
      const walletAddress = Keypair.fromSecret(walletSecret).publicKey();

      await db.query(
        `insert into public.wallets (owner_type, owner_id, purpose, network, address,
           verification_status, is_active, proof_challenge_digest, proof_signature_digest,
           proof_challenge_issued_at, verified_at, verified_by)
         values ('beneficiary_identity',$1,'beneficiary','stellar_testnet',$2,'verified',true,
           $3,$4,now(),now(),$5)`,
        [
          identity.id,
          walletAddress,
          hex64(`challenge:${walletAddress}`),
          hex64(`signature:${walletAddress}`),
          adminUserId,
        ],
      );
      
      // If program exists and needs enrollment, let's just enroll them to be safe
      if (program) {
        await db.query(
          `insert into public.enrollments (program_id, beneficiary_id, beneficiary_identity_id,
             approval_status, category, allocation_amount_stroops, approved_by, approved_at)
           values ($1,$2,$3,'Approved','Cash',10000000000,$4,now())
           on conflict do nothing`,
          [program.id, userId, identity.id, adminUserId],
        );
      }
    }

    console.log('\\nSuccessfully seeded 5 new verified beneficiaries!');
    console.log('Password for all accounts:', password);
  } catch (error) {
    console.error('Migration/Seeding failed:', error);
  } finally {
    await db.end();
  }
}

main();

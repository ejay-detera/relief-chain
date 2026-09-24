// Full demo seed with existing Stellar wallets
// Creates organization, program, wallets, and enrollments for complete functionality

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import pg from 'pg';

const url = process.env.SUPABASE_URL?.trim() || 'http://192.168.254.100:54321';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const databaseUrl = process.env.SUPABASE_DB_URL?.trim() || 
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const wallets = {
  beneficiary: 'GBUPDPZIADTBOAVZ73U76WSOOTSQYGBBLVPDD2R5TIRMBZHUMU7Z6MJT',
  merchant: 'GB3424ZG7VVPTUBOXIJPNYF2CSOWBHXYG7SAN2FMFRZKPIKJAFNSQI62',
  organization: 'GCQ7R3LPER3L6GRO24A47HCZQGA6KGXRW7SHZEIBEO2NGGDC542YBUFM',
};

const hex64 = (value) => createHash('sha256').update(value).digest('hex');
const runId = Date.now().toString(36);
const password = 'password';

async function findUserByEmail(email) {
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Failed to list users: ${error.message}`);
    
    const user = data.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < 1000) return null;
    page++;
  }
}

async function main() {
  console.log('🌱 Setting up full Relief Chain demo...\n');
  
  // Get existing users
  const beneficiaryUser = await findUserByEmail('beneficary@example.com');
  const merchantUser = await findUserByEmail('merchant@example.com');
  const adminUser = await findUserByEmail('admin@merchant.com');
  
  if (!beneficiaryUser || !merchantUser || !adminUser) {
    throw new Error('Users not found. Run seed-test-users.mjs first.');
  }
  
  console.log('✅ Found all auth users');
  
  const db = new pg.Client(databaseUrl);
  await db.connect();
  
  try {
    // Update profiles
    console.log('\n📋 Setting up profiles...');
    await db.query(`
      INSERT INTO public.profiles (id, role, full_name, verification_status)
      VALUES 
        ($1, 'lgu', 'Admin User', 'Verified'),
        ($2, 'beneficiary', 'Test Beneficiary', 'Verified'),
        ($3, 'merchant', 'Merchant Owner', 'Verified')
      ON CONFLICT (id) DO UPDATE SET 
        verification_status = 'Verified',
        full_name = EXCLUDED.full_name
    `, [adminUser.id, beneficiaryUser.id, merchantUser.id]);
    console.log('   ✅ Profiles updated');
    
    // Create organization
    console.log('\n🏢 Creating organization...');
    const orgResult = await db.query(`
      INSERT INTO public.organizations (name, slug, created_by)
      VALUES ($1, $2, $3)
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
      RETURNING id, name
    `, [`Demo Relief Org ${runId}`, `demo-relief-org-${runId}`, adminUser.id]);
    
    const orgId = orgResult.rows[0].id;
    console.log(`   ✅ Organization: ${orgResult.rows[0].name}`);
    
    // Organization membership
    await db.query(`
      INSERT INTO public.organization_memberships (organization_id, user_id, role, is_active, granted_by)
      VALUES ($1, $2, 'organization_administrator', true, $2)
      ON CONFLICT (organization_id, user_id) DO UPDATE SET is_active = true
    `, [orgId, adminUser.id]);
    console.log('   ✅ Admin membership created');
    
    // Organization wallet
    console.log('\n💳 Creating organization treasury wallet...');
    const orgWalletResult = await db.query(`
      INSERT INTO public.wallets (
        owner_type, owner_id, purpose, network, address,
        verification_status, is_active,
        proof_challenge_digest, proof_signature_digest,
        proof_challenge_issued_at, verified_at, verified_by
      )
      VALUES (
        'organization', $1, 'organization_treasury', 'stellar_testnet', $2,
        'verified', true,
        $3, $4, now(), now(), $5
      )
      ON CONFLICT (network, address) DO UPDATE SET
        owner_type = EXCLUDED.owner_type,
        owner_id = EXCLUDED.owner_id,
        is_active = true
      RETURNING id
    `, [
      orgId,
      wallets.organization,
      hex64(`challenge:${wallets.organization}`),
      hex64(`signature:${wallets.organization}`),
      adminUser.id
    ]);
    console.log(`   ✅ Treasury wallet: ${wallets.organization}`);
    
    // Create program
    console.log('\n💰 Creating cash assistance program...');
    const programResult = await db.query(`
      INSERT INTO public.programs (
        name, organization_id, aid_type, created_by,
        total_budget, amount_per_beneficiary,
        asset_code, asset_issuer,
        budget_stroops, default_allocation_stroops,
        treasury_wallet_id
      )
      VALUES ($1, $2, 'cash', $3, 50000, 1000, 'RCPHP', 
              'GBC6HZTIUH6C3KQR5D3NOS2PJ7YKQJQNAQGAO3WO4PICJEXPAPGRKSQ7',
              5000000000000, 100000000000, $4)
      RETURNING id, name
    `, [
      `Demo Cash Program ${runId}`,
      orgId,
      adminUser.id,
      orgWalletResult.rows[0].id
    ]);
    
    const programId = programResult.rows[0].id;
    console.log(`   ✅ Program: ${programResult.rows[0].name}`);
    
    // Beneficiary identity
    console.log('\n👤 Creating beneficiary identity...');
    const identityResult = await db.query(`
      INSERT INTO public.beneficiary_identities (user_id, verification_status, verified_at)
      VALUES ($1, 'Verified', now())
      ON CONFLICT (user_id) DO UPDATE SET 
        verification_status = 'Verified',
        verified_at = now()
      RETURNING id
    `, [beneficiaryUser.id]);
    
    const identityId = identityResult.rows[0].id;
    console.log(`   ✅ Identity ID: ${identityId}`);
    
    // Beneficiary wallet
    console.log('\n💳 Creating beneficiary wallet...');
    await db.query(`
      INSERT INTO public.wallets (
        owner_type, owner_id, purpose, network, address,
        verification_status, is_active,
        proof_challenge_digest, proof_signature_digest,
        proof_challenge_issued_at, verified_at, verified_by
      )
      VALUES (
        'beneficiary_identity', $1, 'beneficiary', 'stellar_testnet', $2,
        'verified', true,
        $3, $4, now(), now(), $5
      )
      ON CONFLICT (network, address) DO UPDATE SET
        owner_type = EXCLUDED.owner_type,
        owner_id = EXCLUDED.owner_id,
        is_active = true
    `, [
      identityId,
      wallets.beneficiary,
      hex64(`challenge:${wallets.beneficiary}`),
      hex64(`signature:${wallets.beneficiary}`),
      adminUser.id
    ]);
    console.log(`   ✅ Beneficiary wallet: ${wallets.beneficiary}`);
    
    // Program enrollment
    console.log('\n📝 Enrolling beneficiary in program...');
    await db.query(`
      INSERT INTO public.enrollments (
        program_id, beneficiary_id, beneficiary_identity_id,
        approval_status, category, allocation_amount_stroops,
        approved_by, approved_at
      )
      VALUES ($1, $2, $3, 'Approved', 'Cash', 100000000000, $4, now())
      ON CONFLICT (program_id, beneficiary_identity_id) DO UPDATE SET
        approval_status = 'Approved',
        allocation_amount_stroops = EXCLUDED.allocation_amount_stroops
    `, [programId, beneficiaryUser.id, identityId, adminUser.id]);
    console.log('   ✅ Beneficiary enrolled');
    
    // Merchant entity
    console.log('\n🏪 Creating merchant entity...');
    const merchantResult = await db.query(`
      INSERT INTO public.merchant_entities (profile_id, display_name)
      VALUES ($1, 'Demo Merchant Store')
      ON CONFLICT (profile_id) DO UPDATE SET display_name = EXCLUDED.display_name
      RETURNING id
    `, [merchantUser.id]);
    
    const merchantId = merchantResult.rows[0].id;
    console.log(`   ✅ Merchant entity ID: ${merchantId}`);
    
    // Merchant wallet
    console.log('\n💳 Creating merchant wallet...');
    await db.query(`
      INSERT INTO public.wallets (
        owner_type, owner_id, purpose, network, address,
        verification_status, is_active,
        proof_challenge_digest, proof_signature_digest,
        proof_challenge_issued_at, verified_at, verified_by
      )
      VALUES (
        'merchant_entity', $1, 'merchant_settlement', 'stellar_testnet', $2,
        'verified', true,
        $3, $4, now(), now(), $5
      )
      ON CONFLICT (network, address) DO UPDATE SET
        owner_type = EXCLUDED.owner_type,
        owner_id = EXCLUDED.owner_id,
        is_active = true
    `, [
      merchantId,
      wallets.merchant,
      hex64(`challenge:${wallets.merchant}`),
      hex64(`signature:${wallets.merchant}`),
      adminUser.id
    ]);
    console.log(`   ✅ Merchant wallet: ${wallets.merchant}`);
    
    // Merchant accreditation
    console.log('\n✅ Creating merchant accreditation...');
    await db.query(`
      INSERT INTO public.merchant_accreditations (
        organization_id, merchant_id, category, status,
        valid_from, valid_until, approved_by, approved_at
      )
      VALUES ($1, $2, 'Grocery', 'active',
              now() - interval '1 day', now() + interval '1 year',
              $3, now())
      ON CONFLICT (organization_id, merchant_id, category) DO UPDATE SET
        status = 'active',
        valid_until = now() + interval '1 year'
    `, [orgId, merchantId, adminUser.id]);
    console.log('   ✅ Merchant accredited');
    
    // Program merchant authorization
    console.log('\n🔐 Authorizing merchant for program...');
    await db.query(`
      INSERT INTO public.program_merchants (
        program_id, merchant_id, category, status,
        correlation_id, authorized_by
      )
      VALUES ($1, $2, 'Grocery', 'authorized', gen_random_uuid(), $3)
      ON CONFLICT (program_id, merchant_id) DO UPDATE SET
        status = 'authorized',
        category = EXCLUDED.category
    `, [programId, merchantId, adminUser.id]);
    console.log('   ✅ Merchant authorized for program');
    
    console.log('\n✅ Full demo setup complete!\n');
    console.log('📊 Summary:');
    console.log(`   Organization: ${orgResult.rows[0].name} (${orgId})`);
    console.log(`   Program: ${programResult.rows[0].name} (${programId})`);
    console.log(`   \n   Beneficiary: beneficary@example.com / password`);
    console.log(`   - Wallet: ${wallets.beneficiary}`);
    console.log(`   - Enrolled with 1,000 RCPHP allocation`);
    console.log(`   \n   Merchant: merchant@example.com / password`);
    console.log(`   - Wallet: ${wallets.merchant}`);
    console.log(`   - Accredited for Grocery category`);
    console.log(`   \n   Admin/LGU: admin@merchant.com / password`);
    console.log(`   - Treasury: ${wallets.organization}`);
    console.log(`   - Can manage programs and enrollments`);
    
    console.log('\n🎉 You can now test the full app functionality!');
    console.log('\n⚠️  Note: Check https://stellar.expert/explorer/testnet to verify');
    console.log('   wallet balances and fund them with RCPHP if needed.');
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error);
    throw error;
  } finally {
    await db.end();
  }
}

main();

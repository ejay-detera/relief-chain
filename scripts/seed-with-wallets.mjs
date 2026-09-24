// Seed users with existing Stellar wallet addresses
// This links the auth users to wallet records without requiring secret keys

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

async function setupDatabase() {
  console.log('🗄️  Setting up database records...\n');
  
  const pool = new pg.Pool({ connectionString: databaseUrl });
  
  try {
    // Get user IDs
    const beneficiaryUser = await findUserByEmail('beneficary@example.com');
    const merchantUser = await findUserByEmail('merchant@example.com');
    const adminUser = await findUserByEmail('admin@merchant.com');
    
    if (!beneficiaryUser || !merchantUser || !adminUser) {
      throw new Error('Users not found. Run seed-test-users.mjs first.');
    }
    
    console.log('✅ Found all users in auth system');
    
    // Create organization for LGU admin
    console.log('\n📋 Creating organization...');
    const orgResult = await pool.query(`
      INSERT INTO organizations (
        name, type, location, contact_email,
        representative_name, representative_position,
        document_reference, status, created_by
      ) VALUES (
        'Demo Relief Organization',
        'Municipal',
        'Demo City, Demo Province',
        'admin@merchant.com',
        'Admin User',
        'Administrator',
        'DEMO-ORG-001',
        'verified',
        $1
      )
      ON CONFLICT (name) DO UPDATE SET
        contact_email = EXCLUDED.contact_email
      RETURNING id, name
    `, [adminUser.id]);
    
    const orgId = orgResult.rows[0].id;
    console.log(`   ✅ Organization: ${orgResult.rows[0].name} (${orgId})`);
    
    // Create organization profile for admin
    await pool.query(`
      INSERT INTO profiles (id, role, organization_id)
      VALUES ($1, 'lgu', $2)
      ON CONFLICT (id) DO UPDATE SET
        role = EXCLUDED.role,
        organization_id = EXCLUDED.organization_id
    `, [adminUser.id, orgId]);
    console.log('   ✅ Admin profile linked to organization');
    
    // Create cash assistance program
    console.log('\n💰 Creating cash assistance program...');
    const programResult = await pool.query(`
      INSERT INTO programs (
        organization_id,
        name,
        description,
        aid_type,
        amount_per_beneficiary,
        target_beneficiaries,
        start_date,
        end_date,
        status,
        created_by
      ) VALUES (
        $1,
        'Demo Cash Assistance Program',
        'Test program for relief chain demo',
        'cash',
        5000.00,
        100,
        CURRENT_DATE,
        CURRENT_DATE + INTERVAL '6 months',
        'active',
        $2
      )
      ON CONFLICT (organization_id, name) DO UPDATE SET
        status = 'active'
      RETURNING id, name
    `, [orgId, adminUser.id]);
    
    const programId = programResult.rows[0].id;
    console.log(`   ✅ Program: ${programResult.rows[0].name} (${programId})`);
    
    // Create beneficiary profile
    console.log('\n👤 Creating beneficiary profile...');
    await pool.query(`
      INSERT INTO profiles (id, role)
      VALUES ($1, 'beneficiary')
      ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role
    `, [beneficiaryUser.id]);
    
    const benefIdentityResult = await pool.query(`
      INSERT INTO beneficiary_identities (
        profile_id,
        first_name,
        last_name,
        date_of_birth,
        contact_number,
        municipality,
        barangay,
        household_size,
        monthly_income,
        valid_id_type,
        valid_id_number,
        verification_status
      ) VALUES (
        $1, 'Test', 'Beneficiary', '1990-01-01', '+639123456789',
        'Demo City', 'Demo Barangay', 4, 5000,
        'National ID', 'TEST-ID-001', 'verified'
      )
      ON CONFLICT (profile_id) DO UPDATE SET
        verification_status = 'verified'
      RETURNING id
    `, [beneficiaryUser.id]);
    
    const benefIdentityId = benefIdentityResult.rows[0].id;
    console.log(`   ✅ Beneficiary identity created (${benefIdentityId})`);
    
    // Create beneficiary wallet
    console.log('\n💳 Creating beneficiary wallet...');
    await pool.query(`
      INSERT INTO wallets (
        beneficiary_profile_id,
        stellar_address,
        status,
        last_synced_ledger
      ) VALUES ($1, $2, 'active', 0)
      ON CONFLICT (stellar_address) DO UPDATE SET
        status = 'active',
        beneficiary_profile_id = EXCLUDED.beneficiary_profile_id
    `, [beneficiaryUser.id, wallets.beneficiary]);
    console.log(`   ✅ Wallet: ${wallets.beneficiary}`);
    
    // Enroll beneficiary in program
    console.log('\n📝 Enrolling beneficiary in program...');
    await pool.query(`
      INSERT INTO program_enrollments (
        program_id,
        beneficiary_identity_id,
        enrollment_status,
        enrolled_by
      ) VALUES ($1, $2, 'active', $3)
      ON CONFLICT (program_id, beneficiary_identity_id) DO UPDATE SET
        enrollment_status = 'active'
    `, [programId, benefIdentityId, adminUser.id]);
    console.log('   ✅ Beneficiary enrolled in program');
    
    // Create merchant entity
    console.log('\n🏪 Creating merchant entity...');
    await pool.query(`
      INSERT INTO profiles (id, role)
      VALUES ($1, 'merchant')
      ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role
    `, [merchantUser.id]);
    
    const merchantResult = await pool.query(`
      INSERT INTO merchant_entities (
        profile_id,
        business_name,
        business_type,
        business_address,
        business_permit_number,
        tin,
        contact_person,
        contact_number,
        verification_status
      ) VALUES (
        $1,
        'Demo Merchant Store',
        'Retail',
        'Demo Address, Demo City',
        'BP-2024-001',
        '123-456-789-000',
        'Merchant Owner',
        '+639111222333',
        'verified'
      )
      ON CONFLICT (profile_id) DO UPDATE SET
        verification_status = 'verified'
      RETURNING id
    `, [merchantUser.id]);
    
    const merchantId = merchantResult.rows[0].id;
    console.log(`   ✅ Merchant entity created (${merchantId})`);
    
    // Create merchant wallet
    console.log('\n💳 Creating merchant wallet...');
    await pool.query(`
      INSERT INTO wallets (
        merchant_profile_id,
        stellar_address,
        status,
        last_synced_ledger
      ) VALUES ($1, $2, 'active', 0)
      ON CONFLICT (stellar_address) DO UPDATE SET
        status = 'active',
        merchant_profile_id = EXCLUDED.merchant_profile_id
    `, [merchantUser.id, wallets.merchant]);
    console.log(`   ✅ Wallet: ${wallets.merchant}`);
    
    // Create merchant accreditation
    console.log('\n✅ Creating merchant accreditation...');
    await pool.query(`
      INSERT INTO merchant_accreditations (
        merchant_entity_id,
        program_id,
        accreditation_status,
        accredited_by
      ) VALUES ($1, $2, 'active', $3)
      ON CONFLICT (merchant_entity_id, program_id) DO UPDATE SET
        accreditation_status = 'active'
    `, [merchantId, programId, adminUser.id]);
    console.log('   ✅ Merchant accredited for program');
    
    // Create organization treasury wallet record
    console.log('\n🏦 Creating organization treasury wallet...');
    await pool.query(`
      INSERT INTO wallets (
        organization_id,
        stellar_address,
        status,
        last_synced_ledger
      ) VALUES ($1, $2, 'active', 0)
      ON CONFLICT (stellar_address) DO UPDATE SET
        status = 'active',
        organization_id = EXCLUDED.organization_id
    `, [orgId, wallets.organization]);
    console.log(`   ✅ Wallet: ${wallets.organization}`);
    
    console.log('\n✅ Database setup complete!\n');
    
    console.log('📊 Summary:');
    console.log(`   Organization: Demo Relief Organization (${orgId})`);
    console.log(`   Program: Demo Cash Assistance Program (${programId})`);
    console.log(`   Beneficiary: beneficary@example.com`);
    console.log(`   - Wallet: ${wallets.beneficiary}`);
    console.log(`   - Enrolled in program`);
    console.log(`   Merchant: merchant@example.com`);
    console.log(`   - Wallet: ${wallets.merchant}`);
    console.log(`   - Accredited for program`);
    console.log(`   Admin: admin@merchant.com`);
    console.log(`   - Organization treasury: ${wallets.organization}`);
    
    console.log('\n⚠️  Important Notes:');
    console.log('   • Wallets are linked but you need secret keys for transactions');
    console.log('   • Edge Functions require STELLAR_*_SECRET env vars to sign txs');
    console.log('   • Check https://stellar.expert to verify wallet balances');
    console.log('   • The app can display balances but cannot initiate payments without secrets');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

setupDatabase();

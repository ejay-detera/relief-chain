// Simple seed script to create three test users for app testing
// Usage:
//   node ./scripts/seed-test-users.mjs

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL?.trim() || 'http://127.0.0.1:54321';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

if (!serviceRoleKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY is required.');
  console.error('   Get it from: npx supabase status -o env');
  process.exit(1);
}

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const users = [
  { email: 'beneficary@example.com', password: 'password', role: 'beneficiary' },
  { email: 'merchant@example.com', password: 'password', role: 'merchant' },
  { email: 'admin@merchant.com', password: 'password', role: 'lgu' },
];

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

async function ensureUser(email, password, role) {
  console.log(`\n🔍 Checking user: ${email} (${role})`);
  
  const existing = await findUserByEmail(email);
  
  if (existing) {
    console.log(`   ✅ User already exists (ID: ${existing.id})`);
    
    // Update password
    const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    
    if (updateError) {
      console.error(`   ⚠️  Failed to update password: ${updateError.message}`);
    } else {
      console.log(`   ✅ Password updated`);
    }
    
    return existing;
  }
  
  // Create new user
  const userMetadata = {
    role,
    registration_role: role,
  };

  // Add LGU-specific metadata
  if (role === 'lgu') {
    Object.assign(userMetadata, {
      organization_name: 'Demo Merchant Organization',
      organization_type: 'Municipal',
      location: 'Demo City',
      representative_first_name: 'Admin',
      representative_last_name: 'User',
      representative_position: 'Administrator',
      organization_document_reference: 'DEMO-DOC-001',
    });
  }

  // Add beneficiary-specific metadata
  if (role === 'beneficiary') {
    Object.assign(userMetadata, {
      first_name: 'Test',
      last_name: 'Beneficiary',
      date_of_birth: '1990-01-01',
      contact_number: '+639123456789',
      municipality: 'Demo City',
      barangay: 'Demo Barangay',
      household_size: 4,
      monthly_income: 5000,
      valid_id_type: 'National ID',
      valid_id_number: 'TEST-ID-001',
      emergency_contact_name: 'Emergency Contact',
      emergency_contact_number: '+639987654321',
    });
  }

  // Add merchant-specific metadata
  if (role === 'merchant') {
    Object.assign(userMetadata, {
      business_name: 'Demo Merchant Store',
      business_type: 'Retail',
      business_address: 'Demo Address, Demo City',
      business_permit_number: 'BP-2024-001',
      tin: '123-456-789-000',
      contact_person: 'Merchant Owner',
      contact_number: '+639111222333',
      bank_account_name: 'Demo Merchant',
      bank_account_number: '1234567890',
      bank_name: 'Demo Bank',
    });
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: userMetadata,
  });

  if (error) {
    console.error(`   ❌ Failed to create user: ${error.message}`);
    throw error;
  }

  console.log(`   ✅ User created (ID: ${data.user.id})`);
  return data.user;
}

async function seedUsers() {
  console.log('🌱 Seeding test users...');
  console.log(`📍 Supabase URL: ${url}`);
  
  try {
    for (const user of users) {
      await ensureUser(user.email, user.password, user.role);
    }
    
    console.log('\n✅ All test users created successfully!');
    console.log('\n📋 Login Credentials:');
    console.log('   Beneficiary: beneficary@example.com / password');
    console.log('   Merchant:    merchant@example.com / password');
    console.log('   Admin/LGU:   admin@merchant.com / password');
    console.log('\n⚠️  Note: These are minimal profiles. Some app features may require');
    console.log('   additional database records (wallets, programs, etc.)');
    
  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    process.exit(1);
  }
}

seedUsers();

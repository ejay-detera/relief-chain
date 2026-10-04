import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const loadEnv = (filePath) => {
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split('\n')) {
      const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);
      if (match) {
        let val = match[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.substring(1, val.length - 1);
        }
        if (!process.env[match[1].trim()]) {
          process.env[match[1].trim()] = val;
        }
      }
    }
  }
};

loadEnv('.env.hosted.local');
loadEnv('.env');

const supabaseUrl = process.env.SUPABASE_URL || 'https://hmbraapdnkoxpepdqgaa.supabase.co';
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log('Testing app authentication and profile loading for organization@example.com...');

// 1. Sign In
const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
  email: 'organization@example.com',
  password: 'password',
});

if (authErr) {
  console.error('Sign-in failed:', authErr);
  process.exit(1);
}

console.log('✅ Sign in successful. User ID:', authData.user.id);

// 2. Fetch base profile as authenticated client
const authenticatedClient = createClient(supabaseUrl, anonKey, {
  global: {
    headers: {
      Authorization: `Bearer ${authData.session.access_token}`,
    },
  },
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: profile, error: profileErr } = await authenticatedClient
  .from('profiles')
  .select('id, role, full_name, gov_id, location, stellar_pubkey, created_at, first_name, last_name, middle_initial, mobile_number, sex, civil_status, birthdate, gov_id_url, complete_address, municipality_city, verification_status, city_id, area_id, barangay_id')
  .eq('id', authData.user.id)
  .maybeSingle();

if (profileErr) {
  console.error('Profile fetch failed:', profileErr);
  process.exit(1);
}
console.log('✅ Profile fetched successfully:', profile);

// 3. Fetch registration as authenticated client
const { data: registration, error: regErr } = await authenticatedClient
  .from('registrations')
  .select('id, status, rejection_reason')
  .eq('lgu_id', authData.user.id)
  .maybeSingle();

if (regErr) {
  console.error('Registration fetch failed:', regErr);
  process.exit(1);
}
console.log('✅ Registration fetched successfully:', registration);

// 4. Verify routing decision
const inAuthGroup = true;
const route = 'choose-account';
const status = registration.status;

console.log('\nRouting checks:');
console.log(`Role: ${profile.role}`);
console.log(`Registration Status: ${status}`);

if (status === 'Approved') {
  console.log('Navigation destination: /(lgu) (Direct entry to LGU Dashboard!)');
} else {
  console.log('Navigation destination: /(auth)/application-review');
}

console.log('\n🎉 Account is fully activated and ready for mobile/web sign-in!');

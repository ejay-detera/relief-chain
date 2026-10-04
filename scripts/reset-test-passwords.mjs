#!/usr/bin/env node
/**
 * Synchronize and reset passwords for Relief Chain demo accounts.
 *
 * Usage:
 *   node ./scripts/reset-test-passwords.mjs
 *   node ./scripts/reset-test-passwords.mjs --password myNewPassword
 *
 * Reads credentials from .env.hosted.local or environment variables:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

// 1. Load hosted environment if present
const hostedEnvPath = path.resolve('.env.hosted.local');
if (fs.existsSync(hostedEnvPath)) {
  const content = fs.readFileSync(hostedEnvPath, 'utf8');
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

// Load anon key from .env for login verification
const envPath = path.resolve('.env');
let anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (fs.existsSync(envPath) && !anonKey) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const match = line.match(/^\s*EXPO_PUBLIC_SUPABASE_ANON_KEY\s*=\s*(.*)$/);
    if (match) {
      anonKey = match[1].trim().replace(/^['"]|['"]$/g, '');
    }
  }
}

const supabaseUrl = process.env.SUPABASE_URL?.trim() || 'https://hmbraapdnkoxpepdqgaa.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!serviceRoleKey) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY is required.');
  console.error('   Ensure .env.hosted.local exists or provide SUPABASE_SERVICE_ROLE_KEY in your environment.');
  process.exit(1);
}

// Parse custom password argument if provided
let targetPassword = 'password';
const args = process.argv.slice(2);
const pwdIdx = args.indexOf('--password');
if (pwdIdx !== -1 && args[pwdIdx + 1]) {
  targetPassword = args[pwdIdx + 1];
}

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const targetEmails = [
  { role: 'Organization / LGU Admin', email: 'admin@example.com' },
  { role: 'Beneficiary', email: 'beneficiary@example.com' },
  { role: 'Merchant', email: 'merchant@example.com' },
];

async function findUserByEmail(email) {
  let page = 1;
  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 1000) return null;
    page++;
  }
}

async function main() {
  console.log(`🔐 Resetting Relief Chain demo user passwords to: "${targetPassword}"`);
  console.log(`📍 Supabase endpoint: ${supabaseUrl}\n`);

  for (const account of targetEmails) {
    process.stdout.write(`Updating ${account.role} (${account.email})... `);
    const user = await findUserByEmail(account.email);
    if (!user) {
      console.log('⚠️  NOT FOUND in auth.users!');
      continue;
    }

    const { error: updateError } = await adminClient.auth.admin.updateUserById(user.id, {
      password: targetPassword,
      email_confirm: true,
    });

    if (updateError) {
      console.log(`❌ Failed: ${updateError.message}`);
    } else {
      console.log('✅ Updated successfully');
    }
  }

  // Verification step
  if (anonKey) {
    console.log('\n🧪 Verifying sign-in with client credentials:');
    const verifyClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    for (const account of targetEmails) {
      const { data, error } = await verifyClient.auth.signInWithPassword({
        email: account.email,
        password: targetPassword,
      });

      if (error) {
        console.log(`   ❌ ${account.email}: FAILED (${error.message})`);
      } else {
        console.log(`   ✅ ${account.email}: SIGN-IN VERIFIED (User ID: ${data.user.id})`);
      }
    }
  }

  console.log('\n🎉 Password reset complete! All test accounts can now log in with: ' + targetPassword);
}

main().catch((err) => {
  console.error('\n❌ Unhandled error:', err);
  process.exit(1);
});

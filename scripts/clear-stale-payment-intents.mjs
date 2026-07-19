#!/usr/bin/env node
/**
 * Clear stale payment intents from the database.
 * 
 * This script removes payment intents that are stuck in "requested" or "prepared"
 * states, allowing the beneficiary to retry payments with fresh merchant QR codes.
 * 
 * Usage:
 *   node scripts/clear-stale-payment-intents.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Load environment variables from .env file
const envPath = join(rootDir, '.env');
const envContent = readFileSync(envPath, 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0) {
      env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
    }
  }
}

const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   - EXPO_PUBLIC_SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function clearStaleIntents() {
  console.log('🔍 Finding stale payment intents...\n');

  // Find all payment intents that are stuck
  const { data: staleIntents, error: fetchError } = await supabase
    .from('payment_intents')
    .select('id, financial_intent_id, status, created_at, invoice_id')
    .in('status', ['requested', 'prepared'])
    .order('created_at', { ascending: false });

  if (fetchError) {
    console.error('❌ Error fetching payment intents:', fetchError);
    process.exit(1);
  }

  if (!staleIntents || staleIntents.length === 0) {
    console.log('✅ No stale payment intents found.');
    return;
  }

  console.log(`Found ${staleIntents.length} stale payment intent(s):\n`);
  
  for (const intent of staleIntents) {
    console.log(`  • ID: ${intent.id}`);
    console.log(`    Financial Intent: ${intent.financial_intent_id}`);
    console.log(`    Status: ${intent.status}`);
    console.log(`    Created: ${intent.created_at}`);
    console.log(`    Invoice: ${intent.invoice_id || 'none'}`);
    console.log('');
  }

  // Update the stale intents to "expired" instead of deleting
  // (database constraints prevent deletion of financial workflow history)
  console.log('🔄 Marking stale payment intents as expired...\n');

  const { error: updateError } = await supabase
    .from('payment_intents')
    .update({ status: 'expired' })
    .in('status', ['requested', 'prepared']);

  if (updateError) {
    console.error('❌ Error updating payment intents:', updateError);
    process.exit(1);
  }

  console.log(`✅ Successfully marked ${staleIntents.length} stale payment intent(s) as expired.\n`);
  
  // Also check for stale financial_intents
  console.log('🔍 Checking for orphaned financial intents...\n');

  const financialIntentIds = staleIntents.map(i => i.financial_intent_id);
  
  const { data: orphanedFinancialIntents, error: financialError } = await supabase
    .from('financial_intents')
    .select('id, created_at')
    .in('id', financialIntentIds);

  if (financialError) {
    console.error('❌ Error fetching financial intents:', financialError);
    process.exit(1);
  }

  if (orphanedFinancialIntents && orphanedFinancialIntents.length > 0) {
    console.log(`Found ${orphanedFinancialIntents.length} related financial intent(s):\n`);
    
    for (const intent of orphanedFinancialIntents) {
      console.log(`  • ID: ${intent.id}`);
      console.log(`    Created: ${intent.created_at}`);
      console.log('');
    }

    // Note: We don't automatically delete or update financial_intents because they might have
    // transaction_attempts that need investigation. The user should manually review.
    console.log('ℹ️  These financial intents were not modified automatically.');
    console.log('   They may have transaction attempts that need investigation.');
    console.log('   Review them manually if needed.\n');
  } else {
    console.log('✅ No related financial intents found.\n');
  }

  console.log('✅ Cleanup complete! The beneficiary can now scan a NEW merchant QR code.');
  console.log('\n⚠️  IMPORTANT: Generate a NEW QR code with a different amount (e.g., 50 RCPHP)');
  console.log('   to get a fresh invoice nonce. Scanning the same QR will still be treated');
  console.log('   as a replay.\n');
}

clearStaleIntents().catch(console.error);

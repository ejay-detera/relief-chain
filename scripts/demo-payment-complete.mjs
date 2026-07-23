#!/usr/bin/env node
/**
 * Demo Payment Completion Script
 * 
 * Simulates a successful payment by directly updating the database.
 * This bypasses the broken Stellar SDK XDR parsing bug for live demos.
 * 
 * Usage:
 *   node scripts/demo-payment-complete.mjs <intent-id>
 * 
 * The script will:
 * 1. Mark the payment intent as "confirmed"
 * 2. Mark the transaction attempt as "confirmed"
 * 3. Generate a fake Stellar transaction hash
 * 4. Update timestamps
 * 5. Trigger balance updates (simulated)
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
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length !== 1) {
  console.error('Usage: node scripts/demo-payment-complete.mjs <intent-id>');
  console.error('');
  console.error('Get the intent ID from the mobile app logs:');
  console.error('  Look for: [preparePayment] Payment data: {"intentId": "...", ...}');
  process.exit(1);
}

const intentId = args[0];

async function completePayment() {
  console.log('\n🎬 DEMO MODE: Simulating successful payment...\n');
  console.log(`Intent ID: ${intentId}\n`);

  // 1. Get the payment intent details
  console.log('📋 Fetching payment intent...');
  const { data: paymentIntent, error: intentError } = await supabase
    .from('payment_intents')
    .select('*, financial_intents(*)')
    .eq('financial_intent_id', intentId)
    .single();

  if (intentError || !paymentIntent) {
    console.error('❌ Payment intent not found:', intentError?.message);
    process.exit(1);
  }

  console.log(`✅ Found payment intent`);
  console.log(`   Amount: ${paymentIntent.amount_stroops} stroops`);
  console.log(`   Status: ${paymentIntent.status}\n`);

  // 2. Generate a fake Stellar transaction hash
  const fakeHash = Array.from({length: 64}, () => 
    Math.floor(Math.random() * 16).toString(16)
  ).join('');

  console.log(`🔗 Generated fake transaction hash: ${fakeHash}\n`);

  // 3. Update the transaction attempt to "confirmed"
  console.log('📝 Updating transaction attempt...');
  const { data: attempt, error: attemptFetchError } = await supabase
    .from('transaction_attempts')
    .select('*')
    .eq('financial_intent_id', intentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (attemptFetchError || !attempt) {
    console.error('❌ Transaction attempt not found:', attemptFetchError?.message);
    process.exit(1);
  }

  const { error: attemptError } = await supabase
    .from('transaction_attempts')
    .update({
      status: 'confirmed',
      transaction_hash: fakeHash,
      ledger_sequence: Math.floor(Math.random() * 1000000) + 5000000, // Fake ledger
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', attempt.id);

  if (attemptError) {
    console.error('❌ Failed to update transaction attempt:', attemptError.message);
    process.exit(1);
  }

  console.log('✅ Transaction attempt marked as confirmed\n');

  // 4. Update the financial intent to "confirmed"
  console.log('📝 Updating financial intent...');
  const { error: financialError } = await supabase
    .from('financial_intents')
    .update({
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', intentId);

  if (financialError) {
    console.error('❌ Failed to update financial intent:', financialError.message);
    process.exit(1);
  }

  console.log('✅ Financial intent marked as confirmed\n');

  // 5. Update the payment intent to "confirmed"
  console.log('📝 Updating payment intent...');
  const { error: paymentError } = await supabase
    .from('payment_intents')
    .update({
      status: 'confirmed',
      transaction_hash: fakeHash,
    })
    .eq('financial_intent_id', intentId);

  if (paymentError) {
    console.error('❌ Failed to update payment intent:', paymentError.message);
    process.exit(1);
  }

  console.log('✅ Payment intent marked as confirmed\n');

  // 6. Summary
  console.log('═'.repeat(80));
  console.log('✅ DEMO PAYMENT COMPLETED SUCCESSFULLY!');
  console.log('═'.repeat(80));
  console.log('');
  console.log(`Intent ID:         ${intentId}`);
  console.log(`Transaction Hash:  ${fakeHash}`);
  console.log(`Amount:            ${paymentIntent.amount_stroops} stroops`);
  console.log(`Status:            confirmed`);
  console.log('');
  console.log('📱 The beneficiary app should now show:');
  console.log('   - Payment confirmed');
  console.log('   - Updated balance (reduced by payment amount)');
  console.log('   - Transaction in history');
  console.log('');
  console.log('🏪 The merchant app should show:');
  console.log('   - Payment received');
  console.log('   - Updated revenue stats');
  console.log('');
  console.log('⚠️  NOTE: This is a SIMULATED payment for demo purposes.');
  console.log('   No actual blockchain transaction occurred.');
  console.log('   The fake transaction hash will not exist on Stellar testnet.');
  console.log('');
  console.log('═'.repeat(80));
  console.log('');
}

completePayment().catch(console.error);

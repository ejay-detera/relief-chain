#!/usr/bin/env node
/**
 * Generate a new merchant QR code with a specified amount.
 * 
 * This script helps merchants generate invoice QR codes with different amounts,
 * which creates new invoice nonces to avoid replay detection.
 * 
 * Usage:
 *   node scripts/generate-merchant-qr.mjs <amount-in-rcphp>
 * 
 * Example:
 *   node scripts/generate-merchant-qr.mjs 50
 */

import { Keypair } from '@stellar/stellar-sdk';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createInvoiceCodec } from '../shared/invoice-codec.ts';

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
const rcphpIssuer = env.EXPO_PUBLIC_STELLAR_RCPHP_ISSUER;
const rcphpSacAddress = env.EXPO_PUBLIC_STELLAR_RCPHP_SAC_ADDRESS;

if (!supabaseUrl || !supabaseServiceKey || !rcphpIssuer || !rcphpSacAddress) {
  console.error('❌ Missing required environment variables:');
  console.error('   - EXPO_PUBLIC_SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  console.error('   - EXPO_PUBLIC_STELLAR_RCPHP_ISSUER');
  console.error('   - EXPO_PUBLIC_STELLAR_RCPHP_SAC_ADDRESS');
  process.exit(1);
}

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length !== 1) {
  console.error('Usage: node scripts/generate-merchant-qr.mjs <amount-in-rcphp>');
  console.error('Example: node scripts/generate-merchant-qr.mjs 50');
  process.exit(1);
}

const amountRCPHP = parseFloat(args[0]);
if (isNaN(amountRCPHP) || amountRCPHP <= 0) {
  console.error('❌ Amount must be a positive number');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Bootstrap merchant wallet secret
const MERCHANT_SECRET = 'SD6GD2PJF23734AKTNERWFYT6TBDUHG46T4FBV6FWJYYVDU724WUBCZ3';

async function generateMerchantQR() {
  console.log(`\n🔐 Generating merchant invoice QR code for ${amountRCPHP} RCPHP...\n`);

  // 1. Get merchant entity and wallet
  console.log('📋 Looking up merchant entity...');
  const { data: merchant, error: merchantError } = await supabase
    .from('merchant_entities')
    .select('id')
    .eq('email', 'merchant@example.com')
    .single();

  if (merchantError || !merchant) {
    console.error('❌ Merchant entity not found:', merchantError);
    process.exit(1);
  }

  const merchantId = merchant.id;
  console.log(`✅ Merchant ID: ${merchantId}\n`);

  console.log('💰 Looking up merchant settlement wallet...');
  const { data: wallet, error: walletError } = await supabase
    .from('wallets')
    .select('address')
    .eq('owner_type', 'merchant_entity')
    .eq('owner_id', merchantId)
    .eq('purpose', 'merchant_settlement')
    .single();

  if (walletError || !wallet) {
    console.error('❌ Merchant wallet not found:', walletError);
    process.exit(1);
  }

  const settlementWallet = wallet.address;
  console.log(`✅ Settlement Wallet: ${settlementWallet}\n`);

  // 2. Create invoice keypair and codec
  const merchantKeypair = Keypair.fromSecret(MERCHANT_SECRET);
  const invoiceSigner = merchantKeypair.publicKey();
  
  console.log(`🔑 Invoice Signer: ${invoiceSigner}\n`);

  const codec = createInvoiceCodec();

  // 3. Generate invoice with unique nonce
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes from now

  // Use timestamp + random to ensure unique nonce
  const nonceValue = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

  const unsignedInvoice = {
    version: 1,
    kind: 'cash',
    asset: {
      code: 'RCPHP',
      issuer: rcphpIssuer,
      sacAddress: rcphpSacAddress,
      network: 'testnet',
    },
    amountStroops: BigInt(Math.round(amountRCPHP * 10_000_000)),
    merchantId,
    settlementWallet,
    invoiceSigner,
    nonce: nonceValue,
    issuedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    receiptDigest: null,
  };

  console.log('📝 Creating signed invoice...');
  const signedInvoice = await codec.signInvoice(unsignedInvoice, MERCHANT_SECRET);
  
  console.log('📦 Encoding invoice to QR format...');
  const qrCode = codec.encodeForQR(signedInvoice);

  console.log('\n✅ Invoice Generated Successfully!\n');
  console.log('═'.repeat(80));
  console.log('Invoice Details:');
  console.log('═'.repeat(80));
  console.log(`Amount:           ${amountRCPHP} RCPHP (${unsignedInvoice.amountStroops} stroops)`);
  console.log(`Merchant ID:      ${merchantId}`);
  console.log(`Settlement:       ${settlementWallet}`);
  console.log(`Invoice Signer:   ${invoiceSigner}`);
  console.log(`Nonce:            ${nonceValue}`);
  console.log(`Issued At:        ${now.toISOString()}`);
  console.log(`Expires At:       ${expiresAt.toISOString()}`);
  console.log('═'.repeat(80));
  console.log('\n📱 QR Code Data (copy this to generate QR):\n');
  console.log(qrCode);
  console.log('\n═'.repeat(80));
  console.log('\n💡 Instructions:');
  console.log('   1. Copy the QR code data above');
  console.log('   2. Use a QR code generator (e.g., qr-code-styling.com)');
  console.log('   3. Paste the data and generate the QR code');
  console.log('   4. Display the QR code in the merchant app');
  console.log('   5. Scan with the beneficiary app to test payment\n');
}

generateMerchantQR().catch(console.error);

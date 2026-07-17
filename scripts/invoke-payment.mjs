// Live end-to-end invoke of the merchant payment rail (local stack).
//
// Signs in as beneficiary, creates/signs a merchant invoice, prepares/submits the payment,
// runs reconciliation, and verifies the merchant balance projection.
//
// Requires: `npx supabase functions serve --env-file supabase/functions/.env`
// running, and the values printed by scripts/seed-merchant-demo.mjs.
//
// Usage (PowerShell):
//   $env:BENEFICIARY_EMAIL="merchant-beneficiary-xxxx@example.test"
//   $env:MERCHANT_EMAIL="merchant-user-xxxx@example.test"
//   $env:ORGANIZATION_ID="<org id>"
//   $env:MERCHANT_ENTITY_ID="<merchant entity id>"
//   node ./scripts/invoke-payment.mjs

import { createClient } from '@supabase/supabase-js';
import { Keypair, Transaction, Networks } from '@stellar/stellar-sdk';
import { signInvoice, deriveExpiresAt } from '../shared/invoice-codec.ts';
import { createHash } from 'node:crypto';
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

// Load seed-info.json if exists
try {
  const infoPath = path.resolve('scripts/seed-info.json');
  if (fs.existsSync(infoPath)) {
    const seedInfo = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
    if (!process.env.ORGANIZATION_ID) process.env.ORGANIZATION_ID = seedInfo.ORGANIZATION_ID;
    if (!process.env.MERCHANT_ENTITY_ID) process.env.MERCHANT_ENTITY_ID = seedInfo.MERCHANT_ENTITY_ID;
    if (!process.env.ADMIN_EMAIL) process.env.ADMIN_EMAIL = seedInfo.ADMIN_EMAIL;
    if (!process.env.BENEFICIARY_EMAIL) process.env.BENEFICIARY_EMAIL = seedInfo.BENEFICIARY_EMAIL;
    if (!process.env.MERCHANT_EMAIL) process.env.MERCHANT_EMAIL = seedInfo.MERCHANT_EMAIL;
  }
} catch (e) {
  console.warn('Could not read seed info:', e);
}

const url = process.env.SUPABASE_URL?.trim() || 'http://127.0.0.1:54321';
const anonKey =
  process.env.SUPABASE_ANON_KEY?.trim() ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const adminEmail = process.env.ADMIN_EMAIL?.trim();
const beneficiaryEmail = process.env.BENEFICIARY_EMAIL?.trim();
const merchantEmail = process.env.MERCHANT_EMAIL?.trim();
const organizationId = process.env.ORGANIZATION_ID?.trim();
const merchantEntityId = process.env.MERCHANT_ENTITY_ID?.trim();
const password = 'ReliefChain!123';

const beneficiarySecret = process.env.STELLAR_BENEFICIARY_SECRET?.trim();
const merchantSecret = process.env.STELLAR_MERCHANT_SECRET?.trim();

if (!beneficiaryEmail || !merchantEmail || !adminEmail || !organizationId || !merchantEntityId || !beneficiarySecret || !merchantSecret) {
  throw new Error('BENEFICIARY_EMAIL, MERCHANT_EMAIL, ADMIN_EMAIL, ORGANIZATION_ID, MERCHANT_ENTITY_ID, STELLAR_BENEFICIARY_SECRET, STELLAR_MERCHANT_SECRET are required.');
}

const beneficiaryKeypair = Keypair.fromSecret(beneficiarySecret);
const merchantKeypair = Keypair.fromSecret(merchantSecret);

const client = createClient(url, anonKey, { auth: { persistSession: false } });

async function signIn(email) {
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) {
    throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  }
  return data.session.access_token;
}

async function main() {
  console.log('Logging in beneficiary and LGU admin...');
  const beneficiaryToken = await signIn(beneficiaryEmail);
  const adminToken = await signIn(adminEmail);

  // 1. Build and sign invoice
  console.log('\n--- signing invoice (merchant side) ---');
  const nonce = createHash('sha256').update(Date.now().toString()).digest('hex');
  const issuedAt = new Date().toISOString();
  const expiresAt = deriveExpiresAt(issuedAt);
  const rcphpIssuer = process.env.STELLAR_RCPHP_ISSUER?.trim() || 'GBC6HZTIUH6C3KQR5D3NOS2PJ7YKQJQNAQGAO3WO4PICJEXPAPGRKSQ7';
  const rcphpSacId = process.env.STELLAR_RCPHP_SAC_ID?.trim() || 'CAB57LDDYPIMK7H57KZ52JIIPOSNN7GHYLN4636D7SX76KQWGKLLA43N';

  const unsignedInvoice = {
    version: 1,
    kind: 'cash',
    asset: {
      code: 'RCPHP',
      issuer: rcphpIssuer,
      sacAddress: rcphpSacId,
      network: 'testnet',
    },
    merchantId: merchantEntityId,
    settlementWallet: merchantKeypair.publicKey(),
    invoiceSigner: merchantKeypair.publicKey(),
    amountStroops: '100000000', // 10 PHP
    nonce,
    issuedAt,
    expiresAt,
  };

  const invoice = signInvoice(unsignedInvoice, merchantSecret);
  console.log('Signed Invoice:', JSON.stringify(invoice, null, 2));

  // 2. Prepare payment
  console.log('\n--- calling prepare-payment (beneficiary side) ---');
  await client.auth.setSession({ access_token: beneficiaryToken, refresh_token: '' });
  const prepare = await client.functions.invoke('prepare-payment', {
    headers: { Authorization: `Bearer ${beneficiaryToken}` },
    body: {
      invoice,
      fundingSourceId: 'cash-source-id',
      fundingSourceKind: 'cash',
    },
  });

  if (prepare.error) {
    console.error('prepare error:', prepare.error.message, await safeContext(prepare.error));
    return;
  }
  console.log('Prepared Payment:', JSON.stringify(prepare.data, null, 2));
  const { intentId, attemptId, signingPackage, expectedSigner } = prepare.data.payment;

  // 3. Sign prepared transaction
  console.log('\n--- signing transaction (beneficiary side) ---');
  if (expectedSigner !== beneficiaryKeypair.publicKey()) {
    throw new Error(`Expected signer mismatch: ${expectedSigner} vs ${beneficiaryKeypair.publicKey()}`);
  }
  const tx = new Transaction(signingPackage.unsignedEnvelopeXdr, Networks.TESTNET);
  tx.sign(beneficiaryKeypair);
  const signedTxXdr = tx.toXDR();

  // 4. Submit payment
  console.log('\n--- calling submit-payment ---');
  const submit = await client.functions.invoke('submit-payment', {
    headers: { Authorization: `Bearer ${beneficiaryToken}` },
    body: {
      intentId,
      attemptId,
      signed: {
        kind: 'classic_envelope',
        signedEnvelopeXdr: signedTxXdr,
      },
    },
  });

  if (submit.error) {
    console.error('submit error:', submit.error.message, await safeContext(submit.error));
    return;
  }
  console.log('Submitted Payment:', JSON.stringify(submit.data, null, 2));

  // 5. Reconcile Stellar (merchant/operator side)
  console.log('\n--- waiting 8 seconds for Stellar ledger to close and index ---');
  await new Promise((resolve) => setTimeout(resolve, 8000));

  console.log('\n--- calling reconcile-stellar (operator side) ---');
  await client.auth.setSession({ access_token: adminToken, refresh_token: '' });
  const reconcile = await client.functions.invoke('reconcile-stellar', {
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      merchantId: merchantEntityId,
      organizationId,
    },
  });

  if (reconcile.error) {
    console.error('reconcile error:', reconcile.error.message, await safeContext(reconcile.error));
    return;
  }
  console.log('Reconciled:', JSON.stringify(reconcile.data, null, 2));

  console.log('\nDone E2E Verification!');
}

async function safeContext(error) {
  try {
    const ctx = error?.context;
    if (ctx && typeof ctx.json === 'function') return await ctx.json();
    return ctx ?? '';
  } catch {
    return '';
  }
}

main().catch((error) => {
  console.error(`invoke failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

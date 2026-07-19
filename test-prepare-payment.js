import { Keypair } from '@stellar/stellar-sdk';
import { createClient } from '@supabase/supabase-js';
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
        process.env[key] = val;
      }
    }
  }
} catch (e) {
  console.warn('Could not read env file:', e);
}

// Load bootstrap env
try {
  const envPath = path.resolve('.env.bootstrap.local');
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
        process.env[key] = val;
      }
    }
  }
} catch (e) {
  console.warn('Could not read bootstrap env file:', e);
}

const url = process.env.SUPABASE_URL?.trim() || 'http://127.0.0.1:54321';
const anonKey = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'; // From .env

const supabase = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const merchantSecret = process.env.STELLAR_MERCHANT_SECRET?.trim();
if (!merchantSecret) {
  throw new Error('STELLAR_MERCHANT_SECRET is missing');
}
const merchantKeypair = Keypair.fromSecret(merchantSecret);

const utf8 = new TextEncoder();
const ABSENT_FIELD = 0xffffffff;

class ByteWriter {
  constructor() {
    this.chunks = [];
  }
  writeField(value) {
    const bytes = utf8.encode(value);
    const header = new Uint8Array(4);
    new DataView(header.buffer).setUint32(0, bytes.length, false);
    this.chunks.push(header, bytes);
  }
  writeOptional(value) {
    if (value === undefined) {
      const header = new Uint8Array(4);
      new DataView(header.buffer).setUint32(0, ABSENT_FIELD, false);
      this.chunks.push(header);
      return;
    }
    this.writeField(value);
  }
  concat() {
    const total = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }
}

const canonicalInvoiceBytes = (invoice) => {
  const writer = new ByteWriter();
  writer.writeField('reliefchain:invoice:v1');
  writer.writeField(String(invoice.version));
  writer.writeField(invoice.kind);
  writer.writeField(invoice.asset.network);
  writer.writeField(invoice.asset.code);
  writer.writeField(invoice.asset.issuer);
  writer.writeField(invoice.asset.sacAddress);
  writer.writeOptional(undefined); // programId
  writer.writeOptional(undefined); // contractId
  writer.writeField(invoice.merchantId);
  writer.writeField(invoice.settlementWallet);
  writer.writeField(invoice.invoiceSigner);
  writer.writeField(invoice.amountStroops);
  writer.writeOptional(undefined); // category
  writer.writeField(invoice.nonce);
  writer.writeField(invoice.issuedAt);
  writer.writeField(invoice.expiresAt);
  writer.writeOptional(undefined); // receiptDigest
  return writer.concat();
};

async function main() {
  console.log("Signing in as beneficiary...");
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'beneficiary@example.com',
    password: 'ReliefChain!123',
  });

  if (authError || !authData.session) {
    throw new Error(`Auth failed: ${authError?.message}`);
  }

  const token = authData.session.access_token;
  console.log("Signed in successfully.");

  // Let's find the Merchant Demo Program and Funding Source IDs
  console.log("Fetching program and funding source...");
  const { data: program } = await supabase
    .from('programs')
    .select('id, funding_source_id')
    .ilike('name', 'Merchant Demo Program%')
    .single();

  if (!program) {
    throw new Error('Merchant Demo Program not found');
  }

  console.log("Program ID:", program.id);
  console.log("Funding Source ID:", program.funding_source_id);

  // Build unsigned invoice
  console.log("Building invoice...");
  const nowMs = Date.now();
  const issuedAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + 600000).toISOString();
  
  // Generate a fresh random nonce for each test
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
  
  const unsigned = {
    version: 1,
    kind: 'cash',
    asset: {
      code: 'RCPHP',
      issuer: process.env.STELLAR_RCPHP_ISSUER,
      sacAddress: process.env.STELLAR_RCPHP_SAC_ID,
      network: 'testnet',
    },
    merchantId: '22777e80-c30e-45ce-a0d9-50ae3e0bedd2', // Merchant Demo Store
    settlementWallet: merchantKeypair.publicKey(),
    invoiceSigner: merchantKeypair.publicKey(),
    amountStroops: '10000000', // 1.0 RCPHP
    nonce,
    issuedAt,
    expiresAt,
  };

  // Sign invoice
  console.log("Signing invoice...");
  const signature = merchantKeypair.sign(canonicalInvoiceBytes(unsigned));
  const merchantSignature = Buffer.from(signature).toString('base64');
  const signedInvoice = {
    ...unsigned,
    merchantSignature,
  };

  console.log("Calling prepare-payment...");
  const response = await fetch(`${url}/functions/v1/prepare-payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      invoice: signedInvoice,
      fundingSourceId: 'cash',
      fundingSourceKind: 'cash'
    })
  });

  console.log(`Response status: ${response.status}`);
  const json = await response.json();
  console.log("Response body:", JSON.stringify(json, null, 2));
}

main().catch(console.error);

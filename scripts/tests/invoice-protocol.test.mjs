// Protocol-level tests for the canonical signed-invoice wire format.
//
// Complements scripts/tests/invoice-codec.test.mjs (Task 8.1). Where that suite
// froze the happy-path canonical bytes / hashing / QR round-trips, this suite
// (Task 8.2) hardens the fuller `reliefchain:invoice:v1` protocol surface:
//
//   - deterministic round trips, including cross-module (shared vs Edge re-export)
//   - signature alteration / tampering across every signed field
//   - wrong network, wrong asset, and wrong (voucher) contract rejection
//   - the frozen ten-minute expiry boundary (structural and runtime)
//   - nonce shape (32 bytes as 64 lowercase hex; length / case / charset)
//   - QR-size fallback to a digest-bound reference and its integrity binding
//   - static wallet-address QR rejection
//   - beneficiary identity-QR rejection
//   - no-PII / no item-description serialization (QR payload AND canonical bytes)
//
// Validates: Requirements 10.3, 10.4, 10.5, 10.6, 10.8, 10.9, 23.4
//
// Loading convention mirrors invoice-codec.test.mjs / edge-protocol.test.mjs:
// TypeScript modules are transpiled in-memory and imported as data: URLs, while
// @stellar/stellar-sdk resolves to the real installed package so signatures are
// genuine Ed25519.

import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const rootDir = fileURLToPath(new URL('../../', import.meta.url));
const STELLAR_SDK_URL = pathToFileURL(require.resolve('@stellar/stellar-sdk')).href;

const cache = new Map();
const toDataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;

async function loadModule(absPath) {
  if (cache.has(absPath)) return cache.get(absPath);
  const source = await readFile(absPath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });

  const specifierRe = /\bfrom\s*(['"])([^'"]+)\1/g;
  const specifiers = new Set();
  let match;
  while ((match = specifierRe.exec(outputText)) !== null) specifiers.add(match[2]);

  const replacements = new Map();
  for (const specifier of specifiers) {
    if (specifier === '@stellar/stellar-sdk') {
      replacements.set(specifier, STELLAR_SDK_URL);
    } else if (specifier.startsWith('.')) {
      const resolved = specifier.endsWith('.ts')
        ? path.resolve(path.dirname(absPath), specifier)
        : path.resolve(path.dirname(absPath), `${specifier}.ts`);
      replacements.set(specifier, await loadModule(resolved));
    }
  }

  const rewritten = outputText.replace(specifierRe, (whole, quote, specifier) => {
    const replacement = replacements.get(specifier);
    return replacement ? `from ${quote}${replacement}${quote}` : whole;
  });

  const url = toDataUrl(rewritten);
  cache.set(absPath, url);
  return url;
}

const sdk = await import('@stellar/stellar-sdk');
const codec = await import(await loadModule(path.join(rootDir, 'shared/invoice-codec.ts')));
const edgeCodec = await import(
  await loadModule(path.join(rootDir, 'supabase/functions/_shared/stellar/invoice.ts'))
);

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

const QR_PREFIX = 'reliefchain:invoice:v1:';
const REF_PREFIX = 'reliefchain:invoice:v1:ref:';

const contractId = (byte) => sdk.StrKey.encodeContract(Buffer.alloc(32, byte));

const makeUnsigned = (overrides = {}) => {
  const merchant = overrides.merchant ?? sdk.Keypair.random();
  const issuer = overrides.issuer ?? sdk.Keypair.random();
  const settlement = overrides.settlement ?? sdk.Keypair.random();
  const issuedAt = overrides.issuedAt ?? '2025-03-01T12:00:00.000Z';
  const base = {
    version: 1,
    kind: overrides.kind ?? 'cash',
    asset: {
      code: 'RCPHP',
      issuer: issuer.publicKey(),
      sacAddress: contractId(7),
      network: 'testnet',
    },
    merchantId: 'merchant_test',
    settlementWallet: settlement.publicKey(),
    invoiceSigner: merchant.publicKey(),
    amountStroops: overrides.amountStroops ?? '4200000000',
    nonce: overrides.nonce ?? Buffer.alloc(32, 0x5a).toString('hex'),
    issuedAt,
    expiresAt: codec.deriveExpiresAt(issuedAt),
  };
  if ((overrides.kind ?? 'cash') === 'voucher') {
    return {
      ...base,
      programId: overrides.programId ?? 'program_test',
      contractId: overrides.contractId ?? contractId(9),
      category: overrides.category ?? 'medicine',
    };
  }
  return base;
};

const signedCash = (overrides = {}) => {
  const merchant = overrides.merchant ?? sdk.Keypair.random();
  return codec.signInvoice(makeUnsigned({ ...overrides, merchant, kind: 'cash' }), merchant.secret());
};

const signedVoucher = (overrides = {}) => {
  const merchant = overrides.merchant ?? sdk.Keypair.random();
  return codec.signInvoice(makeUnsigned({ ...overrides, merchant, kind: 'voucher' }), merchant.secret());
};

// Build a raw QR from an arbitrary (possibly mutated) invoice object, bypassing
// the codec's own serializer so structural / network / asset / contract / nonce
// validation on the DECODE path can be exercised in isolation.
const qrFromObject = (obj) => `${QR_PREFIX}${Buffer.from(JSON.stringify(obj)).toString('base64url')}`;
const refFromObject = (obj) => `${REF_PREFIX}${Buffer.from(JSON.stringify(obj)).toString('base64url')}`;

// ---------------------------------------------------------------------------
// Deterministic round trips (10.5) — including cross-module agreement.
// ---------------------------------------------------------------------------

test('decode -> encode is idempotent across repeated round trips', () => {
  const signed = signedVoucher();
  const qr0 = codec.encodeInvoiceQr(signed);
  let current = qr0;
  for (let i = 0; i < 3; i += 1) {
    const decoded = codec.decodeInvoiceQr(current);
    assert.equal(decoded.mode, 'inline');
    assert.deepEqual(decoded.invoice, signed);
    current = codec.encodeInvoiceQr(decoded.invoice);
    assert.equal(current, qr0);
  }
});

test('canonical bytes, invoice id, and QR are byte-identical across the shared and Edge modules', () => {
  const merchant = sdk.Keypair.random();
  const unsigned = makeUnsigned({ merchant, kind: 'voucher' });

  assert.equal(
    Buffer.from(edgeCodec.canonicalInvoiceBytes(unsigned)).toString('hex'),
    Buffer.from(codec.canonicalInvoiceBytes(unsigned)).toString('hex'),
  );
  assert.equal(edgeCodec.computeInvoiceId(unsigned), codec.computeInvoiceId(unsigned));

  // Deterministic Ed25519: signing the same bytes on either module is identical.
  const a = codec.signInvoice(unsigned, merchant.secret());
  const b = edgeCodec.signInvoice(unsigned, merchant.secret());
  assert.equal(a.merchantSignature, b.merchantSignature);
  assert.equal(codec.encodeInvoiceQr(a), edgeCodec.encodeInvoiceQr(b));

  // A QR produced on one module decodes and verifies on the other.
  const verified = edgeCodec.decodeAndVerifyInvoiceQr(codec.encodeInvoiceQr(a), {
    nowMs: Date.parse(a.issuedAt) + 1000,
  });
  assert.deepEqual(verified, a);
});

// ---------------------------------------------------------------------------
// Signature alteration / tampering (10.3, 10.6, 23.4).
// ---------------------------------------------------------------------------

test('tampering any signed voucher field invalidates the merchant signature', () => {
  const signed = signedVoucher();
  const mutations = {
    programId: 'program_other',
    contractId: contractId(0x11),
    category: 'fuel',
    merchantId: 'merchant_other',
    settlementWallet: sdk.Keypair.random().publicKey(),
    invoiceSigner: sdk.Keypair.random().publicKey(),
    amountStroops: '4200000001',
    nonce: Buffer.alloc(32, 0x5b).toString('hex'),
    issuedAt: '2025-03-01T12:00:01.000Z',
    expiresAt: '2025-03-01T12:10:01.000Z',
  };
  for (const [field, value] of Object.entries(mutations)) {
    const tampered = { ...signed, [field]: value };
    assert.equal(codec.verifyInvoiceSignature(tampered), false, `tampering ${field} should break the signature`);
    assert.throws(() => codec.assertVerifiedInvoice(tampered), { code: 'invalid_signature' });
  }
});

test('tampering the nested asset descriptor invalidates the signature', () => {
  const signed = signedCash();
  for (const assetPatch of [{ issuer: sdk.Keypair.random().publicKey() }, { sacAddress: contractId(0x22) }]) {
    const tampered = { ...signed, asset: { ...signed.asset, ...assetPatch } };
    assert.equal(codec.verifyInvoiceSignature(tampered), false);
  }
});

test('a malformed or wrong-length signature fails closed without throwing', () => {
  const signed = signedCash();
  assert.equal(codec.verifyInvoiceSignature({ ...signed, merchantSignature: 'not*valid*base64' }), false);
  assert.equal(codec.verifyInvoiceSignature({ ...signed, merchantSignature: Buffer.alloc(10, 1).toString('base64') }), false);
  assert.equal(codec.verifyInvoiceSignature({ ...signed, merchantSignature: '' }), false);
});

// ---------------------------------------------------------------------------
// Wrong network / wrong asset (10.6, 23.4).
// ---------------------------------------------------------------------------

test('the pilot network binding is case-sensitive and rejects non-testnet values', () => {
  const signed = signedCash();
  for (const network of ['public', 'pubnet', 'TESTNET', 'Testnet']) {
    const qr = qrFromObject({ ...signed, asset: { ...signed.asset, network } });
    assert.throws(() => codec.decodeInvoiceQr(qr), { code: 'wrong_network' }, `network "${network}" must be rejected`);
  }
  // An empty network is a structurally-invalid field before the network check.
  const emptyQr = qrFromObject({ ...signed, asset: { ...signed.asset, network: '' } });
  assert.throws(() => codec.decodeInvoiceQr(emptyQr), { code: 'invalid_field' });
});

test('the pilot asset binding is case-sensitive and rejects non-RCPHP codes', () => {
  const signed = signedCash();
  for (const code of ['XLM', 'rcphp', 'RCPH', 'USDC']) {
    const qr = qrFromObject({ ...signed, asset: { ...signed.asset, code } });
    assert.throws(() => codec.decodeInvoiceQr(qr), { code: 'wrong_asset' });
  }
});

// ---------------------------------------------------------------------------
// Wrong (voucher) contract (10.2, 10.6, 23.4).
// ---------------------------------------------------------------------------

test('a voucher invoice with a malformed contract id is rejected', () => {
  const signed = signedVoucher();
  for (const bad of ['not-a-contract', signed.settlementWallet, contractId(9).toLowerCase(), 'C123']) {
    const qr = qrFromObject({ ...signed, contractId: bad });
    assert.throws(() => codec.decodeInvoiceQr(qr), { code: 'invalid_field' });
  }
});

test('a voucher invoice missing its contract or program id is rejected', () => {
  const signed = signedVoucher();
  const noContract = { ...signed };
  delete noContract.contractId;
  assert.throws(() => codec.decodeInvoiceQr(qrFromObject(noContract)), { code: 'invalid_field' });
  const noProgram = { ...signed };
  delete noProgram.programId;
  assert.throws(() => codec.decodeInvoiceQr(qrFromObject(noProgram)), { code: 'invalid_field' });
});

test('a cash invoice carrying voucher contract fields is rejected', () => {
  const signed = signedCash();
  assert.throws(() => codec.decodeInvoiceQr(qrFromObject({ ...signed, contractId: contractId(9) })), {
    code: 'invalid_field',
  });
  assert.throws(() => codec.decodeInvoiceQr(qrFromObject({ ...signed, programId: 'program_x' })), {
    code: 'invalid_field',
  });
  assert.throws(() => codec.decodeInvoiceQr(qrFromObject({ ...signed, category: 'medicine' })), {
    code: 'invalid_field',
  });
});

test('substituting a different but valid contract id breaks the signature', () => {
  const signed = signedVoucher();
  const substituted = { ...signed, contractId: contractId(0xee) };
  // Structure is valid, so it decodes...
  const decoded = codec.decodeInvoiceQr(qrFromObject(substituted));
  assert.equal(decoded.mode, 'inline');
  // ...but the merchant signature no longer authenticates the swapped contract.
  assert.equal(codec.verifyInvoiceSignature(decoded.invoice), false);
});

// ---------------------------------------------------------------------------
// Expiry — the frozen ten-minute boundary (10.4).
// ---------------------------------------------------------------------------

test('expiry is evaluated at the exact ten-minute boundary (>=)', () => {
  const signed = signedCash();
  const expiryMs = Date.parse(signed.expiresAt);
  assert.equal(Date.parse(signed.expiresAt) - Date.parse(signed.issuedAt), codec.INVOICE_TTL_SECONDS * 1000);
  assert.equal(codec.isInvoiceExpired(signed, expiryMs - 1), false);
  assert.equal(codec.isInvoiceExpired(signed, expiryMs), true);
  assert.equal(codec.isInvoiceExpired(signed, expiryMs + 1), true);
  assert.doesNotThrow(() => codec.assertNotExpired(signed, expiryMs - 1));
  assert.throws(() => codec.assertNotExpired(signed, expiryMs), { code: 'expired' });
});

test('an expiry window that is off by even one millisecond is structurally rejected', () => {
  const signed = signedCash();
  const issuedMs = Date.parse(signed.issuedAt);
  for (const deltaMs of [codec.INVOICE_TTL_SECONDS * 1000 - 1, codec.INVOICE_TTL_SECONDS * 1000 + 1, 0]) {
    const qr = qrFromObject({ ...signed, expiresAt: new Date(issuedMs + deltaMs).toISOString() });
    assert.throws(() => codec.decodeInvoiceQr(qr), { code: 'invalid_field' });
  }
});

// ---------------------------------------------------------------------------
// Nonce shape — 32 bytes as 64 lowercase hex (10.1, 10.6).
// ---------------------------------------------------------------------------

test('the nonce must be exactly 64 lowercase hex characters', () => {
  const signed = signedCash();
  const bad = [
    Buffer.alloc(32, 0x5a).toString('hex').toUpperCase(), // uppercase hex
    Buffer.alloc(31, 0x5a).toString('hex'), // 62 chars — too short
    Buffer.alloc(33, 0x5a).toString('hex'), // 66 chars — too long
    `${'z'.repeat(64)}`, // non-hex charset
    '', // empty
  ];
  for (const nonce of bad) {
    const qr = qrFromObject({ ...signed, nonce });
    assert.throws(() => codec.decodeInvoiceQr(qr), { code: 'invalid_field' }, `nonce "${nonce.slice(0, 8)}..." should be rejected`);
  }
  // A canonical 64-lowercase-hex nonce is accepted and round-trips.
  const merchant = sdk.Keypair.random();
  const ok = codec.signInvoice(makeUnsigned({ merchant, nonce: Buffer.alloc(32, 0x0f).toString('hex') }), merchant.secret());
  assert.match(ok.nonce, /^[0-9a-f]{64}$/);
  assert.equal(codec.decodeInvoiceQr(codec.encodeInvoiceQr(ok)).mode, 'inline');
});

// ---------------------------------------------------------------------------
// QR-size fallback to a digest-bound reference (10.5).
// ---------------------------------------------------------------------------

test('an oversized invoice yields a reference whose digest is bound to the invoice id', () => {
  const merchant = sdk.Keypair.random();
  const unsigned = { ...makeUnsigned({ merchant }), merchantId: `merchant_${'y'.repeat(codec.MAX_INLINE_QR_CHARS)}` };
  const signed = codec.signInvoice(unsigned, merchant.secret());
  const transport = codec.encodeInvoiceForTransport(signed);
  assert.equal(transport.mode, 'reference');
  assert.ok(transport.qr.startsWith(REF_PREFIX));
  assert.equal(transport.reference.digest, codec.computeInvoiceId(signed));
  assert.equal(transport.reference.invoiceId, transport.reference.digest);
  // The reference alone cannot be verified offline.
  assert.throws(() => codec.decodeAndVerifyInvoiceQr(transport.qr), { code: 'qr_too_large' });
});

test('a reference whose digest does not equal the invoice id is rejected', () => {
  const digest = Buffer.alloc(32, 0xab).toString('hex');
  const other = Buffer.alloc(32, 0xcd).toString('hex');
  const expiresAt = codec.deriveExpiresAt('2025-03-01T12:00:00.000Z');
  // Well-formed, matching reference decodes.
  const ok = codec.decodeInvoiceQr(refFromObject({ invoiceId: digest, digest, expiresAt }));
  assert.equal(ok.mode, 'reference');
  assert.equal(ok.reference.digest, digest);
  // Mismatched digest is rejected.
  assert.throws(() => codec.decodeInvoiceQr(refFromObject({ invoiceId: digest, digest: other, expiresAt })), {
    code: 'invalid_field',
  });
  // A non-hex invoice id is rejected.
  assert.throws(() => codec.decodeInvoiceQr(refFromObject({ invoiceId: 'nope', digest: 'nope', expiresAt })), {
    code: 'invalid_field',
  });
});

// ---------------------------------------------------------------------------
// Static wallet-address QR rejection (10.8).
// ---------------------------------------------------------------------------

test('static wallet-address and SEP-0007 payment QRs are not payable invoices', () => {
  const dest = sdk.Keypair.random().publicKey();
  const payloads = [
    dest, // bare G-address
    `web+stellar:pay?destination=${dest}&amount=100&asset_code=RCPHP`, // SEP-7 pay request
    `stellar:${dest}`,
    contractId(3), // bare contract id
  ];
  for (const payload of payloads) {
    assert.throws(() => codec.decodeInvoiceQr(payload), { code: 'malformed_payload' }, `should reject: ${payload.slice(0, 24)}`);
  }
});

// ---------------------------------------------------------------------------
// Beneficiary identity-QR rejection (10.9).
// ---------------------------------------------------------------------------

test('a beneficiary identity QR is never treated as a bearer invoice', () => {
  const identityScheme = `reliefchain:identity:v1:${Buffer.from(JSON.stringify({ beneficiaryId: 'ben_123', wallet: sdk.Keypair.random().publicKey() })).toString('base64url')}`;
  const identityJson = Buffer.from(JSON.stringify({ type: 'identity', beneficiaryId: 'ben_123' })).toString('base64url');
  for (const payload of [identityScheme, identityJson, 'reliefchain:identity:v2:abc', 'urn:reliefchain:beneficiary:ben_123']) {
    assert.throws(() => codec.decodeInvoiceQr(payload), { code: 'malformed_payload' });
  }
});

// ---------------------------------------------------------------------------
// No-PII / no item-description serialization (10.1, 19.1).
// ---------------------------------------------------------------------------

const FORBIDDEN_FIELDS = [
  'description', 'items', 'lineItems', 'lineitems', 'notes', 'memo',
  'name', 'firstName', 'lastName', 'fullName', 'phone', 'email', 'address',
  'beneficiaryId', 'beneficiary', 'nationalId', 'birthDate', 'gender',
];

test('the serialized voucher QR payload exposes only the frozen protocol fields', () => {
  const merchant = sdk.Keypair.random();
  const signed = codec.signInvoice(
    { ...makeUnsigned({ merchant, kind: 'voucher' }), receiptDigest: Buffer.alloc(32, 0x02).toString('hex') },
    merchant.secret(),
  );
  const json = JSON.parse(Buffer.from(codec.encodeInvoiceQr(signed).slice(QR_PREFIX.length), 'base64url').toString('utf8'));
  const allowed = new Set([
    'version', 'kind', 'asset', 'merchantId', 'settlementWallet', 'invoiceSigner',
    'amountStroops', 'nonce', 'issuedAt', 'expiresAt', 'programId', 'contractId',
    'category', 'receiptDigest', 'merchantSignature',
  ]);
  for (const key of Object.keys(json)) {
    assert.ok(allowed.has(key), `unexpected field in invoice payload: ${key}`);
  }
  for (const forbidden of FORBIDDEN_FIELDS) {
    assert.equal(Object.hasOwn(json, forbidden), false, `payload must not carry ${forbidden}`);
  }
  // asset is the only nested object and is likewise constrained.
  assert.deepEqual(Object.keys(json.asset).sort(), ['code', 'issuer', 'network', 'sacAddress']);
});

test('the canonical signed bytes contain no PII or free-text description field markers', () => {
  const merchant = sdk.Keypair.random();
  const unsigned = makeUnsigned({ merchant, kind: 'voucher' });
  const bytesText = Buffer.from(codec.canonicalInvoiceBytes(unsigned)).toString('utf8');
  for (const forbidden of FORBIDDEN_FIELDS) {
    assert.equal(bytesText.includes(forbidden), false, `canonical bytes must not embed ${forbidden}`);
  }
  // The only human-meaningful string is the merchant-attested category enum value.
  assert.ok(bytesText.includes('medicine'));
});

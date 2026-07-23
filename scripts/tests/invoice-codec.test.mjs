// Unit tests for the canonical signed-invoice codec.
//
// Covers the wire protocol frozen in:
//   shared/invoice-codec.ts  (re-exported by supabase/functions/_shared/stellar/invoice.ts)
//
// Focus for Task 8.1: deterministic canonical bytes + hashing, Ed25519 sign /
// verify round-trips, base64url QR round-trips, the frozen ten-minute expiry,
// and the digest-bound reference fallback. It also asserts the language-neutral
// fixtures in shared/fixtures/invoice-v1.fixtures.json still match the codec
// (they are the same vectors the Rust contract tests consume) and that the
// serialized QR carries no PII or item descriptions.
//
// Loading convention mirrors edge-protocol.test.mjs: TypeScript modules are
// transpiled in-memory and imported as data: URLs, and @stellar/stellar-sdk
// resolves to the real installed package so signatures are genuine Ed25519.

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
const fixtures = JSON.parse(
  await readFile(path.join(rootDir, 'shared/fixtures/invoice-v1.fixtures.json'), 'utf8'),
);

// ---------------------------------------------------------------------------
// Helpers to build fresh, valid invoices with real keys.
// ---------------------------------------------------------------------------

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
    return { ...base, programId: 'program_test', contractId: contractId(9), category: 'medicine' };
  }
  return base;
};

// ---------------------------------------------------------------------------
// Canonical bytes + hashing determinism.
// ---------------------------------------------------------------------------

test('canonical bytes and invoice id are deterministic and order-independent', () => {
  const merchant = sdk.Keypair.random();
  const unsigned = makeUnsigned({ merchant });
  const reordered = {
    expiresAt: unsigned.expiresAt,
    invoiceSigner: unsigned.invoiceSigner,
    kind: unsigned.kind,
    asset: unsigned.asset,
    version: unsigned.version,
    nonce: unsigned.nonce,
    amountStroops: unsigned.amountStroops,
    issuedAt: unsigned.issuedAt,
    merchantId: unsigned.merchantId,
    settlementWallet: unsigned.settlementWallet,
  };
  assert.equal(
    Buffer.from(codec.canonicalInvoiceBytes(reordered)).toString('hex'),
    Buffer.from(codec.canonicalInvoiceBytes(unsigned)).toString('hex'),
  );
  assert.equal(codec.computeInvoiceId(reordered), codec.computeInvoiceId(unsigned));
  assert.match(codec.computeInvoiceId(unsigned), /^[0-9a-f]{64}$/);
});

test('cash and voucher invoices produce distinct canonical bytes', () => {
  const merchant = sdk.Keypair.random();
  const issuer = sdk.Keypair.random();
  const settlement = sdk.Keypair.random();
  const shared = { merchant, issuer, settlement, nonce: Buffer.alloc(32, 1).toString('hex') };
  const cash = codec.computeInvoiceId(makeUnsigned({ ...shared, kind: 'cash' }));
  const voucher = codec.computeInvoiceId(makeUnsigned({ ...shared, kind: 'voucher' }));
  assert.notEqual(cash, voucher);
});

// ---------------------------------------------------------------------------
// Sign / verify round-trips.
// ---------------------------------------------------------------------------

test('a merchant-signed invoice verifies against its own signer key', () => {
  const merchant = sdk.Keypair.random();
  const signed = codec.signInvoice(makeUnsigned({ merchant }), merchant.secret());
  assert.equal(codec.verifyInvoiceSignature(signed), true);
  assert.doesNotThrow(() => codec.assertVerifiedInvoice(signed));
});

test('signing rejects a signer that does not match the secret key', () => {
  const merchant = sdk.Keypair.random();
  const other = sdk.Keypair.random();
  const unsigned = makeUnsigned({ merchant });
  assert.throws(() => codec.signInvoice(unsigned, other.secret()), /invoiceSigner does not match/);
});

test('any tampered field invalidates the signature', () => {
  const merchant = sdk.Keypair.random();
  const signed = codec.signInvoice(makeUnsigned({ merchant }), merchant.secret());
  const tamperedAmount = { ...signed, amountStroops: '4200000001' };
  assert.equal(codec.verifyInvoiceSignature(tamperedAmount), false);
  const tamperedWallet = { ...signed, settlementWallet: sdk.Keypair.random().publicKey() };
  assert.equal(codec.verifyInvoiceSignature(tamperedWallet), false);
  assert.throws(() => codec.assertVerifiedInvoice(tamperedAmount), { code: 'invalid_signature' });
});

test('a signature from a different key does not verify', () => {
  const merchant = sdk.Keypair.random();
  const impostor = sdk.Keypair.random();
  const unsigned = makeUnsigned({ merchant });
  const forged = { ...unsigned, merchantSignature: Buffer.from(impostor.sign(Buffer.from(codec.canonicalInvoiceBytes(unsigned)))).toString('base64') };
  assert.equal(codec.verifyInvoiceSignature(forged), false);
});

// ---------------------------------------------------------------------------
// QR encode / decode round-trips.
// ---------------------------------------------------------------------------

test('inline QR round-trips a cash invoice byte-for-byte', () => {
  const merchant = sdk.Keypair.random();
  const signed = codec.signInvoice(makeUnsigned({ merchant, kind: 'cash' }), merchant.secret());
  const qr = codec.encodeInvoiceQr(signed);
  assert.ok(qr.startsWith('reliefchain:invoice:v1:'));
  const decoded = codec.decodeInvoiceQr(qr);
  assert.equal(decoded.mode, 'inline');
  assert.deepEqual(decoded.invoice, signed);
  assert.equal(codec.encodeInvoiceQr(decoded.invoice), qr);
});

test('inline QR round-trips a voucher invoice with all conditional fields', () => {
  const merchant = sdk.Keypair.random();
  const unsigned = { ...makeUnsigned({ merchant, kind: 'voucher' }), receiptDigest: Buffer.alloc(32, 0xd4).toString('hex') };
  const signed = codec.signInvoice(unsigned, merchant.secret());
  const decoded = codec.decodeInvoiceQr(codec.encodeInvoiceQr(signed));
  assert.equal(decoded.mode, 'inline');
  assert.deepEqual(decoded.invoice, signed);
  assert.equal(decoded.invoice.programId, unsigned.programId);
  assert.equal(decoded.invoice.category, 'medicine');
});

test('decodeAndVerifyInvoiceQr accepts a fresh valid invoice and returns the typed invoice', () => {
  const merchant = sdk.Keypair.random();
  const signed = codec.signInvoice(makeUnsigned({ merchant }), merchant.secret());
  const nowMs = Date.parse(signed.issuedAt) + 1000;
  const verified = codec.decodeAndVerifyInvoiceQr(codec.encodeInvoiceQr(signed), { nowMs });
  assert.deepEqual(verified, signed);
});

// ---------------------------------------------------------------------------
// Rejection of non-invoice and malformed payloads.
// ---------------------------------------------------------------------------

test('a static wallet-address QR is rejected as a payable invoice', () => {
  assert.throws(() => codec.decodeInvoiceQr(sdk.Keypair.random().publicKey()), { code: 'malformed_payload' });
});

test('an identity / arbitrary QR is never treated as an invoice', () => {
  assert.throws(() => codec.decodeInvoiceQr('reliefchain:identity:v1:GABC'), { code: 'malformed_payload' });
  assert.throws(() => codec.decodeInvoiceQr('https://example.org/whatever'), { code: 'malformed_payload' });
});

test('a wrong-network invoice is rejected on decode', () => {
  const merchant = sdk.Keypair.random();
  const signed = codec.signInvoice(makeUnsigned({ merchant }), merchant.secret());
  const mutated = { ...signed, asset: { ...signed.asset, network: 'mainnet' } };
  const qr = `reliefchain:invoice:v1:${Buffer.from(JSON.stringify(mutated)).toString('base64url')}`;
  assert.throws(() => codec.decodeInvoiceQr(qr), { code: 'wrong_network' });
});

test('a wrong-asset invoice is rejected on decode', () => {
  const merchant = sdk.Keypair.random();
  const signed = codec.signInvoice(makeUnsigned({ merchant }), merchant.secret());
  const mutated = { ...signed, asset: { ...signed.asset, code: 'XLM' } };
  const qr = `reliefchain:invoice:v1:${Buffer.from(JSON.stringify(mutated)).toString('base64url')}`;
  assert.throws(() => codec.decodeInvoiceQr(qr), { code: 'wrong_asset' });
});

test('a non-32-byte nonce is rejected', () => {
  const merchant = sdk.Keypair.random();
  const signed = codec.signInvoice(makeUnsigned({ merchant }), merchant.secret());
  const mutated = { ...signed, nonce: 'abcd' };
  const qr = `reliefchain:invoice:v1:${Buffer.from(JSON.stringify(mutated)).toString('base64url')}`;
  assert.throws(() => codec.decodeInvoiceQr(qr), { code: 'invalid_field' });
});

test('an invoice whose expiry is not exactly ten minutes is rejected', () => {
  const merchant = sdk.Keypair.random();
  const signed = codec.signInvoice(makeUnsigned({ merchant }), merchant.secret());
  const mutated = { ...signed, expiresAt: new Date(Date.parse(signed.issuedAt) + 5 * 60 * 1000).toISOString() };
  const qr = `reliefchain:invoice:v1:${Buffer.from(JSON.stringify(mutated)).toString('base64url')}`;
  assert.throws(() => codec.decodeInvoiceQr(qr), { code: 'invalid_field' });
});

// ---------------------------------------------------------------------------
// Expiry (frozen ten-minute window).
// ---------------------------------------------------------------------------

test('deriveExpiresAt is exactly ten minutes after issuance', () => {
  const issuedAt = '2025-06-01T00:00:00.000Z';
  assert.equal(codec.deriveExpiresAt(issuedAt), '2025-06-01T00:10:00.000Z');
  assert.equal(codec.INVOICE_TTL_SECONDS, 600);
});

test('an expired invoice is rejected by verification but its bytes still decode', () => {
  const merchant = sdk.Keypair.random();
  const signed = codec.signInvoice(makeUnsigned({ merchant }), merchant.secret());
  const afterExpiry = Date.parse(signed.expiresAt) + 1;
  assert.equal(codec.isInvoiceExpired(signed, afterExpiry), true);
  assert.throws(() => codec.decodeAndVerifyInvoiceQr(codec.encodeInvoiceQr(signed), { nowMs: afterExpiry }), { code: 'expired' });
  // At the exact expiry instant it is already expired (>=).
  assert.equal(codec.isInvoiceExpired(signed, Date.parse(signed.expiresAt)), true);
  assert.equal(codec.isInvoiceExpired(signed, Date.parse(signed.expiresAt) - 1), false);
});

// ---------------------------------------------------------------------------
// Digest-bound reference fallback for oversized invoices.
// ---------------------------------------------------------------------------

test('a small invoice uses the inline transport', () => {
  const merchant = sdk.Keypair.random();
  const signed = codec.signInvoice(makeUnsigned({ merchant }), merchant.secret());
  const transport = codec.encodeInvoiceForTransport(signed);
  assert.equal(transport.mode, 'inline');
  assert.equal(transport.invoiceId, codec.computeInvoiceId(signed));
});

test('an oversized invoice falls back to a digest-bound reference that round-trips', () => {
  const merchant = sdk.Keypair.random();
  // A very long merchantId forces the encoded QR past the scannable cap.
  const unsigned = { ...makeUnsigned({ merchant }), merchantId: `merchant_${'x'.repeat(codec.MAX_INLINE_QR_CHARS)}` };
  const signed = codec.signInvoice(unsigned, merchant.secret());
  const transport = codec.encodeInvoiceForTransport(signed);
  assert.equal(transport.mode, 'reference');
  assert.equal(transport.reference.digest, transport.reference.invoiceId);
  assert.equal(transport.reference.invoiceId, codec.computeInvoiceId(signed));
  assert.ok(transport.qr.startsWith('reliefchain:invoice:v1:ref:'));

  const decoded = codec.decodeInvoiceQr(transport.qr);
  assert.equal(decoded.mode, 'reference');
  assert.deepEqual(decoded.reference, transport.reference);
  // A reference cannot be verified offline.
  assert.throws(() => codec.decodeAndVerifyInvoiceQr(transport.qr), { code: 'qr_too_large' });
});

// ---------------------------------------------------------------------------
// Privacy: the QR payload carries no PII or item descriptions.
// ---------------------------------------------------------------------------

test('the serialized QR payload exposes only the frozen non-PII fields', () => {
  const merchant = sdk.Keypair.random();
  const signed = codec.signInvoice({ ...makeUnsigned({ merchant, kind: 'voucher' }), receiptDigest: Buffer.alloc(32, 2).toString('hex') }, merchant.secret());
  const qr = codec.encodeInvoiceQr(signed);
  const json = JSON.parse(Buffer.from(qr.slice('reliefchain:invoice:v1:'.length), 'base64url').toString('utf8'));
  const allowed = new Set([
    'version', 'kind', 'asset', 'merchantId', 'settlementWallet', 'invoiceSigner',
    'amountStroops', 'nonce', 'issuedAt', 'expiresAt', 'programId', 'contractId',
    'category', 'receiptDigest', 'merchantSignature',
  ]);
  for (const key of Object.keys(json)) {
    assert.ok(allowed.has(key), `unexpected field in invoice payload: ${key}`);
  }
  // No free-text description / item fields are present.
  for (const forbidden of ['description', 'items', 'lineItems', 'notes', 'name', 'phone', 'address']) {
    assert.equal(Object.hasOwn(json, forbidden), false);
  }
});

// ---------------------------------------------------------------------------
// Shared fixtures agree with the codec (same vectors the Rust tests consume).
// ---------------------------------------------------------------------------

const fixtureVectors = [
  ['cash', fixtures.cashInvoice],
  ['voucher', fixtures.voucherInvoice],
];

for (const [name, vector] of fixtureVectors) {
  test(`shared ${name} fixture matches the codec canonical bytes, id, signature, and QR`, () => {
    const { merchantSignature, ...unsigned } = vector.invoice;
    assert.equal(
      Buffer.from(codec.canonicalInvoiceBytes(unsigned)).toString('hex'),
      vector.canonicalUnsignedBytesHex,
    );
    assert.equal(codec.computeInvoiceId(unsigned), vector.invoiceId);
    assert.equal(codec.verifyInvoiceSignature(vector.invoice), true);
    assert.equal(codec.encodeInvoiceQr(vector.invoice), vector.qr);
    // The signer secret in the fixture reproduces the exact deterministic signature.
    const resigned = codec.signInvoice(unsigned, fixtures.keys.merchantSecret);
    assert.equal(resigned.merchantSignature, merchantSignature);
    // Decoding the fixture QR yields the exact typed invoice.
    const decoded = codec.decodeInvoiceQr(vector.qr);
    assert.equal(decoded.mode, 'inline');
    assert.deepEqual(decoded.invoice, vector.invoice);
  });
}

test('the Edge re-export exposes the same codec surface as the shared module', () => {
  for (const name of ['encodeInvoiceQr', 'decodeInvoiceQr', 'signInvoice', 'verifyInvoiceSignature', 'computeInvoiceId', 'INVOICE_TTL_SECONDS']) {
    assert.ok(name in edgeCodec, `edge invoice module missing ${name}`);
  }
  assert.equal(edgeCodec.INVOICE_TTL_SECONDS, codec.INVOICE_TTL_SECONDS);
});

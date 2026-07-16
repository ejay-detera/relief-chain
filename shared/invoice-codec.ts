// Canonical signed-invoice codec — shared by mobile (src/), Edge Functions
// (supabase/functions/_shared/stellar/invoice.ts), and the Rust contract tests
// (via the language-neutral fixtures in shared/fixtures/invoice-v1.fixtures.json).
//
// This module freezes the `reliefchain:invoice:v1` wire protocol described in
// the design's "Invoice Protocol":
//
//   - a DETERMINISTIC, canonical byte encoding of the UNSIGNED invoice that any
//     language can reproduce (fixed field order, length-prefixed, absence
//     distinguished from an empty string);
//   - `invoice_id` = SHA-256 of those canonical unsigned bytes;
//   - merchant Ed25519 signature over the same canonical unsigned bytes,
//     verifiable against the merchant `invoiceSigner` public key;
//   - a base64url QR payload `reliefchain:invoice:v1:<base64url(canonical json)>`
//     that excludes PII and item descriptions;
//   - a strict ten-minute expiry;
//   - a digest-bound reference fallback for invoices that exceed a reliably
//     scannable QR size, requiring connectivity to resolve.
//
// The module is intentionally self-contained at runtime: its only value import
// is `@stellar/stellar-sdk` (already resolved on both mobile and Edge). Domain
// types are imported type-only from `src/types/*`, so they are erased before
// module resolution and the same file loads unmodified under Metro, Deno, and
// the transpile-inject unit-test harness.
//
// Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 19.1

import { hash, Keypair } from '@stellar/stellar-sdk';

import type {
    AssetDescriptor,
    PilotAssetCode,
    StellarNetwork,
    StroopAmount,
} from '../src/types/blockchain';
import type { InvoiceKind, InvoiceV1 } from '../src/types/invoice';

// ---------------------------------------------------------------------------
// Protocol constants (frozen wire format).
// ---------------------------------------------------------------------------

/** Versioned QR scheme. Inline payloads are `${INVOICE_QR_PREFIX}<base64url>`. */
export const INVOICE_QR_SCHEME = 'reliefchain:invoice:v1' as const;
export const INVOICE_QR_PREFIX = `${INVOICE_QR_SCHEME}:` as const;
/** Reference-fallback wire prefix (a strict superstring of the inline prefix). */
export const INVOICE_REFERENCE_PREFIX = `${INVOICE_QR_SCHEME}:ref:` as const;

/** Invoices expire exactly ten minutes after creation (Requirement 10.4). */
export const INVOICE_TTL_SECONDS = 600 as const;

/**
 * Maximum inline QR string length that scans reliably on a typical device
 * camera. A larger invoice must use the digest-bound reference fallback and
 * therefore requires connectivity to resolve (Requirement 10.5).
 */
export const MAX_INLINE_QR_CHARS = 1200 as const;

const CURRENT_ASSET_CODE: PilotAssetCode = 'RCPHP';
const CURRENT_NETWORK: StellarNetwork = 'testnet';

const STELLAR_ACCOUNT_PATTERN = /^G[A-Z2-7]{55}$/;
const STELLAR_CONTRACT_PATTERN = /^C[A-Z2-7]{55}$/;
const HEX_32_BYTES = /^[0-9a-f]{64}$/;
const CANONICAL_STROOPS = /^(0|[1-9]\d*)$/;
const MAX_I128_STROOPS = (1n << 127n) - 1n;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

// ---------------------------------------------------------------------------
// Errors.
// ---------------------------------------------------------------------------

export type InvoiceCodecErrorCode =
  | 'malformed_payload'
  | 'unsupported_version'
  | 'wrong_network'
  | 'wrong_asset'
  | 'invalid_field'
  | 'invalid_signature'
  | 'expired'
  | 'qr_too_large';

/** A fail-closed codec error. Carries a stable machine code for callers. */
export class InvoiceCodecError extends Error {
  readonly code: InvoiceCodecErrorCode;

  constructor(code: InvoiceCodecErrorCode, message: string) {
    super(message);
    this.name = 'InvoiceCodecError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Low-level byte helpers (portable across Metro, Deno, and Node).
// ---------------------------------------------------------------------------

// The module deliberately avoids the Node `Buffer` global (unavailable under the
// project's browser/React Native type config); it uses `TextEncoder`/
// `TextDecoder` and pure-JS base64/hex so the exact same file loads under Metro,
// Deno, and the unit-test harness. The SDK's `hash`/`sign`/`verify` accept and
// return byte arrays at runtime; only `Uint8Array` values cross that boundary.
const utf8 = new TextEncoder();
const utf8Decoder = new TextDecoder();

/** Sentinel length marking an ABSENT optional field (distinct from empty). */
const ABSENT_FIELD = 0xffffffff;

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_INDEX: Record<string, number> = {};
for (let i = 0; i < BASE64_CHARS.length; i += 1) {
  BASE64_INDEX[BASE64_CHARS.charAt(i)] = i;
}

const bytesToBase64 = (bytes: Uint8Array): string => {
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const hasB1 = i + 1 < bytes.length;
    const hasB2 = i + 2 < bytes.length;
    const b1 = hasB1 ? bytes[i + 1] : 0;
    const b2 = hasB2 ? bytes[i + 2] : 0;
    result += BASE64_CHARS.charAt(b0 >> 2);
    result += BASE64_CHARS.charAt(((b0 & 0x03) << 4) | (b1 >> 4));
    result += hasB1 ? BASE64_CHARS.charAt(((b1 & 0x0f) << 2) | (b2 >> 6)) : '=';
    result += hasB2 ? BASE64_CHARS.charAt(b2 & 0x3f) : '=';
  }
  return result;
};

const base64ToBytes = (value: string): Uint8Array => {
  const clean = value.replace(/=+$/g, '');
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = BASE64_INDEX[clean.charAt(i)];
    const c1 = BASE64_INDEX[clean.charAt(i + 1)];
    if (c0 === undefined || c1 === undefined) {
      throw new InvoiceCodecError('malformed_payload', 'Payload is not valid base64.');
    }
    out.push((c0 << 2) | (c1 >> 4));
    const c2 = i + 2 < clean.length ? BASE64_INDEX[clean.charAt(i + 2)] : undefined;
    if (c2 !== undefined) {
      out.push(((c1 & 0x0f) << 4) | (c2 >> 2));
      const c3 = i + 3 < clean.length ? BASE64_INDEX[clean.charAt(i + 3)] : undefined;
      if (c3 !== undefined) {
        out.push(((c2 & 0x03) << 6) | c3);
      }
    }
  }
  return new Uint8Array(out);
};

const encodeBase64Url = (bytes: Uint8Array): string =>
  bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

const decodeBase64Url = (value: string): Uint8Array => {
  if (!/^[A-Za-z0-9\-_]*$/.test(value)) {
    throw new InvoiceCodecError('malformed_payload', 'Payload is not valid base64url.');
  }
  return base64ToBytes(value.replace(/-/g, '+').replace(/_/g, '/'));
};

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
const fromBase64 = (value: string): Uint8Array => base64ToBytes(value);
const toBase64 = (bytes: Uint8Array): string => bytesToBase64(bytes);

// ---------------------------------------------------------------------------
// Canonical unsigned byte encoding (the signed/hashed message).
// ---------------------------------------------------------------------------

// A length-prefixed writer: every field is `u32 big-endian length || utf8 bytes`
// and an absent optional field is the ABSENT sentinel length with no bytes. The
// fixed domain prefix binds the encoding to this exact protocol version. This
// layout is deliberately trivial to reimplement byte-for-byte in Rust.
class ByteWriter {
  private chunks: Uint8Array[] = [];

  writeField(value: string): void {
    const bytes = utf8.encode(value);
    const header = new Uint8Array(4);
    new DataView(header.buffer).setUint32(0, bytes.length, false);
    this.chunks.push(header, bytes);
  }

  writeOptional(value: string | undefined): void {
    if (value === undefined) {
      const header = new Uint8Array(4);
      new DataView(header.buffer).setUint32(0, ABSENT_FIELD, false);
      this.chunks.push(header);
      return;
    }
    this.writeField(value);
  }

  concat(): Uint8Array {
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

/** The unsigned view of an invoice: everything the merchant signs over. */
export type UnsignedInvoiceV1 = Omit<InvoiceV1, 'merchantSignature'>;

/**
 * Produces the canonical, deterministic byte encoding of the UNSIGNED invoice.
 * This is the exact message that is hashed for `invoice_id` and signed by the
 * merchant. Field order and absence encoding are frozen; reproduce it exactly
 * in any other language to interoperate.
 */
export const canonicalInvoiceBytes = (invoice: UnsignedInvoiceV1): Uint8Array => {
  const writer = new ByteWriter();
  writer.writeField(INVOICE_QR_SCHEME);
  writer.writeField(String(invoice.version));
  writer.writeField(invoice.kind);
  writer.writeField(invoice.asset.network);
  writer.writeField(invoice.asset.code);
  writer.writeField(invoice.asset.issuer);
  writer.writeField(invoice.asset.sacAddress);
  writer.writeOptional(invoice.kind === 'voucher' ? invoice.programId : undefined);
  writer.writeOptional(invoice.kind === 'voucher' ? invoice.contractId : undefined);
  writer.writeField(invoice.merchantId);
  writer.writeField(invoice.settlementWallet);
  writer.writeField(invoice.invoiceSigner);
  writer.writeField(invoice.amountStroops);
  writer.writeOptional(invoice.kind === 'voucher' ? invoice.category : undefined);
  writer.writeField(invoice.nonce);
  writer.writeField(invoice.issuedAt);
  writer.writeField(invoice.expiresAt);
  writer.writeOptional(invoice.receiptDigest);
  return writer.concat();
};

/** The SHA-256 digest (lowercase hex) of the canonical unsigned bytes. */
export const computeInvoiceId = (invoice: UnsignedInvoiceV1): string =>
  toHex(new Uint8Array(hash(canonicalInvoiceBytes(invoice))));

// ---------------------------------------------------------------------------
// Field validation (fail-closed).
// ---------------------------------------------------------------------------

const assertField = (condition: boolean, field: string, reason: string): void => {
  if (!condition) {
    throw new InvoiceCodecError('invalid_field', `Invalid invoice ${field}: ${reason}.`);
  }
};

const assertCanonicalStroops = (value: string): StroopAmount => {
  assertField(
    CANONICAL_STROOPS.test(value) && BigInt(value) <= MAX_I128_STROOPS,
    'amountStroops',
    'must be a canonical non-negative integer stroop value',
  );
  assertField(BigInt(value) > 0n, 'amountStroops', 'must be greater than zero');
  return value as StroopAmount;
};

const assertInstant = (value: string, field: string): void => {
  assertField(ISO_INSTANT.test(value) && !Number.isNaN(Date.parse(value)), field, 'must be an ISO-8601 UTC instant');
};

const assertNonce = (value: string): void => {
  assertField(HEX_32_BYTES.test(value), 'nonce', 'must be 32 bytes as 64 lowercase hex characters');
};

// ---------------------------------------------------------------------------
// Structural decoding & validation of a candidate invoice object.
// ---------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readString = (record: Record<string, unknown>, field: string): string => {
  const value = record[field];
  assertField(typeof value === 'string' && value.length > 0, field, 'must be a non-empty string');
  return value as string;
};

const readOptionalString = (
  record: Record<string, unknown>,
  field: string,
): string | undefined => {
  const value = record[field];
  if (value === undefined || value === null) {
    return undefined;
  }
  assertField(typeof value === 'string' && value.length > 0, field, 'must be a non-empty string when present');
  return value as string;
};

const assertAsset = (record: Record<string, unknown>): AssetDescriptor => {
  assertField(isRecord(record.asset), 'asset', 'must be an object');
  const asset = record.asset as Record<string, unknown>;
  const network = readString(asset, 'network');
  if (network !== CURRENT_NETWORK) {
    throw new InvoiceCodecError('wrong_network', `Invoice is bound to network "${network}", not "${CURRENT_NETWORK}".`);
  }
  const code = readString(asset, 'code');
  if (code !== CURRENT_ASSET_CODE) {
    throw new InvoiceCodecError('wrong_asset', `Invoice asset "${code}" is not the pilot asset "${CURRENT_ASSET_CODE}".`);
  }
  const issuer = readString(asset, 'issuer');
  assertField(STELLAR_ACCOUNT_PATTERN.test(issuer), 'asset.issuer', 'must be a Stellar public account ID');
  const sacAddress = readString(asset, 'sacAddress');
  assertField(STELLAR_CONTRACT_PATTERN.test(sacAddress), 'asset.sacAddress', 'must be a Stellar contract ID');
  return Object.freeze({
    code: CURRENT_ASSET_CODE,
    issuer,
    sacAddress,
    network: CURRENT_NETWORK,
  });
};

const assertCommonFields = (record: Record<string, unknown>, asset: AssetDescriptor) => {
  const merchantId = readString(record, 'merchantId');
  const settlementWallet = readString(record, 'settlementWallet');
  assertField(STELLAR_ACCOUNT_PATTERN.test(settlementWallet), 'settlementWallet', 'must be a Stellar public account ID');
  const invoiceSigner = readString(record, 'invoiceSigner');
  assertField(STELLAR_ACCOUNT_PATTERN.test(invoiceSigner), 'invoiceSigner', 'must be a Stellar public account ID');
  const amountStroops = assertCanonicalStroops(readString(record, 'amountStroops'));
  const nonce = readString(record, 'nonce');
  assertNonce(nonce);
  const issuedAt = readString(record, 'issuedAt');
  assertInstant(issuedAt, 'issuedAt');
  const expiresAt = readString(record, 'expiresAt');
  assertInstant(expiresAt, 'expiresAt');
  // Enforce the frozen ten-minute expiry (Requirement 10.4).
  assertField(
    Date.parse(expiresAt) - Date.parse(issuedAt) === INVOICE_TTL_SECONDS * 1000,
    'expiresAt',
    'must be exactly ten minutes after issuedAt',
  );
  const receiptDigest = readOptionalString(record, 'receiptDigest');
  if (receiptDigest !== undefined) {
    assertField(HEX_32_BYTES.test(receiptDigest), 'receiptDigest', 'must be a 32-byte lowercase hex digest');
  }
  const merchantSignature = readString(record, 'merchantSignature');
  // `receiptDigest` is attached only when present so an absent optional field is
  // never materialized as an explicit `undefined` property (keeps round-trips exact).
  return {
    common: {
      asset,
      merchantId,
      settlementWallet,
      invoiceSigner,
      amountStroops,
      nonce,
      issuedAt,
      expiresAt,
      merchantSignature,
    },
    receiptDigest,
  };
};

/**
 * Validates an arbitrary decoded object as a structurally-sound `InvoiceV1` and
 * returns a typed, frozen invoice. Throws {@link InvoiceCodecError} on any
 * malformed, wrong-network, wrong-asset, or invalid field. Does NOT verify the
 * signature or expiry — see {@link verifyInvoiceSignature} and
 * {@link assertNotExpired}.
 */
export const parseInvoiceObject = (candidate: unknown): InvoiceV1 => {
  if (!isRecord(candidate)) {
    throw new InvoiceCodecError('malformed_payload', 'Invoice payload must be an object.');
  }
  if (candidate.version !== 1) {
    throw new InvoiceCodecError('unsupported_version', 'Only reliefchain:invoice:v1 is supported.');
  }
  const kind = candidate.kind;
  if (kind !== 'cash' && kind !== 'voucher') {
    throw new InvoiceCodecError('invalid_field', 'Invoice kind must be "cash" or "voucher".');
  }
  const asset = assertAsset(candidate);
  const { common, receiptDigest } = assertCommonFields(candidate, asset);
  const optional = receiptDigest === undefined ? {} : { receiptDigest };

  if (kind === 'cash') {
    assertField(candidate.programId === undefined || candidate.programId === null, 'programId', 'must be absent for a cash invoice');
    assertField(candidate.contractId === undefined || candidate.contractId === null, 'contractId', 'must be absent for a cash invoice');
    assertField(candidate.category === undefined || candidate.category === null, 'category', 'must be absent for a cash invoice');
    return Object.freeze({ version: 1, kind: 'cash', ...common, ...optional });
  }

  const programId = readString(candidate, 'programId');
  const contractId = readString(candidate, 'contractId');
  assertField(STELLAR_CONTRACT_PATTERN.test(contractId), 'contractId', 'must be a Stellar contract ID');
  const category = readString(candidate, 'category');
  return Object.freeze({ version: 1, kind: 'voucher', programId, contractId, category, ...common, ...optional });
};

// ---------------------------------------------------------------------------
// Signing & verification (Ed25519 over the canonical unsigned bytes).
// ---------------------------------------------------------------------------

/**
 * Signs the canonical unsigned bytes with the merchant secret and returns the
 * complete signed invoice. The signer's public key becomes `invoiceSigner`, so
 * a verifier needs nothing beyond the invoice itself.
 */
export const signInvoice = (
  unsigned: UnsignedInvoiceV1,
  merchantSecret: string,
): InvoiceV1 => {
  const keypair = Keypair.fromSecret(merchantSecret);
  if (keypair.publicKey() !== unsigned.invoiceSigner) {
    throw new InvoiceCodecError('invalid_field', 'invoiceSigner does not match the signing secret key.');
  }
  const signature = new Uint8Array(keypair.sign(canonicalInvoiceBytes(unsigned)));
  const merchantSignature = toBase64(signature);
  return parseInvoiceObject({ ...unsigned, asset: { ...unsigned.asset }, merchantSignature });
};

/**
 * Verifies the merchant Ed25519 signature over the canonical unsigned bytes
 * against the invoice's own `invoiceSigner` public key. Returns a boolean; use
 * {@link assertVerifiedInvoice} to fail closed.
 */
export const verifyInvoiceSignature = (invoice: InvoiceV1): boolean => {
  let signatureBytes: Uint8Array;
  try {
    signatureBytes = fromBase64(invoice.merchantSignature);
  } catch {
    return false;
  }
  if (signatureBytes.length !== 64) {
    return false;
  }
  let keypair: Keypair;
  try {
    keypair = Keypair.fromPublicKey(invoice.invoiceSigner);
  } catch {
    return false;
  }
  const { merchantSignature: _signature, ...unsigned } = invoice;
  return keypair.verify(canonicalInvoiceBytes(unsigned), signatureBytes);
};

/** Throws {@link InvoiceCodecError} unless the signature verifies. */
export const assertVerifiedInvoice = (invoice: InvoiceV1): InvoiceV1 => {
  if (!verifyInvoiceSignature(invoice)) {
    throw new InvoiceCodecError('invalid_signature', 'Invoice merchant signature is invalid.');
  }
  return invoice;
};

// ---------------------------------------------------------------------------
// Expiry (frozen ten-minute window).
// ---------------------------------------------------------------------------

/** The exact ten-minute expiry instant for an issuance time (ISO-8601 UTC). */
export const deriveExpiresAt = (issuedAt: string): string => {
  assertInstant(issuedAt, 'issuedAt');
  return new Date(Date.parse(issuedAt) + INVOICE_TTL_SECONDS * 1000).toISOString();
};

/** True when the invoice has expired at `nowMs` (default: current time). */
export const isInvoiceExpired = (invoice: InvoiceV1, nowMs: number = Date.now()): boolean =>
  nowMs >= Date.parse(invoice.expiresAt);

/** Throws {@link InvoiceCodecError} with code `expired` when the invoice has expired. */
export const assertNotExpired = (invoice: InvoiceV1, nowMs: number = Date.now()): InvoiceV1 => {
  if (isInvoiceExpired(invoice, nowMs)) {
    throw new InvoiceCodecError('expired', 'Invoice has expired.');
  }
  return invoice;
};

// ---------------------------------------------------------------------------
// QR encoding & the digest-bound reference fallback.
// ---------------------------------------------------------------------------

// A canonical, stable-key-order JSON serialization of the full signed invoice.
// Object key order here is FIXED so a re-encode round-trips byte-for-byte.
const serializeInvoiceJson = (invoice: InvoiceV1): string => {
  const ordered: Record<string, unknown> = {
    version: invoice.version,
    kind: invoice.kind,
    asset: {
      code: invoice.asset.code,
      issuer: invoice.asset.issuer,
      sacAddress: invoice.asset.sacAddress,
      network: invoice.asset.network,
    },
    merchantId: invoice.merchantId,
    settlementWallet: invoice.settlementWallet,
    invoiceSigner: invoice.invoiceSigner,
    amountStroops: invoice.amountStroops,
    nonce: invoice.nonce,
    issuedAt: invoice.issuedAt,
    expiresAt: invoice.expiresAt,
  };
  if (invoice.kind === 'voucher') {
    ordered.programId = invoice.programId;
    ordered.contractId = invoice.contractId;
    ordered.category = invoice.category;
  }
  if (invoice.receiptDigest !== undefined) {
    ordered.receiptDigest = invoice.receiptDigest;
  }
  ordered.merchantSignature = invoice.merchantSignature;
  return JSON.stringify(ordered);
};

/** The inline QR wire string for a signed invoice (no size check). */
export const encodeInvoiceQr = (invoice: InvoiceV1): string =>
  `${INVOICE_QR_PREFIX}${encodeBase64Url(utf8.encode(serializeInvoiceJson(invoice)))}`;

/** A digest-bound reference to an invoice too large to encode inline. */
export type InvoiceReference = Readonly<{
  invoiceId: string;
  /** SHA-256 of the canonical unsigned bytes; equals `invoiceId`, and binds the
   * opaque reference to exact content so a resolved invoice can be integrity-checked. */
  digest: string;
  expiresAt: string;
}>;

/** The reference-fallback QR wire string. Requires connectivity to resolve. */
export const encodeInvoiceReference = (reference: InvoiceReference): string =>
  `${INVOICE_REFERENCE_PREFIX}${encodeBase64Url(
    utf8.encode(
      JSON.stringify({
        invoiceId: reference.invoiceId,
        digest: reference.digest,
        expiresAt: reference.expiresAt,
      }),
    ),
  )}`;

export type InvoiceTransport =
  | Readonly<{ mode: 'inline'; qr: string; invoiceId: string }>
  | Readonly<{ mode: 'reference'; qr: string; reference: InvoiceReference }>;

/**
 * Chooses the transport for a signed invoice: the full inline QR when it fits
 * within {@link MAX_INLINE_QR_CHARS}, otherwise a digest-bound reference that
 * requires connectivity to resolve (Requirement 10.5). The digest equals the
 * invoice id, so a resolved invoice can be verified against it.
 */
export const encodeInvoiceForTransport = (invoice: InvoiceV1): InvoiceTransport => {
  const invoiceId = computeInvoiceId(invoice);
  const qr = encodeInvoiceQr(invoice);
  if (qr.length <= MAX_INLINE_QR_CHARS) {
    return Object.freeze({ mode: 'inline', qr, invoiceId });
  }
  const reference: InvoiceReference = Object.freeze({
    invoiceId,
    digest: invoiceId,
    expiresAt: invoice.expiresAt,
  });
  return Object.freeze({ mode: 'reference', qr: encodeInvoiceReference(reference), reference });
};

export type DecodedInvoicePayload =
  | Readonly<{ mode: 'inline'; invoice: InvoiceV1 }>
  | Readonly<{ mode: 'reference'; reference: InvoiceReference }>;

const decodeReferencePayload = (encoded: string): InvoiceReference => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(utf8Decoder.decode(decodeBase64Url(encoded)));
  } catch {
    throw new InvoiceCodecError('malformed_payload', 'Invoice reference payload is not valid.');
  }
  if (!isRecord(parsed)) {
    throw new InvoiceCodecError('malformed_payload', 'Invoice reference payload must be an object.');
  }
  const invoiceId = readString(parsed, 'invoiceId');
  const digest = readString(parsed, 'digest');
  assertField(HEX_32_BYTES.test(invoiceId), 'invoiceId', 'must be a 32-byte lowercase hex digest');
  assertField(digest === invoiceId, 'digest', 'must equal the invoice id');
  const expiresAt = readString(parsed, 'expiresAt');
  assertInstant(expiresAt, 'expiresAt');
  return Object.freeze({ invoiceId, digest, expiresAt });
};

/**
 * Decodes a scanned QR string into either a full inline invoice or a
 * digest-bound reference. Rejects any string that is not a
 * `reliefchain:invoice:v1` payload (e.g. a static wallet address or an identity
 * QR) with a `malformed_payload` error. Structural validation runs for inline
 * invoices; signature and expiry are verified separately by the caller.
 */
export const decodeInvoiceQr = (payload: string): DecodedInvoicePayload => {
  if (typeof payload !== 'string') {
    throw new InvoiceCodecError('malformed_payload', 'QR payload must be a string.');
  }
  if (payload.startsWith(INVOICE_REFERENCE_PREFIX)) {
    return Object.freeze({
      mode: 'reference',
      reference: decodeReferencePayload(payload.slice(INVOICE_REFERENCE_PREFIX.length)),
    });
  }
  if (!payload.startsWith(INVOICE_QR_PREFIX)) {
    throw new InvoiceCodecError(
      'malformed_payload',
      'Not a reliefchain:invoice:v1 payload. Static addresses and identity QRs are not payable invoices.',
    );
  }
  const encoded = payload.slice(INVOICE_QR_PREFIX.length);
  let parsed: unknown;
  try {
    parsed = JSON.parse(utf8Decoder.decode(decodeBase64Url(encoded)));
  } catch (cause) {
    if (cause instanceof InvoiceCodecError) {
      throw cause;
    }
    throw new InvoiceCodecError('malformed_payload', 'Invoice payload is not valid canonical JSON.');
  }
  return Object.freeze({ mode: 'inline', invoice: parseInvoiceObject(parsed) });
};

export interface InvoiceVerificationOptions {
  /** When provided, expiry is checked against this instant instead of `Date.now()`. */
  readonly nowMs?: number;
}

/**
 * Fully validates a scanned inline invoice QR: structure, merchant signature,
 * and expiry. Returns the typed invoice or throws {@link InvoiceCodecError}.
 * Reference payloads must be resolved online before this can run.
 */
export const decodeAndVerifyInvoiceQr = (
  payload: string,
  options: InvoiceVerificationOptions = {},
): InvoiceV1 => {
  const decoded = decodeInvoiceQr(payload);
  if (decoded.mode === 'reference') {
    throw new InvoiceCodecError(
      'qr_too_large',
      'This invoice is presented by reference and must be resolved online before verification.',
    );
  }
  assertVerifiedInvoice(decoded.invoice);
  assertNotExpired(decoded.invoice, options.nowMs);
  return decoded.invoice;
};

export type { InvoiceKind, InvoiceV1 };

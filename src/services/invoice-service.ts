// Merchant invoice service — the mobile-side orchestration for creating and
// signing canonical `reliefchain:invoice:v1` invoices. It is a thin wrapper over
// the shared, language-neutral codec (`shared/invoice-codec.ts`): it assembles
// the unsigned payload from verified merchant inputs and the server-fixed asset
// configuration, delegates Ed25519 signing to the namespaced merchant wallet,
// and chooses the QR / reference transport.
//
// It never fabricates a settlement result: producing a signed invoice only means
// the merchant has presented a payable request. Confirmation is reconciliation's
// job (Requirements 13.4, 21.2, 21.4).
//
// Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 17.1, 17.2, 17.3, 19.1
import 'react-native-get-random-values';

import { requireRCPHPIdentifiers, stellarConfig } from '@/config/stellar';
import { signMerchantInvoice } from '@/services/stellar-wallet-service';
import type { AssetDescriptor, StroopAmount } from '@/types/blockchain';
import type { InvoiceKind, InvoiceV1 } from '@/types/invoice';
import {
    deriveExpiresAt,
    encodeInvoiceForTransport,
    type InvoiceTransport,
    type UnsignedInvoiceV1,
} from '../../shared/invoice-codec';
import { normalizeReceiptDigest } from './pos-adapter';

/** Everything needed to build one signed invoice. */
export type CreateInvoiceInput = Readonly<{
  /** Authenticated merchant user id; used to locate the namespaced signer. */
  userId: string;
  /** Stable merchant identifier (never the display name). */
  merchantId: string;
  /** Verified merchant settlement wallet and invoice signer (the same pilot key). */
  merchantWallet: string;
  kind: InvoiceKind;
  amountStroops: StroopAmount;
  /** Required for voucher invoices; the merchant-attested program category. */
  category?: string;
  /** Required for voucher invoices; identifies the program and its Soroban contract. */
  programId?: string;
  contractId?: string;
  /** Optional off-chain evidence digest (32-byte lowercase hex). */
  receiptDigest?: string;
  /** Overridable clock, for deterministic tests. */
  issuedAt?: string;
}>;

export type SignedInvoiceResult = Readonly<{
  invoice: InvoiceV1;
  transport: InvoiceTransport;
}>;

const STELLAR_CONTRACT_PATTERN = /^C[A-Z2-7]{55}$/;

/** Resolves the pilot RCPHP asset descriptor from the server-fixed configuration. */
export const resolvePilotAsset = (): AssetDescriptor => {
  const identifiers = requireRCPHPIdentifiers(stellarConfig);
  return Object.freeze({
    code: identifiers.code,
    issuer: identifiers.issuer,
    sacAddress: identifiers.stellarAssetContractId,
    network: stellarConfig.network,
  });
};

/** Generates a fresh 32-byte invoice nonce as 64 lowercase hex characters. */
export const generateInvoiceNonce = (): string => {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

/**
 * Assembles the canonical unsigned invoice from verified merchant inputs. The
 * asset, network, ten-minute expiry, and nonce are set here; PII and item
 * descriptions are never included (Requirement 19.1).
 */
export const buildUnsignedInvoice = (input: CreateInvoiceInput): UnsignedInvoiceV1 => {
  const asset = resolvePilotAsset();
  const issuedAt = input.issuedAt ?? new Date().toISOString();
  const expiresAt = deriveExpiresAt(issuedAt);
  const receiptDigest = normalizeReceiptDigest(input.receiptDigest);
  const base = {
    version: 1 as const,
    asset,
    merchantId: input.merchantId,
    settlementWallet: input.merchantWallet,
    invoiceSigner: input.merchantWallet,
    amountStroops: input.amountStroops,
    nonce: generateInvoiceNonce(),
    issuedAt,
    expiresAt,
    ...(receiptDigest ? { receiptDigest } : {}),
  };

  if (input.kind === 'cash') {
    return { ...base, kind: 'cash' };
  }

  if (!input.programId || !input.contractId || !input.category) {
    throw new Error('Voucher invoices require a program, contract, and merchant-attested category.');
  }
  if (!STELLAR_CONTRACT_PATTERN.test(input.contractId)) {
    throw new Error('Voucher invoices require a valid Soroban contract identifier.');
  }
  return {
    ...base,
    kind: 'voucher',
    programId: input.programId,
    contractId: input.contractId,
    category: input.category,
  };
};

/**
 * Builds, signs, and encodes a merchant invoice for presentation. The returned
 * transport is either an inline QR or a digest-bound reference when the payload
 * exceeds the reliably-scannable size (Requirement 10.5).
 */
export const createSignedInvoice = async (
  input: CreateInvoiceInput,
): Promise<SignedInvoiceResult> => {
  const unsigned = buildUnsignedInvoice(input);
  const invoice = await signMerchantInvoice(input.userId, unsigned);
  const transport = encodeInvoiceForTransport(invoice);
  return Object.freeze({ invoice, transport });
};

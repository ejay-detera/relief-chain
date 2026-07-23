// Beneficiary-side scan decoding — a thin, fail-closed wrapper over the shared
// canonical codec (`shared/invoice-codec.ts`). It decodes a scanned QR string and
// LOCALLY verifies it (schema, network, asset, merchant signature, expiry) before
// any funding source is offered, and maps every rejection to a user-facing
// message. Static wallet-address QRs and beneficiary-identity QRs are rejected as
// non-payable payloads (Requirements 10.6, 10.8, 10.9).
//
// Accreditation, revocation, nonce use, balance, and contract state are
// revalidated ONLINE before value moves (Requirements 11.x, 13.6); this module
// performs only the offline-safe local verification.
//
// Validates: Requirements 10.6, 10.8, 10.9, 13.2

import {
    decodeAndVerifyInvoiceQr,
    InvoiceCodecError,
    type InvoiceCodecErrorCode,
    type InvoiceV1,
} from '../../shared/invoice-codec';

export type ScannedInvoiceResult =
  | { ok: true; invoice: InvoiceV1 }
  | { ok: false; code: InvoiceCodecErrorCode | 'unknown'; message: string };

const MESSAGES: Record<InvoiceCodecErrorCode, string> = {
  malformed_payload:
    'This QR is not a Relief Chain invoice. Static wallet addresses and identity codes cannot be paid.',
  unsupported_version: 'This invoice uses an unsupported format version and cannot be paid.',
  wrong_network: 'This invoice is for a different network and cannot be paid in this pilot.',
  wrong_asset: 'This invoice is for a different asset and cannot be paid here.',
  invalid_field: 'This invoice is malformed and cannot be paid.',
  invalid_signature: 'This invoice signature is invalid. Ask the merchant to present a new invoice.',
  expired: 'This invoice has expired. Ask the merchant to present a new one.',
  qr_too_large: 'This invoice is presented by reference and must be resolved online before it can be reviewed.',
};

/**
 * Decodes and locally verifies a scanned QR payload. Returns the typed invoice on
 * success, or a stable code plus a user-facing message on any rejection. Never
 * throws; the caller renders the message and lets the beneficiary scan again.
 */
export const decodeAndVerifyScannedInvoice = (
  payload: string,
  nowMs?: number,
): ScannedInvoiceResult => {
  try {
    const invoice = decodeAndVerifyInvoiceQr(payload, nowMs === undefined ? {} : { nowMs });
    return { ok: true, invoice };
  } catch (caught: unknown) {
    if (caught instanceof InvoiceCodecError) {
      return { ok: false, code: caught.code, message: MESSAGES[caught.code] };
    }
    return { ok: false, code: 'unknown', message: 'This code could not be read as an invoice.' };
  }
};

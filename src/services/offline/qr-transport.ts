import type { CompactQrEnvelope, OfflineRedemptionEnvelope } from '../../types/offline-sync.ts';
import type { IOfflineTransport } from './transport-interface.ts';

const QR_PREFIX = 'RC-OFF-V1:';

/**
 * Compresses an offline redemption envelope into a compact QR-friendly string.
 */
export function compressEnvelopeForQr(envelope: OfflineRedemptionEnvelope): string {
  const compact: CompactQrEnvelope = {
    v: '1.0',
    n: envelope.nonce,
    p: envelope.programId,
    pn: envelope.programName,
    vt: envelope.voucherType,
    b: envelope.beneficiaryId,
    bw: envelope.beneficiaryWallet,
    bn: envelope.beneficiaryName,
    m: envelope.merchantId,
    as: envelope.amountStroops,
    ap: envelope.amountPhp,
    t: envelope.clientTimestamp,
    sig: envelope.signature,
  };

  const jsonStr = JSON.stringify(compact);
  if (typeof btoa !== 'undefined') {
    try {
      return `${QR_PREFIX}${btoa(unescape(encodeURIComponent(jsonStr)))}`;
    } catch {
      return `${QR_PREFIX}${jsonStr}`;
    }
  }
  return `${QR_PREFIX}${jsonStr}`;
}

/**
 * Decompresses and validates a scanned QR code into an offline redemption envelope.
 */
export function decompressEnvelopeFromQr(scannedText: string): OfflineRedemptionEnvelope | null {
  if (!scannedText || typeof scannedText !== 'string') return null;

  let raw = scannedText.trim();
  if (!raw.startsWith(QR_PREFIX)) {
    return null;
  }

  raw = raw.slice(QR_PREFIX.length);
  let parsed: CompactQrEnvelope | null = null;

  try {
    if (typeof atob !== 'undefined') {
      try {
        const decoded = decodeURIComponent(escape(atob(raw)));
        parsed = JSON.parse(decoded) as CompactQrEnvelope;
      } catch {
        parsed = JSON.parse(raw) as CompactQrEnvelope;
      }
    } else {
      parsed = JSON.parse(raw) as CompactQrEnvelope;
    }
  } catch {
    return null;
  }

  if (!parsed || parsed.v !== '1.0' || !parsed.n || !parsed.p || !parsed.bw || !parsed.as) {
    return null;
  }

  return {
    version: '1.0',
    nonce: parsed.n,
    programId: parsed.p,
    programName: parsed.pn || 'Relief Program',
    voucherType: parsed.vt || 'Food Aid',
    beneficiaryId: parsed.b,
    beneficiaryWallet: parsed.bw,
    beneficiaryName: parsed.bn || 'Beneficiary',
    merchantId: parsed.m,
    amountStroops: parsed.as,
    amountPhp: parsed.ap,
    clientTimestamp: parsed.t || new Date().toISOString(),
    signature: parsed.sig,
    transportMode: 'qr',
  };
}

export class QrOfflineTransport implements IOfflineTransport {
  readonly mode = 'qr' as const;

  async isAvailable(): Promise<boolean> {
    return true; // Camera / QR scanning is universally available
  }

  async sendPayload(_envelope: OfflineRedemptionEnvelope): Promise<boolean> {
    return true;
  }
}

export const qrTransport = new QrOfflineTransport();

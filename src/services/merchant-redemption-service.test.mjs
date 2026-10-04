import assert from 'node:assert/strict';
import test from 'node:test';

const STELLAR_PUBLIC_KEY_REGEX = /^G[A-Z2-7]{55}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractVoucherTarget(payload) {
  if (!payload || typeof payload !== 'string') return null;
  const raw = payload.trim();

  if (STELLAR_PUBLIC_KEY_REGEX.test(raw)) {
    return { beneficiaryAddress: raw };
  }

  const uriMatch = raw.match(/reliefchain:(?:beneficiary|wallet):([G0-9a-zA-Z-]+)/i);
  if (uriMatch && uriMatch[1]) {
    const candidate = uriMatch[1].trim();
    if (STELLAR_PUBLIC_KEY_REGEX.test(candidate) || UUID_REGEX.test(candidate)) {
      return { beneficiaryAddress: candidate };
    }
  }

  if (raw.startsWith('{') && raw.endsWith('}')) {
    try {
      const parsed = JSON.parse(raw);
      const candidate = parsed.beneficiaryWallet || parsed.publicKey || parsed.address || parsed.wallet || parsed.id;
      const isVoucher = parsed.type === 'reliefchain:voucher';
      const address = (typeof candidate === 'string' && (STELLAR_PUBLIC_KEY_REGEX.test(candidate) || UUID_REGEX.test(candidate)))
        ? candidate
        : (isVoucher ? (typeof parsed.enrollmentId === 'string' ? parsed.enrollmentId : 'voucher-holder') : '');

      if (address) {
        return {
          beneficiaryAddress: address,
          programId: typeof parsed.programId === 'string' ? parsed.programId : undefined,
          enrollmentId: typeof parsed.enrollmentId === 'string' ? parsed.enrollmentId : undefined,
          category: typeof parsed.category === 'string' ? parsed.category : undefined,
          voucherType: typeof parsed.voucherType === 'string' ? parsed.voucherType : undefined,
        };
      }
    } catch {
      // not JSON
    }
  }

  if (UUID_REGEX.test(raw)) {
    return { beneficiaryAddress: raw };
  }

  return null;
}

function extractBeneficiaryAddress(payload) {
  const target = extractVoucherTarget(payload);
  return target?.beneficiaryAddress ?? null;
}

function generateRedemptionReceipt(params) {
  const shortHash = (params.transactionHash || Date.now().toString()).slice(0, 8).toUpperCase();
  const receiptNumber = `RC-RED-${shortHash}-${Math.floor(1000 + Math.random() * 9000)}`;
  const amountPhp = (Number(params.amountStroops) / 10_000_000).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const remainingBalancePhp = (Number(params.remainingBalanceStroops) / 10_000_000).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return {
    receiptNumber,
    merchantName: params.merchantName,
    merchantSettlementAddress: params.merchantSettlementAddress,
    beneficiaryName: params.beneficiaryName,
    beneficiaryWallet: params.beneficiaryWallet,
    programName: params.programName,
    voucherType: params.voucherType,
    amountPhp,
    remainingBalancePhp,
    timestamp: new Date().toISOString(),
    transactionHash: params.transactionHash ?? null,
  };
}

test('extractBeneficiaryAddress extracts raw Stellar addresses', () => {
  const addr = 'GAIKYUNHR734V5CKHXYE6PJOTIVIGT5B6W23TOFLMDKF525W3HASPO5I';
  assert.equal(extractBeneficiaryAddress(addr), addr);
  assert.equal(extractBeneficiaryAddress(`   ${addr}   `), addr);
});

test('extractBeneficiaryAddress extracts from URI format', () => {
  const addr = 'GAIKYUNHR734V5CKHXYE6PJOTIVIGT5B6W23TOFLMDKF525W3HASPO5I';
  assert.equal(extractBeneficiaryAddress(`reliefchain:beneficiary:${addr}`), addr);
  assert.equal(extractBeneficiaryAddress(`reliefchain:wallet:${addr}`), addr);
});

test('extractBeneficiaryAddress extracts from JSON QR format', () => {
  const addr = 'GAIKYUNHR734V5CKHXYE6PJOTIVIGT5B6W23TOFLMDKF525W3HASPO5I';
  const json = JSON.stringify({ publicKey: addr, role: 'beneficiary' });
  assert.equal(extractBeneficiaryAddress(json), addr);
});

test('extractVoucherTarget extracts full voucher metadata from voucher QR payload', () => {
  const addr = 'GAIKYUNHR734V5CKHXYE6PJOTIVIGT5B6W23TOFLMDKF525W3HASPO5I';
  const voucherQr = JSON.stringify({
    type: 'reliefchain:voucher',
    version: 1,
    programId: 'prog-food-101',
    enrollmentId: 'enr-202',
    beneficiaryWallet: addr,
    category: 'food',
    voucherType: 'Food Assistance',
  });

  const target = extractVoucherTarget(voucherQr);
  assert.ok(target);
  assert.equal(target.beneficiaryAddress, addr);
  assert.equal(target.programId, 'prog-food-101');
  assert.equal(target.enrollmentId, 'enr-202');
  assert.equal(target.category, 'food');
  assert.equal(target.voucherType, 'Food Assistance');

  assert.equal(extractBeneficiaryAddress(voucherQr), addr);
});

test('extractVoucherTarget extracts voucher metadata even if beneficiaryWallet is pending', () => {
  const voucherQr = JSON.stringify({
    type: 'reliefchain:voucher',
    version: 1,
    programId: 'prog-food-101',
    enrollmentId: '12345678-1234-1234-1234-123456789abc',
    beneficiaryWallet: '',
    category: 'food',
    voucherType: 'Food Assistance',
  });

  const target = extractVoucherTarget(voucherQr);
  assert.ok(target);
  assert.equal(target.programId, 'prog-food-101');
  assert.equal(target.enrollmentId, '12345678-1234-1234-1234-123456789abc');
  assert.equal(target.category, 'food');
  assert.equal(target.beneficiaryAddress, '12345678-1234-1234-1234-123456789abc');
});

test('extractBeneficiaryAddress returns null for invalid payload', () => {
  assert.equal(extractBeneficiaryAddress('invalid-random-data'), null);
  assert.equal(extractBeneficiaryAddress(''), null);
});

test('generateRedemptionReceipt formats receipt properly', () => {
  const receipt = generateRedemptionReceipt({
    merchantName: 'Metro Grocers',
    merchantSettlementAddress: 'GDMERCHANT...',
    beneficiaryName: 'Juan Dela Cruz',
    beneficiaryWallet: 'GDBENEFICIARY...',
    programName: 'Disaster Food Relief',
    voucherType: 'Food Assistance',
    amountStroops: '5000000000',
    remainingBalanceStroops: '10000000000',
    transactionHash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  });

  assert.match(receipt.receiptNumber, /^RC-RED-ABCDEF12/);
  assert.equal(receipt.merchantName, 'Metro Grocers');
  assert.equal(receipt.beneficiaryName, 'Juan Dela Cruz');
  assert.equal(receipt.voucherType, 'Food Assistance');
  assert.equal(receipt.amountPhp, '500.00');
  assert.equal(receipt.remainingBalancePhp, '1,000.00');
});

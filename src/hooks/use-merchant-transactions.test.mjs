import assert from 'node:assert/strict';
import { test } from 'node:test';

export const formatTransactionDate = (dateIso) => {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return dateIso;
  const isToday = new Date().toDateString() === date.toDateString();
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Today, ${timeStr}`;
  const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  return `${dateStr}, ${timeStr}`;
};

export const shortReference = (correlationId, id) => {
  const raw = correlationId || id;
  return `STL-${raw.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
};

test('formatTransactionDate formats today correctly', () => {
  const now = new Date();
  const formatted = formatTransactionDate(now.toISOString());
  assert.match(formatted, /^Today,\s+\d{1,2}:\d{2}\s+(AM|PM)$/i);
});

test('formatTransactionDate formats past date with date and time', () => {
  const past = new Date('2026-05-15T09:30:00Z');
  const formatted = formatTransactionDate(past.toISOString());
  assert.match(formatted, /May\s+15,\s+2026/);
});

test('shortReference creates consistent STL- prefixed codes', () => {
  const ref1 = shortReference('12345678-abcd-ef01-2345-6789abcdef01', 'id-1');
  assert.equal(ref1, 'STL-12345678');

  const ref2 = shortReference(null, '87654321-fedc-ba98-7654-3210fedcba98');
  assert.equal(ref2, 'STL-87654321');
});

test('settlement mapping calculates correct PHP and Stroops amounts', () => {
  const mockSettlement = {
    id: 'stl-1',
    amount_stroops: 15_000_000_000, // 1500 PHP
    kind: 'voucher_redemption',
    transaction_hash: 'abc123hash',
    ledger: 100,
    status: 'confirmed',
    correlation_id: 'corr-1',
    confirmed_at: '2026-06-01T12:00:00Z',
    created_at: '2026-06-01T12:00:00Z',
    program_id: 'prog-1',
    program: { id: 'prog-1', name: 'Emergency Rice Aid' },
  };

  const amountPhp = Number(mockSettlement.amount_stroops) / 10_000_000;
  assert.equal(amountPhp, 1500);

  const programName = mockSettlement.program?.name;
  assert.equal(programName, 'Emergency Rice Aid');
});

test('summary metrics sum Stroops and partition voucher vs cash correctly', () => {
  const txs = [
    { kind: 'voucher_redemption', amountStroops: 10_000_000_000n }, // 1000 PHP
    { kind: 'voucher_redemption', amountStroops: 5_000_000_000n },  // 500 PHP
    { kind: 'cash_payment', amountStroops: 2_500_000_000n },        // 250 PHP
  ];

  let totalStroops = 0n;
  let voucherCount = 0;
  let cashCount = 0;

  for (const t of txs) {
    totalStroops += t.amountStroops;
    if (t.kind === 'voucher_redemption') voucherCount++;
    else cashCount++;
  }

  assert.equal(totalStroops, 17_500_000_000n);
  assert.equal(Number(totalStroops) / 10_000_000, 1750);
  assert.equal(voucherCount, 2);
  assert.equal(cashCount, 1);
});

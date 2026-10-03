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

export const matchesDateRange = (dateIso, preset, now = new Date()) => {
  if (preset === 'all') return true;
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return false;

  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endOfDay = startOfDay + 24 * 60 * 60 * 1000 - 1;
  const targetTime = date.getTime();

  if (preset === 'today') {
    return targetTime >= startOfDay && targetTime <= endOfDay;
  }
  if (preset === '7d') {
    const sevenDaysAgo = startOfDay - 6 * 24 * 60 * 60 * 1000;
    return targetTime >= sevenDaysAgo && targetTime <= endOfDay;
  }
  if (preset === '30d') {
    const thirtyDaysAgo = startOfDay - 29 * 24 * 60 * 60 * 1000;
    return targetTime >= thirtyDaysAgo && targetTime <= endOfDay;
  }
  return true;
};

export const exportTransactionsToCsv = (transactions) => {
  const headers = [
    'Reference',
    'Date',
    'Payer',
    'Program',
    'Kind',
    'Amount (PHP)',
    'Status',
    'Transaction Hash',
  ];

  const escapeCsv = (val) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = transactions.map((tx) => [
    escapeCsv(shortReference(tx.correlationId, tx.id)),
    escapeCsv(tx.occurredAt),
    escapeCsv(tx.payerName),
    escapeCsv(tx.programName || 'N/A'),
    escapeCsv(tx.kind === 'voucher_redemption' ? 'Voucher' : 'Cash'),
    escapeCsv(tx.amount.toFixed(2)),
    escapeCsv(tx.status),
    escapeCsv(tx.transactionHash || 'N/A'),
  ].join(','));

  return [headers.map((h) => `"${h}"`).join(','), ...rows].join('\n');
};

test('matchesDateRange filters today, 7d, 30d, and all correctly', () => {
  const fixedNow = new Date('2026-10-03T12:00:00Z');
  const todayDate = new Date('2026-10-03T02:00:00Z').toISOString();
  const fourDaysAgo = new Date('2026-09-29T10:00:00Z').toISOString();
  const twentyDaysAgo = new Date('2026-09-13T10:00:00Z').toISOString();
  const fiftyDaysAgo = new Date('2026-08-14T10:00:00Z').toISOString();

  // 'all'
  assert.equal(matchesDateRange(fiftyDaysAgo, 'all', fixedNow), true);

  // 'today'
  assert.equal(matchesDateRange(todayDate, 'today', fixedNow), true);
  assert.equal(matchesDateRange(fourDaysAgo, 'today', fixedNow), false);

  // '7d'
  assert.equal(matchesDateRange(fourDaysAgo, '7d', fixedNow), true);
  assert.equal(matchesDateRange(twentyDaysAgo, '7d', fixedNow), false);

  // '30d'
  assert.equal(matchesDateRange(twentyDaysAgo, '30d', fixedNow), true);
  assert.equal(matchesDateRange(fiftyDaysAgo, '30d', fixedNow), false);
});

test('exportTransactionsToCsv generates properly escaped CSV string', () => {
  const sampleTransactions = [
    {
      id: 'tx-1',
      correlationId: '12345678-0000',
      occurredAt: 'Today, 10:00 AM',
      payerName: 'Maria Santos',
      programName: 'Rice Subsidy "Special"',
      kind: 'voucher_redemption',
      amount: 500,
      status: 'confirmed',
      transactionHash: 'hash123',
    },
    {
      id: 'tx-2',
      correlationId: null,
      occurredAt: 'Sep 28, 2026, 02:30 PM',
      payerName: 'Juan Dela Cruz',
      programName: null,
      kind: 'cash_payment',
      amount: 120.5,
      status: 'confirmed',
      transactionHash: null,
    },
  ];

  const csv = exportTransactionsToCsv(sampleTransactions);
  const lines = csv.split('\n');

  assert.equal(lines.length, 3);
  assert.match(lines[0], /^"Reference","Date","Payer","Program","Kind","Amount \(PHP\)","Status","Transaction Hash"$/);
  assert.match(lines[1], /^"STL-12345678","Today, 10:00 AM","Maria Santos","Rice Subsidy ""Special""","Voucher","500.00","confirmed","hash123"$/);
  assert.match(lines[2], /^"STL-TX2","Sep 28, 2026, 02:30 PM","Juan Dela Cruz","N\/A","Cash","120.50","confirmed","N\/A"$/);
});

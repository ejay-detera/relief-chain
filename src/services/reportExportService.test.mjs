import assert from 'node:assert/strict';
import test from 'node:test';

import {
  convertReportToCsv,
  escapeCsvValue,
  generateReportHtml,
} from '../utils/report-utils.ts';

const mockReport = {
  title: 'Financial Treasury & Blockchain Ledger Reconciliation',
  reportType: 'financial',
  organizationName: 'City of Pasig Disaster Relief Office',
  organizationId: 'org-test-uuid',
  generatedAt: '2026-10-04T12:00:00.000Z',
  dateRangeLabel: 'All Time',
  programLabel: 'All Programs',
  summaryKpis: [
    { id: 'kpi_1', label: 'Total Allocated', value: '₱5,000,000.00' },
    { id: 'kpi_2', label: 'Total Disbursed', value: '₱3,200,000.00', highlight: true },
  ],
  reconciliation: {
    isReconciled: true,
    ledgerAsset: 'RCPHP',
    treasuryBalance: 1800000,
    totalAllocated: 5000000,
    totalDisbursed: 3200000,
    drift: 0,
    verifiedAt: '2026-10-04T12:00:00.000Z',
    ledgerProofHash: '0x12345678abcdef',
  },
  columns: [
    { key: 'item', label: 'Fund Item', align: 'left' },
    { key: 'amount', label: 'Amount', align: 'right', format: 'currency' },
    { key: 'status', label: 'Status', align: 'center', format: 'status' },
  ],
  rows: [
    { item: 'Cash Assistance Batch #1', amount: '₱1,000,000.00', status: 'SETTLED' },
    { item: 'Medicine Aid, North District', amount: '₱2,200,000.00', status: 'SETTLED' },
  ],
  totalRecords: 2,
};

test('escapeCsvValue correctly conforms to RFC 4180', () => {
  assert.equal(escapeCsvValue('Simple'), '"Simple"');
  assert.equal(escapeCsvValue('With, Comma'), '"With, Comma"');
  assert.equal(escapeCsvValue('With "Quotes"'), '"With ""Quotes"""');
  assert.equal(escapeCsvValue('Line 1\nLine 2'), '"Line 1\nLine 2"');
  assert.equal(escapeCsvValue(null), '""');
  assert.equal(escapeCsvValue(undefined), '""');
  assert.equal(escapeCsvValue(12345), '"12345"');
});

test('convertReportToCsv creates complete CSV with metadata and reconciliation', () => {
  const csv = convertReportToCsv(mockReport);

  assert.ok(csv.includes('RELIEF CHAIN AUDIT & COMPLIANCE REPORT'));
  assert.ok(csv.includes('City of Pasig Disaster Relief Office'));
  assert.ok(csv.includes('RECONCILED (ZERO DRIFT)'));
  assert.ok(csv.includes('0x12345678abcdef'));
  assert.ok(csv.includes('"Fund Item","Amount","Status"'));
  assert.ok(csv.includes('Cash Assistance Batch #1'));
  assert.ok(csv.includes('"Medicine Aid, North District"'));
});

test('generateReportHtml includes branding, reconciliation box, and table structure', () => {
  const html = generateReportHtml(mockReport);

  assert.ok(html.includes('Official Relief Chain Municipal & Donor Reporting Document'));
  assert.ok(html.includes('City of Pasig Disaster Relief Office'));
  assert.ok(html.includes('BLOCKCHAIN RECONCILED — ZERO DRIFT'));
  assert.ok(html.includes('0x12345678abcdef'));
  assert.ok(html.includes('₱5,000,000.00'));
  assert.ok(html.includes('Cash Assistance Batch #1'));
  assert.ok(html.includes('Detailed Record Breakdown (2 entries)'));
});

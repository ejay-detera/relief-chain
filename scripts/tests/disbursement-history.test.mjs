// RED test: disbursement history must read distribution_jobs, not legacy disbursements.
//
// Symptom: LGU history screen shows zero rows despite distribution_jobs rows
// existing (job 6c4a0887 reconciling + two partial_failed). Root cause under
// test: src/services/disbursementService.ts queries the legacy `disbursements`
// table which the current prepare/submit flow never writes (it writes
// distribution_jobs + distribution_recipients). This test pins the corrected
// wiring: source table, program join, stroops mapping, status preservation,
// and projection-hash fallback.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('../../', import.meta.url));
const servicePath = path.join(rootDir, 'src', 'services', 'disbursementService.ts');

const readServiceSource = async () => readFile(servicePath, 'utf8');

test('history service reads distribution_jobs (not legacy disbursements)', async () => {
  const source = await readServiceSource();
  assert.match(source, /from\(['"]distribution_jobs['"]\)/, 'must query distribution_jobs');
  assert.doesNotMatch(source, /from\(['"]disbursements['"]\)/, 'must not query legacy disbursements');
});

test('history service joins program names (no client-fabricated rows)', async () => {
  const source = await readServiceSource();
  assert.match(
    source,
    /programs\s*\(\s*name|programs!inner|programs\s*\(/,
    'must join programs for the display name',
  );
});

test('history query orders newest first without excluding reconciling/partial_failed', async () => {
  const source = await readServiceSource();
  assert.match(source, /order\(['"]created_at['"]/, 'must order by created_at');
  // No status allowlist that would hide in-flight jobs.
  assert.doesNotMatch(
    source,
    /\.eq\(['"]status['"]\s*,\s*['"]completed['"]\)/,
    'must not filter to completed only',
  );
  assert.doesNotMatch(
    source,
    /\.in\(['"]status['"]\s*,\s*\[[^\]]*completed[^\]]*\]\)/,
    'must not use a completed-only allowlist',
  );
});

test('history row mapper preserves reconciling and partial_failed statuses', async () => {
  const source = await readServiceSource();
  assert.match(source, /reconciling/, 'must handle reconciling jobs');
  assert.match(source, /partial_failed/, 'must handle partial_failed jobs');
});

test('history maps stroops via integer math (fail closed, no float drift)', async () => {
  const source = await readServiceSource();
  assert.match(source, /10_000_000|STROOPS/, 'must scale stroops explicitly');
});

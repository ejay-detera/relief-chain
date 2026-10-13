import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (relativePath) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');

const SCREEN = '../../../app/(beneficiary)/find-organization.tsx';
const LIST = './organization-program-list.tsx';
const CARD = './organization-program-card.tsx';

test('Find Organization does not disable Apply from the identity verification status', () => {
  assert.doesNotMatch(
    read(SCREEN),
    /applyDisabled\s*=/,
    'A new (Pending) beneficiary must be able to apply; the organization reviews the application afterwards.',
  );
});

test('Program list does not accept or forward a verification-derived disabled flag', () => {
  const list = read(LIST);
  assert.doesNotMatch(list, /applyDisabled/);
  assert.doesNotMatch(list, /disabled=\{/);
});

test('Program card disables Apply only from program-level availability (program.canApply)', () => {
  const card = read(CARD);
  assert.match(card, /const isApplyDisabled = !program\.canApply;/);
  assert.doesNotMatch(card, /verification_status|isVerified/);
});

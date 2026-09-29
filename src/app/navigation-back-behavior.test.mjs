import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

test('LGU layout sets backBehavior="history" on Tabs', () => {
  const layoutPath = fileURLToPath(new URL('./(lgu)/_layout.tsx', import.meta.url));
  const source = readFileSync(layoutPath, 'utf8');

  assert.match(
    source,
    /<Tabs\s+backBehavior="history"/,
    'LGU layout must configure backBehavior="history" on Tabs to preserve navigation history',
  );
});

test('Beneficiary layout sets backBehavior="history" on Tabs', () => {
  const layoutPath = fileURLToPath(new URL('./(beneficiary)/_layout.tsx', import.meta.url));
  const source = readFileSync(layoutPath, 'utf8');

  assert.match(
    source,
    /<Tabs\s+backBehavior="history"/,
    'Beneficiary layout must configure backBehavior="history" on Tabs to preserve navigation history',
  );
});

test('MerchantBottomNavigation uses router.navigate to maintain stack history', () => {
  const navPath = fileURLToPath(new URL('../components/MerchantDashboard/MerchantBottomNavigation.tsx', import.meta.url));
  const source = readFileSync(navPath, 'utf8');

  assert.doesNotMatch(
    source,
    /router\.replace/,
    'MerchantBottomNavigation must not use router.replace which wipes out navigation history',
  );
  assert.match(
    source,
    /router\.navigate\('\/\(merchant\)'/,
    'MerchantBottomNavigation must use router.navigate for Dashboard',
  );
  assert.match(
    source,
    /router\.navigate\('\/\(merchant\)\/programs'\)/,
    'MerchantBottomNavigation must use router.navigate for Programs',
  );
  assert.match(
    source,
    /router\.navigate\('\/\(merchant\)\/profile'\)/,
    'MerchantBottomNavigation must use router.navigate for Profile',
  );
});

test('Sub-screens use safe canGoBack fallback navigation', () => {
  const lguEditProfile = readFileSync(fileURLToPath(new URL('./(lgu)/edit-profile.tsx', import.meta.url)), 'utf8');
  assert.match(lguEditProfile, /router\.canGoBack\(\)/, 'LGU edit-profile must verify canGoBack');

  const lguSecurity = readFileSync(fileURLToPath(new URL('./(lgu)/security.tsx', import.meta.url)), 'utf8');
  assert.match(lguSecurity, /router\.canGoBack\(\)/, 'LGU security must verify canGoBack');

  const lguProgramDetails = readFileSync(fileURLToPath(new URL('./(lgu)/program/[id].tsx', import.meta.url)), 'utf8');
  assert.match(lguProgramDetails, /router\.canGoBack\(\)/, 'LGU program details must verify canGoBack');

  const beneficiaryWalletRecovery = readFileSync(fileURLToPath(new URL('./(beneficiary)/wallet-recovery.tsx', import.meta.url)), 'utf8');
  assert.match(beneficiaryWalletRecovery, /router\.canGoBack\(\)/, 'Beneficiary wallet recovery must verify canGoBack');

  const beneficiaryTransactions = readFileSync(fileURLToPath(new URL('./(beneficiary)/transactions.tsx', import.meta.url)), 'utf8');
  assert.match(beneficiaryTransactions, /router\.canGoBack\(\)/, 'Beneficiary transactions must verify canGoBack');

  const merchantSecurity = readFileSync(fileURLToPath(new URL('./(merchant)/security.tsx', import.meta.url)), 'utf8');
  assert.match(merchantSecurity, /router\.canGoBack\(\)/, 'Merchant security must verify canGoBack');

  const merchantWalletRecovery = readFileSync(fileURLToPath(new URL('./(merchant)/wallet-recovery.tsx', import.meta.url)), 'utf8');
  assert.match(merchantWalletRecovery, /router\.canGoBack\(\)/, 'Merchant wallet recovery must verify canGoBack');
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Task 15.3 (Requirements 12.1, 12.2, 13.1, 13.3): confirms the pure
// routing-decision function used by Property 16/17's tests
// (`getLguNavigationDecision`) is actually invoked by `RootLayoutNav` in
// `_layout.tsx`, not just tested in isolation. There is no React Native
// renderer set up in this repo (see `auth-profile.test.mjs`), so this
// asserts at the source level — the same convention that file already
// establishes — that:
// 1. `_layout.tsx` imports `getLguNavigationDecision` from the module the
//    property tests import it from.
// 2. `RootLayoutNav`'s effect calls it, gated on `profile.role === 'lgu'`
//    and a loaded `profile.registration`, and acts on both non-'stay'
//    outcomes via `router.replace`.
test('RootLayoutNav imports and invokes getLguNavigationDecision from lgu-navigation-guard', () => {
  const layoutPath = fileURLToPath(new URL('./_layout.tsx', import.meta.url));
  const source = readFileSync(layoutPath, 'utf8');

  assert.match(
    source,
    /import\s*\{\s*getLguNavigationDecision\s*\}\s*from\s*'@\/utils\/lgu-navigation-guard'/,
    'RootLayoutNav must import getLguNavigationDecision from the same module the Property 16/17 tests exercise',
  );

  assert.match(
    source,
    /profile\.role\s*===\s*'lgu'\s*&&\s*profile\.registration/,
    'the lgu-status gating branch must be reached only when the profile is lgu and its registration has loaded',
  );

  assert.match(
    source,
    /getLguNavigationDecision\(\s*profile\.registration\.status\s*,\s*\{\s*group\s*,\s*route\s*\}\s*\)/,
    'RootLayoutNav must call getLguNavigationDecision with the current status and navigation segments',
  );

  assert.match(
    source,
    /decision === 'redirect-to-review'/,
    'RootLayoutNav must act on the redirect-to-review decision',
  );
  assert.match(
    source,
    /decision === 'redirect-to-dashboard'/,
    'RootLayoutNav must act on the redirect-to-dashboard decision',
  );
  assert.match(
    source,
    /router\.replace\('\/\(auth\)\/application-review'\)/,
    'the redirect-to-review branch must navigate to the Application_Review_Screen',
  );
  assert.match(
    source,
    /router\.replace\(getRoleHome\('lgu'\)\)/,
    'the redirect-to-dashboard branch must navigate to the lgu role home (LGU_Dashboard)',
  );
});

// Confirms the extracted function itself is what the module exports and
// what the property tests in lgu-navigation-guard.test.mjs import, closing
// the loop between "tested in isolation" and "wired into production code".
test('lgu-navigation-guard module exports getLguNavigationDecision', () => {
  const guardPath = fileURLToPath(new URL('../utils/lgu-navigation-guard.ts', import.meta.url));
  const source = readFileSync(guardPath, 'utf8');

  assert.match(source, /export const getLguNavigationDecision/);
});

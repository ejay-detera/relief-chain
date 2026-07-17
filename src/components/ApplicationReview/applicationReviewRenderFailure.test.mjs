import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { resolveApplicationReviewMessage, shouldShowGenericErrorState } from './messaging.ts';

// Task 13.6 (Requirement 11.3): "IF the under-review messaging cannot be
// displayed, THEN THE relief-chain application SHALL NOT show the
// Application_Review_Screen."
//
// `ApplicationReviewContent` (src/components/ApplicationReview/ApplicationReviewContent.tsx)
// derives everything it renders from `resolveApplicationReviewMessage(registration)`
// and has a single early-return guard:
//
//   const message = resolveApplicationReviewMessage(registration);
//   if (!message) {
//     return <ErrorState ... />;
//   }
//   ... (under-review / rejected+resubmit content) ...
//
// There is no React Native renderer configured in this repo (mirroring the
// source-level scoping approach already used in
// `rejectionReasonScoping.test.mjs` and `auth-profile.test.mjs`), so this
// test combines:
//   1. The pure decision function that drives the guard (already exercised
//      individually in messaging.test.mjs) to enumerate every "messaging
//      cannot be resolved" case, and
//   2. Static verification of the component's source, confirming the guard
//      is an early return that unconditionally renders the generic
//      `ErrorState` and returns before any Application_Review_Screen
//      content (under-review messaging or rejection reason + resubmit) can
//      be produced.
// Together these demonstrate the component-level behavior required by this
// task: when messaging cannot be resolved, the Application_Review_Screen
// content is not shown and the generic error state renders instead.

const componentPath = fileURLToPath(new URL('./ApplicationReviewContent.tsx', import.meta.url));
const componentSource = readFileSync(componentPath, 'utf8');

const unresolvableRegistrations = [
  null,
  undefined,
  { id: 'reg-1', status: 'Rejected', rejectionReason: null },
  { id: 'reg-2', status: 'Rejected', rejectionReason: '' },
  { id: 'reg-3', status: 'Rejected', rejectionReason: '   ' },
  { id: 'reg-4', status: 'Approved', rejectionReason: null },
];

test('every case where messaging cannot be resolved trips the generic-error-state guard', () => {
  for (const registration of unresolvableRegistrations) {
    assert.equal(resolveApplicationReviewMessage(registration), null);
    assert.equal(shouldShowGenericErrorState(registration), true);
  }
});

test('ApplicationReviewContent renders the generic ErrorState, not the Application_Review_Screen content, when messaging cannot be resolved', () => {
  // The component imports and returns the shared generic error state.
  assert.match(componentSource, /import\s*\{\s*ErrorState\s*\}\s*from\s*'@\/components\/shared\/error-state'/);

  // The guard is an early return keyed off the same resolver used above,
  // so `!message` and `shouldShowGenericErrorState` describe the same
  // condition tested against the pure function.
  const guardMatch = componentSource.match(/if\s*\(!message\)\s*\{\s*return\s*<ErrorState[^;]*;\s*\}/);
  assert.ok(guardMatch, 'expected an early-return guard rendering <ErrorState /> when message is falsy');

  const guardIndex = componentSource.indexOf(guardMatch[0]);
  const underReviewIndex = componentSource.indexOf("message.kind === 'under-review'");
  const rejectedTitleIndex = componentSource.indexOf('Application not approved');

  // The guard must appear before either content branch, and since it is a
  // `return` statement, control never reaches those branches once it
  // fires — i.e. the Application_Review_Screen content is not shown.
  assert.ok(guardIndex >= 0 && guardIndex < underReviewIndex, 'guard must precede the under-review content branch');
  assert.ok(guardIndex >= 0 && guardIndex < rejectedTitleIndex, 'guard must precede the rejected+resubmit content branch');
});

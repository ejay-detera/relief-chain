import fc from 'fast-check';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { resolveApplicationReviewMessage } from './messaging.ts';

const nonEmptyReasonArbitrary = fc.string({ minLength: 1 }).filter((value) => value.trim().length > 0);
const rejectedRegistrationArbitrary = nonEmptyReasonArbitrary.chain((reason) =>
  fc.record({ id: fc.uuid(), status: fc.constant('Rejected'), rejectionReason: fc.constant(reason) }),
);

// Feature: organization-registration-review, Property 18: Rejection_Reason is only ever rendered on the Application_Review_Screen
// **Validates: Requirement 13.2**
//
// Half 1: for any Rejected Registration and any reason, that exact reason
// appears in the data resolveApplicationReviewMessage (the pure function
// ApplicationReviewContent renders from) produces.
test('the exact recorded Rejection_Reason appears in the Application_Review_Screen render data for any Rejected Registration', () => {
  fc.assert(
    fc.property(rejectedRegistrationArbitrary, (registration) => {
      const message = resolveApplicationReviewMessage(registration);
      assert.equal(message?.kind, 'rejected');
      assert.equal(message?.reason, registration.rejectionReason.trim());
    }),
    { numRuns: 100 },
  );
});

// Half 2: no other mobile screen's source ever reads/renders
// `registration.rejectionReason` (or a `rejectionReason` field generally).
// There is no React Native renderer configured in this repo (mirroring the
// source-level scoping approach already used in
// `src/utils/auth-profile.test.mjs`), so this is verified statically: every
// route file under `src/app` other than `application-review.tsx` (which
// renders `ApplicationReviewContent`, the sole consumer of
// `resolveApplicationReviewMessage`) must not reference `rejectionReason`
// anywhere in its source.
const appDir = fileURLToPath(new URL('../../app', import.meta.url));

const collectRouteFiles = (dir) => {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return collectRouteFiles(fullPath);
    if (!['.tsx', '.ts'].includes(extname(entry.name))) return [];
    return [fullPath];
  });
};

test('no screen other than application-review.tsx references rejectionReason in its source', () => {
  const routeFiles = collectRouteFiles(appDir).filter((path) => !path.replace(/\\/g, '/').endsWith('/(auth)/application-review.tsx'));

  assert.ok(routeFiles.length > 0, 'expected to find at least one other route file to scope this property against');

  for (const path of routeFiles) {
    const source = readFileSync(path, 'utf8');
    assert.doesNotMatch(source, /rejectionReason/, `expected ${path} to never reference rejectionReason`);
  }
});

test('application-review.tsx is the route that renders the Rejection_Reason-bearing content component', () => {
  const applicationReviewRoutePath = fileURLToPath(new URL('../../app/(auth)/application-review.tsx', import.meta.url));
  const source = readFileSync(applicationReviewRoutePath, 'utf8');
  assert.match(source, /ApplicationReviewContent/);
});

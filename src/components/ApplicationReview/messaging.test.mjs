import fc from 'fast-check';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveApplicationReviewMessage, shouldShowGenericErrorState, shouldShowResubmitOption } from './messaging.ts';

const nonEmptyReasonArbitrary = fc.string({ minLength: 1 }).filter((value) => value.trim().length > 0);
const blankReasonArbitrary = fc.constantFrom(null, undefined, '', '   ', '\n\t');

const pendingRegistrationArbitrary = fc.record({
  id: fc.uuid(),
  status: fc.constant('Pending'),
  rejectionReason: fc.constant(null),
});

const rejectedWithReasonArbitrary = nonEmptyReasonArbitrary.chain((reason) =>
  fc.record({ id: fc.uuid(), status: fc.constant('Rejected'), rejectionReason: fc.constant(reason) }),
);

const rejectedWithoutReasonArbitrary = blankReasonArbitrary.chain((reason) =>
  fc.record({ id: fc.uuid(), status: fc.constant('Rejected'), rejectionReason: fc.constant(reason ?? null) }),
);

const approvedRegistrationArbitrary = fc.record({
  id: fc.uuid(),
  status: fc.constant('Approved'),
  rejectionReason: fc.constant(null),
});

// "Prior-screen-history" is any value at all here, since the pure decision
// function `resolveApplicationReviewMessage` only ever takes the current
// `RegistrationSummary` as input (per the design's ApplicationReviewContent
// signature). Threading random history values through and asserting the
// outcome never changes is exactly how purity-with-respect-to-history is
// demonstrated for the part of Property 16 already built in this task
// (ApplicationReviewContent's Pending/Rejected rendering decision).
//
// The remaining branch of Property 16 (Approved -> LGU_Dashboard, reachable
// regardless of whether the Application_Review_Screen was shown earlier in
// the session) is covered by Task 15's property test (Property 17) once the
// routing decision is extracted from and wired into `_layout.tsx` — that
// task is out of scope here.
const priorHistoryArbitrary = fc.oneof(
  fc.constant(null),
  fc.array(fc.constantFrom('application-review', 'registration-success', 'choose-account')),
  fc.record({ visitedReview: fc.boolean(), visitCount: fc.nat() }),
);

// Feature: organization-registration-review, Property 16 (scoped to what Task 13 builds):
// Screen content shown for a Pending/Rejected lgu user is a pure function of
// Registration_Status, independent of any prior-screen-history.
// **Validates: Requirements 11.2, 13.1** (the Pending/Rejected halves; the
// Approved->LGU_Dashboard half and full navigation wiring are Property 17 /
// Task 15's responsibility, not re-implemented here)
test('Pending resolves to under-review messaging regardless of prior-screen-history', () => {
  fc.assert(
    fc.property(pendingRegistrationArbitrary, priorHistoryArbitrary, (registration) => {
      const message = resolveApplicationReviewMessage(registration);
      assert.deepEqual(message, { kind: 'under-review' });
    }),
    { numRuns: 100 },
  );
});

test('Rejected-with-reason resolves to the exact recorded reason and a resubmit option, regardless of prior-screen-history', () => {
  fc.assert(
    fc.property(rejectedWithReasonArbitrary, priorHistoryArbitrary, (registration) => {
      const message = resolveApplicationReviewMessage(registration);
      assert.equal(message?.kind, 'rejected');
      assert.equal(message?.reason, registration.rejectionReason.trim());
      assert.equal(shouldShowResubmitOption(registration.status), true);
    }),
    { numRuns: 100 },
  );
});

// Feature: organization-registration-review, Property 19: Resubmit option visibility is a pure function of status being Rejected
// **Validates: Requirements 15.1, 15.2**
test('resubmit option visibility is true only when status is Rejected', () => {
  fc.assert(
    fc.property(fc.constantFrom('Pending', 'Approved', 'Rejected'), (status) => {
      assert.equal(shouldShowResubmitOption(status), status === 'Rejected');
    }),
    { numRuns: 100 },
  );
});

// Task 13.6 (Requirement 11.3): if the under-review/rejected messaging cannot
// be resolved, the generic error state must render instead. A `Pending`
// registration always resolves (no failure mode exists for it), so the
// failure condition is simulated via: no registration data at all, and a
// `Rejected` registration missing its recorded reason (which would violate
// the "Rejected always has a reason" invariant and must never be presented
// as resolved).
test('messaging cannot be resolved (and the generic error state must show instead) when there is no registration data', () => {
  assert.equal(resolveApplicationReviewMessage(null), null);
  assert.equal(resolveApplicationReviewMessage(undefined), null);
  assert.equal(shouldShowGenericErrorState(null), true);
  assert.equal(shouldShowGenericErrorState(undefined), true);
});

test('messaging cannot be resolved for a Rejected registration with a blank/missing reason', () => {
  fc.assert(
    fc.property(rejectedWithoutReasonArbitrary, (registration) => {
      assert.equal(resolveApplicationReviewMessage(registration), null);
      assert.equal(shouldShowGenericErrorState(registration), true);
    }),
    { numRuns: 100 },
  );
});

test('an Approved registration is never resolved by this screen (RootLayoutNav routes it to the LGU_Dashboard instead)', () => {
  fc.assert(
    fc.property(approvedRegistrationArbitrary, (registration) => {
      assert.equal(resolveApplicationReviewMessage(registration), null);
    }),
    { numRuns: 100 },
  );
});

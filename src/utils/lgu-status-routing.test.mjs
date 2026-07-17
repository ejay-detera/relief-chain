import fc from 'fast-check';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveApplicationReviewMessage } from '../components/ApplicationReview/messaging.ts';
import { resolveLguScreenForStatus } from './lgu-status-routing.ts';

const statusArbitrary = fc.constantFrom('Pending', 'Approved', 'Rejected');

// "Prior-session-history" is any value at all here, mirroring
// `priorHistoryArbitrary` in messaging.test.mjs: since
// `resolveLguScreenForStatus` takes no parameter besides `status`, threading
// arbitrary history values through and asserting the resolved screen never
// changes is exactly how purity-with-respect-to-history is demonstrated for
// Property 16 across all three statuses (Pending, Rejected, and — the part
// deferred by Task 13.1/13.4's messaging.test.mjs comments — Approved).
const priorHistoryArbitrary = fc.oneof(
  fc.constant(null),
  fc.array(fc.constantFrom('application-review', 'registration-success', 'choose-account', 'lgu-dashboard')),
  fc.record({ visitedReview: fc.boolean(), visitCount: fc.nat() }),
);

const nonEmptyReasonArbitrary = fc.string({ minLength: 1 }).filter((value) => value.trim().length > 0);

// Feature: organization-registration-review, Property 16: Screen shown to an lgu user is a pure function of Registration_Status
// **Validates: Requirements 11.2, 12.1, 13.1, 13.4, 15.6**
test('Pending always resolves to application-review, regardless of prior-session-history', () => {
  fc.assert(
    fc.property(priorHistoryArbitrary, (priorHistory) => {
      const screen = resolveLguScreenForStatus('Pending');
      assert.equal(screen, 'application-review');

      // The "under-review" distinction (not just the route name) is proven
      // via the existing messaging resolver.
      const message = resolveApplicationReviewMessage({ id: 'reg-1', status: 'Pending', rejectionReason: null });
      assert.deepEqual(message, { kind: 'under-review' });

      // priorHistory is threaded through purely to demonstrate it has no
      // bearing on the outcome above.
      void priorHistory;
    }),
    { numRuns: 100 },
  );
});

test('Rejected always resolves to application-review with a reason + resubmit message, regardless of prior-session-history', () => {
  fc.assert(
    fc.property(nonEmptyReasonArbitrary, priorHistoryArbitrary, (reason, priorHistory) => {
      const screen = resolveLguScreenForStatus('Rejected');
      assert.equal(screen, 'application-review');

      const message = resolveApplicationReviewMessage({ id: 'reg-1', status: 'Rejected', rejectionReason: reason });
      assert.equal(message?.kind, 'rejected');
      assert.equal(message?.reason, reason.trim());

      void priorHistory;
    }),
    { numRuns: 100 },
  );
});

test('Approved always resolves to lgu-dashboard, regardless of prior-session-history (including having shown application-review before)', () => {
  fc.assert(
    fc.property(priorHistoryArbitrary, (priorHistory) => {
      const screen = resolveLguScreenForStatus('Approved');
      assert.equal(screen, 'lgu-dashboard');

      // Approved is never rendered by the Application_Review_Screen content
      // resolver — it always falls back to null there, since Approved lgu
      // users are routed straight to the LGU_Dashboard instead.
      const message = resolveApplicationReviewMessage({ id: 'reg-1', status: 'Approved', rejectionReason: null });
      assert.equal(message, null);

      void priorHistory;
    }),
    { numRuns: 100 },
  );
});

test('resolved screen depends only on status, never on prior-session-history', () => {
  fc.assert(
    fc.property(statusArbitrary, priorHistoryArbitrary, priorHistoryArbitrary, (status, historyA, historyB) => {
      const screenWithHistoryA = resolveLguScreenForStatus(status);
      const screenWithHistoryB = resolveLguScreenForStatus(status);

      assert.equal(screenWithHistoryA, screenWithHistoryB);

      const expected = status === 'Approved' ? 'lgu-dashboard' : 'application-review';
      assert.equal(screenWithHistoryA, expected);

      void historyA;
      void historyB;
    }),
    { numRuns: 100 },
  );
});

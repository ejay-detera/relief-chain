import fc from 'fast-check';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getLguNavigationDecision } from './lgu-navigation-guard.ts';

const pendingOrRejectedArbitrary = fc.constantFrom('Pending', 'Rejected');

// Any route the app could be navigated to via a direct URL, a menu tap, or a
// deep link, expressed as the [group, route] segments `useSegments()` would
// produce. Deliberately includes the LGU_Dashboard's own group/routes, other
// role groups, the auth group's other screens, and the
// Application_Review_Screen itself.
const routeTowardLguDashboardArbitrary = fc.oneof(
  // Direct navigation straight into the (lgu) group, at any depth.
  fc.record({ group: fc.constant('(lgu)'), route: fc.constantFrom(undefined, 'index', 'programs', 'beneficiaries', 'settings', 'explore', 'edit-profile', 'pay-scan') }),
  // Deep link / menu navigation into another role's group (should still
  // never land the user on the LGU_Dashboard, but must still be blocked
  // from anywhere other than the review screen).
  fc.record({ group: fc.constant('(beneficiary)'), route: fc.constantFrom(undefined, 'index') }),
  fc.record({ group: fc.constant('(merchant)'), route: fc.constantFrom(undefined, 'index') }),
  // Any other (auth) screen reached directly, other than application-review.
  fc.record({ group: fc.constant('(auth)'), route: fc.constantFrom('choose-account', 'sign-in', 'registration-success', undefined) }),
  // No segments at all (app cold start / root path).
  fc.constant({ group: undefined, route: undefined }),
);

const applicationReviewSegments = { group: '(auth)', route: 'application-review' };

// Feature: organization-registration-review, Property 17: Navigation guard blocks the LGU_Dashboard for Pending and Rejected accounts via any route
// **Validates: Requirements 12.2, 13.3**
test('every attempted navigation path toward the LGU_Dashboard is blocked for Pending/Rejected lgu users, redirecting to the Application_Review_Screen', () => {
  fc.assert(
    fc.property(pendingOrRejectedArbitrary, routeTowardLguDashboardArbitrary, (status, segments) => {
      const decision = getLguNavigationDecision(status, segments);

      // Blocked: the guard always redirects (never lets the navigation
      // through) away from every one of these routes.
      assert.equal(decision, 'redirect-to-review');
    }),
    { numRuns: 100 },
  );
});

test('a Pending/Rejected lgu user already on the Application_Review_Screen stays there (no redirect loop)', () => {
  fc.assert(
    fc.property(pendingOrRejectedArbitrary, (status) => {
      const decision = getLguNavigationDecision(status, applicationReviewSegments);
      assert.equal(decision, 'stay');
    }),
    { numRuns: 100 },
  );
});

// Sanity check on the other side of Property 16/17: an Approved lgu user is
// never blocked from the LGU_Dashboard by this guard, including when the
// Application_Review_Screen was shown earlier in the session (Requirement 13.4).
test('an Approved lgu user is never redirected away from the (lgu) group by this guard', () => {
  fc.assert(
    fc.property(
      fc.record({ group: fc.constant('(lgu)'), route: fc.constantFrom(undefined, 'index', 'programs', 'settings') }),
      (segments) => {
        const decision = getLguNavigationDecision('Approved', segments);
        assert.equal(decision, 'stay');
      },
    ),
    { numRuns: 100 },
  );
});

test('an Approved lgu user still on the (auth) group (Application_Review_Screen shown earlier this session) is redirected to the LGU_Dashboard', () => {
  fc.assert(
    fc.property(
      fc.record({ group: fc.constant('(auth)'), route: fc.constantFrom('application-review', 'choose-account', undefined) }),
      (segments) => {
        const decision = getLguNavigationDecision('Approved', segments);
        assert.equal(decision, 'redirect-to-dashboard');
      },
    ),
    { numRuns: 100 },
  );
});

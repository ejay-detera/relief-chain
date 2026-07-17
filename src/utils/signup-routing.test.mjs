import fc from 'fast-check';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getPostSignUpDestination, getPostSignUpRoutingDecision } from './signup-routing.ts';

const lguRoleArbitrary = fc.constant('lgu');
const otpRoleArbitrary = fc.constantFrom('beneficiary', 'merchant');

// A "valid sign-up submission" is represented here as whether Supabase's
// signUp call happened to return a session, which is the only input the
// routing decision depends on for beneficiary/merchant. For lgu, the account
// is always created pre-confirmed (via the lgu-signup Edge Function) so a
// session is always established before this decision runs, but the property
// asserts the decision is 'registration-success' regardless of what
// hasSession is passed, proving OTP can never be required for lgu.
const hasSessionArbitrary = fc.boolean();

// Feature: organization-registration-review, Property 12: LGU sign-up never requires OTP confirmation
// **Validates: Requirements 9.1**
test('lgu sign-up always resolves to registration-success, never verify-email', () => {
  fc.assert(
    fc.property(lguRoleArbitrary, hasSessionArbitrary, (role, hasSession) => {
      const decision = getPostSignUpRoutingDecision(role, hasSession);
      assert.equal(decision, 'registration-success');
      assert.notEqual(decision, 'verify-email');
    }),
    { numRuns: 100 },
  );
});

// Feature: organization-registration-review, Property 13: Beneficiary/merchant sign-up still requires OTP confirmation
// **Validates: Requirements 9.2**
test('beneficiary/merchant sign-up still requires OTP confirmation before a session is established', () => {
  fc.assert(
    fc.property(otpRoleArbitrary, hasSessionArbitrary, (role, hasSession) => {
      const decision = getPostSignUpRoutingDecision(role, hasSession);
      // Unchanged behavior: routing is a direct function of whether Supabase
      // signUp returned a session. No session means OTP is still required.
      assert.equal(decision, hasSession ? 'registration-success' : 'verify-email');
    }),
    { numRuns: 100 },
  );
});


// A "valid lgu sign-up submission" is represented here as whether Supabase's
// signUp/sign-in call happened to return a session, mirroring
// hasSessionArbitrary above. Since lgu sign-up always establishes a session
// (Property 12), the property below asserts the destination is
// 'application-review' regardless of what hasSession is passed, proving the
// screen can never be 'registration-success' (the retired screen) or
// 'verify-email' for this role.
// Feature: organization-registration-review, Property 15: Successful organization sign-up routes to the Application_Review_Screen
// **Validates: Requirements 11.1**
test('lgu sign-up always resolves to application-review, never registration-success or verify-email', () => {
  fc.assert(
    fc.property(lguRoleArbitrary, hasSessionArbitrary, (role, hasSession) => {
      const destination = getPostSignUpDestination(role, hasSession);
      assert.equal(destination, 'application-review');
      assert.notEqual(destination, 'registration-success');
      assert.notEqual(destination, 'verify-email');
    }),
    { numRuns: 100 },
  );
});

// beneficiary/merchant sign-up destination is unmodified by Task 14: it
// still resolves to whichever screen getPostSignUpRoutingDecision returns.
test('beneficiary/merchant post-sign-up destination is unchanged by the lgu-only application-review routing', () => {
  fc.assert(
    fc.property(otpRoleArbitrary, hasSessionArbitrary, (role, hasSession) => {
      const destination = getPostSignUpDestination(role, hasSession);
      assert.equal(destination, hasSession ? 'registration-success' : 'verify-email');
    }),
    { numRuns: 100 },
  );
});

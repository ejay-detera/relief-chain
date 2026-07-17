import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { fetchProfileWithRegistration, shouldShowProfileAccessError } from './auth-profile.ts';

const lguProfile = {
  id: 'user-1',
  role: 'lgu',
  full_name: 'Test LGU',
  gov_id: null,
  location: null,
  stellar_pubkey: null,
  created_at: null,
};

const beneficiaryProfile = {
  id: 'user-2',
  role: 'beneficiary',
  full_name: 'Test Beneficiary',
  gov_id: null,
  location: null,
  stellar_pubkey: null,
  created_at: null,
};

// AuthContext's `fetchProfile` awaits `fetchProfileWithRegistration` inside
// the same try/catch that already sets `profileError` on a base-profile
// fetch failure. Since this composition throws exactly the same way a
// base-profile fetch failure does, a `registrations` query error surfaces
// through that existing "Profile unavailable" path rather than a new,
// ambiguous state (Requirements 12.1, 13.1).
test('a registrations fetch failure for an lgu user propagates like a profile fetch failure', async () => {
  const registrationError = new Error('registrations query failed');
  const fetchers = {
    fetchBaseProfile: async () => lguProfile,
    fetchOwnRegistration: async () => {
      throw registrationError;
    },
  };

  await assert.rejects(
    () => fetchProfileWithRegistration('user-1', fetchers),
    (error) => error === registrationError,
  );
});

test('a successful registrations fetch for an lgu user is attached to profile.registration', async () => {
  const registration = { id: 'reg-1', status: 'Pending', rejectionReason: null };
  const fetchers = {
    fetchBaseProfile: async () => lguProfile,
    fetchOwnRegistration: async () => registration,
  };

  const result = await fetchProfileWithRegistration('user-1', fetchers);
  assert.deepEqual(result, { ...lguProfile, registration });
});

// Additive: non-lgu roles must not be affected by this change, and must not
// even trigger a registrations query.
test('non-lgu roles skip the registrations fetch entirely', async () => {
  let called = false;
  const fetchers = {
    fetchBaseProfile: async () => beneficiaryProfile,
    fetchOwnRegistration: async () => {
      called = true;
      return null;
    },
  };

  const result = await fetchProfileWithRegistration('user-2', fetchers);
  assert.equal(called, false);
  assert.deepEqual(result, beneficiaryProfile);
});

// A legitimate "no row yet" case (fetchOwnRegistration resolving null, not
// throwing) must not be treated as a fetch failure.
test('a legitimate missing registration row does not throw or set an error state', async () => {
  const fetchers = {
    fetchBaseProfile: async () => lguProfile,
    fetchOwnRegistration: async () => null,
  };

  const result = await fetchProfileWithRegistration('user-1', fetchers);
  assert.deepEqual(result, { ...lguProfile, registration: null });
});

// Task 12.2 (Requirements 12.1, 13.1): a `registrations` row fetch failure
// after session establishment must show the existing "Profile unavailable"
// screen (ProfileAccessError, which unconditionally renders a LogoutButton
// per src/components/AuthSession/ProfileAccessError.tsx) rather than an
// ambiguous state. This composes the full observable chain: the
// registrations-fetch error propagates out of fetchProfileWithRegistration
// the same way a base-profile fetch failure would, AuthContext's
// try/catch (mirrored here) turns that into a non-null profileError, and
// _layout.tsx's render predicate (extracted as shouldShowProfileAccessError,
// and wired into RootLayoutNav in place of the inline `session &&
// profileError` check) then evaluates to true given an established session.
test('a registrations fetch failure for an lgu user results in the Profile-unavailable screen being shown', async () => {
  const registrationError = new Error('registrations query failed');
  const fetchers = {
    fetchBaseProfile: async () => lguProfile,
    fetchOwnRegistration: async () => {
      throw registrationError;
    },
  };

  // Mirrors AuthContext's applySession try/catch: fetchProfile is awaited,
  // and any thrown error is caught and turned into profileError.
  const session = { user: { id: 'user-1' } };
  let profileError = null;
  try {
    await fetchProfileWithRegistration(session.user.id, fetchers);
  } catch (error) {
    profileError = error instanceof Error ? error : new Error('Unable to load the authenticated user profile.');
  }

  assert.equal(profileError, registrationError);
  assert.equal(shouldShowProfileAccessError(session, profileError), true);
});

test('shouldShowProfileAccessError requires both a session and a profileError', () => {
  assert.equal(shouldShowProfileAccessError(null, new Error('x')), false);
  assert.equal(shouldShowProfileAccessError({ user: { id: 'user-1' } }, null), false);
  assert.equal(shouldShowProfileAccessError(null, null), false);
  assert.equal(shouldShowProfileAccessError({ user: { id: 'user-1' } }, new Error('x')), true);
});

// There is no React Native renderer set up in this repo, so this asserts,
// at the source level, that the "Profile unavailable" screen shown by
// shouldShowProfileAccessError === true (ProfileAccessError) unconditionally
// includes the sign-out affordance (LogoutButton), confirming the "with
// sign-out" half of this task's acceptance criteria.
test('ProfileAccessError (the screen shown on a registrations-fetch failure) unconditionally renders LogoutButton', () => {
  const profileAccessErrorPath = fileURLToPath(
    new URL('../components/AuthSession/ProfileAccessError.tsx', import.meta.url),
  );
  const source = readFileSync(profileAccessErrorPath, 'utf8');

  assert.match(source, /import\s*\{\s*LogoutButton\s*\}\s*from\s*'@\/components\/shared\/LogoutButton'/);
  assert.match(source, /<LogoutButton\s*\/>/);
});

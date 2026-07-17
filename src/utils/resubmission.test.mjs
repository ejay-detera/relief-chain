import assert from 'node:assert/strict';
import { test } from 'node:test';

import { submitResubmission } from './resubmission.ts';

const editedData = {
  organizationName: 'Updated Org',
  organizationType: 'NGO',
  regionProvinceCity: 'Manila',
  firstName: 'Jane',
  lastName: 'Doe',
  middleInitial: 'Q',
  position: 'Director',
};

// Task 16.2 (Requirement 15.2): if the Registration's status is no longer
// `Rejected` when resubmission is attempted (e.g. it was concurrently
// Approved, or is already Pending), the error must be surfaced and the
// screen must reflect the actual current status rather than a stale
// Rejected state. `resubmitRegistration`'s `.eq('status', 'Rejected')`
// guard means a concurrent decision surfaces as either a thrown Supabase
// error or (per PostgREST's default "no rows matched an update" behavior)
// simply resolving without updating any row; either way this orchestration
// must always refresh the profile so the UI observes the real status.
test('a concurrent-decision failure (status no longer Rejected) surfaces the error and refreshes to the current status', async () => {
  const concurrentDecisionError = new Error('Registration is no longer Rejected');
  let refreshCount = 0;

  const deps = {
    resubmitRegistration: async () => {
      throw concurrentDecisionError;
    },
    refreshProfile: async () => {
      refreshCount += 1;
    },
  };

  const outcome = await submitResubmission('reg-1', editedData, deps);

  assert.deepEqual(outcome, { kind: 'error', message: concurrentDecisionError.message });
  assert.equal(refreshCount, 1, 'refreshProfile must run so the screen reflects the actual current status, not a stale Rejected state');
});

test('a successful resubmission refreshes the profile and reports success', async () => {
  let refreshCount = 0;
  let resubmitCalledWith = null;

  const deps = {
    resubmitRegistration: async (registrationId, data) => {
      resubmitCalledWith = { registrationId, data };
    },
    refreshProfile: async () => {
      refreshCount += 1;
    },
  };

  const outcome = await submitResubmission('reg-1', editedData, deps);

  assert.deepEqual(outcome, { kind: 'success' });
  assert.equal(refreshCount, 1);
  assert.deepEqual(resubmitCalledWith, { registrationId: 'reg-1', data: editedData });
});

// If refreshing after a failure itself fails (e.g. the network drops), the
// original resubmission error must still be the one surfaced — the screen
// should not crash or lose the reason the resubmission failed.
test('a refresh failure after a resubmission failure does not mask the original error', async () => {
  const concurrentDecisionError = new Error('Registration is no longer Rejected');

  const deps = {
    resubmitRegistration: async () => {
      throw concurrentDecisionError;
    },
    refreshProfile: async () => {
      throw new Error('network dropped');
    },
  };

  const outcome = await submitResubmission('reg-1', editedData, deps);

  assert.deepEqual(outcome, { kind: 'error', message: concurrentDecisionError.message });
});

// A non-Error rejection (e.g. a raw Supabase error object without a
// `message` string of the right shape) still resolves to a usable,
// user-facing message rather than throwing out of the orchestrator.
test('a non-Error rejection still resolves to a generic user-facing message', async () => {
  const deps = {
    resubmitRegistration: async () => {
      throw { code: 'PGRST116' };
    },
    refreshProfile: async () => undefined,
  };

  const outcome = await submitResubmission('reg-1', editedData, deps);

  assert.deepEqual(outcome, { kind: 'error', message: 'Please try again.' });
});

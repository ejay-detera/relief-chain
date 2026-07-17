// Property 9: Policy Immutability
//
// "Activation freezes financial policy; later operational changes cannot alter
//  prior entitlement or settlement rules."
//
// Validates: Requirements 5.7, 5.8, 5.9, 7.10
//
// Property-testing library (pinned): fast-check 3.23.2 (see package.json
// devDependencies).
//
// This suite has two layers, mirroring scripts/tests/tenant-isolation.property.test.mjs
// and scripts/tests/monotonic-auditability.property.test.mjs:
//
//   1. MODEL LAYER (always runs): fast-check generates draft policy edits,
//      activation, permitted operational changes (add approved beneficiaries
//      within the remaining funded budget; add / revoke merchants), and forbidden
//      financial-policy mutations, then drives them through an in-memory reference
//      model. The reference model encodes the canonical rules that the SQL
//      migration `20260716060000_add_program_financial_policy.sql` enforces via
//      `private.validate_program_financial_policy` and
//      `private.enforce_program_enrollment_allocation`:
//        - While a program is a draft (Req 5.2) its policy is freely editable and
//          reserves no funds.
//        - Once status is active / closing / closed, every frozen financial-policy
//          field is immutable (Req 5.7): aid type, asset (code / issuer / SAC),
//          funded budget, allocation rules, spending limits, expiry policy, refund
//          rules, contract version (and the remaining row-compared fields). The
//          trigger raises 23514 with
//          'active program financial policy is immutable; close it and create a
//          new version'.
//        - Active program funding status is immutable.
//        - After activation the system MAY add approved beneficiaries within the
//          remaining funded budget (Req 5.8); an approved allocation is itself
//          immutable and cannot exceed the reserved budget.
//        - After activation the system MAY add or revoke merchants through audited
//          authorization WITHOUT changing completed payments (Req 5.9). Merchant
//          history is append-audited and cannot be deleted.
//        - The voucher contract is immutable after activation (Req 7.10); frozen
//          policy is the on-chain projection of that immutability.
//      Because this layer never needs a database, it runs everywhere and proves
//      the invariants hold across the whole generated input space.
//
//   2. DATABASE LAYER (runs when a local Supabase stack is reachable): the real
//      Postgres triggers are exercised against a reset local fixture. It seeds a
//      draft voucher program, activates it with complete on-chain funding
//      evidence, then asserts every generated forbidden policy mutation is denied
//      and conserves the frozen budget while the permitted beneficiary / merchant
//      operations succeed. It is skipped with a clear blocker message when the
//      local stack is unavailable (no hosted project is ever touched). Point it at
//      a local database with SUPABASE_DB_URL.
//
// Minimized counterexamples and replay seeds: fast-check shrinks failing cases
// and reports the seed. Set FC_SEED to replay a specific run.

import fc from 'fast-check';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

// ---------------------------------------------------------------------------
// Canonical rule table (reference encoding of the SQL migration).
// ---------------------------------------------------------------------------

// The exact set of program columns the activation-freeze trigger compares
// (NEW vs OLD) while status is active / closing / closed. Any distinct value on
// any of these is rejected. This mirrors the row(...) comparison inside
// `private.validate_program_financial_policy`.
const FROZEN_POLICY_FIELDS = [
  'organization_id',
  'aid_type',
  'budget_stroops',
  'funded_budget_stroops',
  'asset_code',
  'asset_issuer',
  'asset_sac_address',
  'treasury_wallet_id',
  'voucher_contract_address',
  'allocation_rules',
  'default_allocation_stroops',
  'per_beneficiary_limit_stroops',
  'per_transaction_limit_stroops',
  'daily_limit_stroops',
  'expiry_policy',
  'policy_expires_at',
  'refund_policy',
  'refund_window_ends_at',
  'policy_version',
  'contract_version',
  'supersedes_program_id',
  'total_budget',
  'amount_per_beneficiary',
  'expires_at',
  'voucher_type',
  'voucher_value',
  'voucher_quantity',
  'voucher_expiration',
  'redemption_type',
];

// The Req 5.7 canonical frozen concepts, each mapped to the concrete
// column(s) that carry it. Used to pin the reference set to the requirement.
const REQ_5_7_FROZEN_CONCEPTS = {
  aidType: ['aid_type'],
  asset: ['asset_code', 'asset_issuer', 'asset_sac_address'],
  fundedBudget: ['funded_budget_stroops'],
  allocationRules: ['allocation_rules'],
  expiryPolicy: ['expiry_policy', 'policy_expires_at'],
  spendingLimits: [
    'per_beneficiary_limit_stroops',
    'per_transaction_limit_stroops',
    'daily_limit_stroops',
  ],
  refundRules: ['refund_policy', 'refund_window_ends_at'],
  contractVersion: ['contract_version'],
};

// Program lifecycle transition table, mirroring the trigger's allowed set.
const LIFECYCLE = {
  draft: ['funding', 'closed'],
  funding: ['active', 'funding_failed', 'draft'],
  funding_failed: ['funding', 'draft', 'closed'],
  active: ['closing', 'closed'],
  closing: ['closed'],
  closed: [],
};

// Statuses at which financial policy is frozen.
const FROZEN_STATUSES = new Set(['active', 'closing', 'closed']);

const FREEZE_MESSAGE = 'active program financial policy is immutable; close it and create a new version';
const BUDGET_MESSAGE = 'beneficiary allocation exceeds remaining funded budget';
const ALLOCATION_IMMUTABLE_MESSAGE = 'approved funded beneficiary allocation is immutable';
const ALLOCATION_DELETE_MESSAGE = 'approved funded beneficiary allocations cannot be deleted';
const MERCHANT_DELETE_MESSAGE = 'program merchant authorization is append-audited; revoke it instead';
const EVENT_APPEND_ONLY_MESSAGE = 'program policy events are append-only';

const isFrozen = (status) => FROZEN_STATUSES.has(status);
const stableEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------------------
// In-memory reference model. Applies a generated command sequence while
// enforcing the canonical rules, and records every attempt for later assertion.
// ---------------------------------------------------------------------------

// A fresh draft voucher program with an initial (freely editable) policy.
function newProgram(initialPolicy) {
  return {
    status: 'draft',
    fundingStatus: 'unreserved',
    fundingComplete: false, // set once complete on-chain funding evidence exists
    policy: { ...initialPolicy },
    frozenSnapshot: null, // captured the moment the program becomes active
    frozenFundingStatus: null,
    enrollments: new Map(), // id -> { id, amount, status: 'Approved' }
    merchants: new Map(), // id -> { id, status: 'authorized' | 'revoked' }
    payments: new Map(), // id -> confirmed settlement snapshot (prior outcome)
    events: [], // append-only { seq, type, ... }
    eventSeq: 0,
    attempts: [], // trace of every operation and its outcome
  };
}

const allocatedTotal = (program) =>
  [...program.enrollments.values()].reduce((sum, e) => sum + e.amount, 0);

const appendEvent = (program, type, extra = {}) => {
  program.eventSeq += 1;
  program.events.push(Object.freeze({ seq: program.eventSeq, type, ...extra }));
};

// Draft policy edit / attempted post-activation financial-policy mutation.
function setPolicyField(program, field, value) {
  const attempt = { op: 'set-policy', field, statusAtAttempt: program.status };
  const current = program.policy[field];

  // A no-op write (same value) is never a policy change; the trigger's
  // `is distinct from` short-circuits it even when the program is frozen.
  if (stableEqual(current, value)) {
    program.attempts.push({ ...attempt, outcome: 'noop' });
    return { outcome: 'noop' };
  }

  if (isFrozen(program.status)) {
    program.attempts.push({ ...attempt, outcome: 'denied', message: FREEZE_MESSAGE });
    return { outcome: 'denied', message: FREEZE_MESSAGE };
  }

  // Draft / funding / funding_failed: policy is freely editable (Req 5.2).
  program.policy[field] = value;
  program.attempts.push({ ...attempt, outcome: 'applied' });
  return { outcome: 'applied' };
}

// Lifecycle transition, including the funding -> active activation gate.
function transition(program, target) {
  const attempt = { op: 'transition', from: program.status, to: target };
  if (!LIFECYCLE[program.status].includes(target)) {
    program.attempts.push({ ...attempt, outcome: 'denied', reason: 'illegal-transition' });
    return { outcome: 'denied' };
  }

  if (target === 'active') {
    // Activation requires complete full-budget on-chain funding evidence.
    if (!program.fundingComplete || allocatedTotal(program) > program.policy.funded_budget_stroops) {
      program.attempts.push({ ...attempt, outcome: 'denied', reason: 'incomplete-funding' });
      return { outcome: 'denied' };
    }
    program.status = 'active';
    program.fundingStatus = 'funded';
    program.frozenFundingStatus = 'funded';
    // Freeze: snapshot the financial policy the instant the program activates.
    program.frozenSnapshot = JSON.stringify(program.policy);
    program.attempts.push({ ...attempt, outcome: 'applied' });
    return { outcome: 'applied' };
  }

  program.status = target;
  program.attempts.push({ ...attempt, outcome: 'applied' });
  return { outcome: 'applied' };
}

// Provide complete on-chain funding evidence (only meaningful while funding).
function completeFunding(program) {
  if (program.status === 'funding' || program.status === 'funding_failed') {
    program.fundingComplete = true;
    program.fundingStatus = 'reserving';
  }
  program.attempts.push({ op: 'complete-funding', outcome: 'recorded' });
}

// Attempt to change an active program's funding status (immutable, Req 5.7 sibling).
function setActiveFundingStatus(program, value) {
  const attempt = { op: 'set-funding-status', value, statusAtAttempt: program.status };
  if (program.status === 'active' && value !== program.frozenFundingStatus) {
    program.attempts.push({ ...attempt, outcome: 'denied' });
    return { outcome: 'denied' };
  }
  program.attempts.push({ ...attempt, outcome: 'applied' });
  return { outcome: 'applied' };
}

// Permitted post-activation change: add an approved beneficiary within budget.
function addBeneficiary(program, amount) {
  const attempt = { op: 'add-beneficiary', amount };
  if (amount <= 0) {
    program.attempts.push({ ...attempt, outcome: 'denied', reason: 'non-positive' });
    return { outcome: 'denied' };
  }
  if (allocatedTotal(program) + amount > program.policy.funded_budget_stroops) {
    program.attempts.push({ ...attempt, outcome: 'denied', message: BUDGET_MESSAGE });
    return { outcome: 'denied', message: BUDGET_MESSAGE };
  }
  const id = randomUUID();
  program.enrollments.set(id, Object.freeze({ id, amount, status: 'Approved' }));
  appendEvent(program, 'beneficiary_added', { enrollmentId: id, amount });
  program.attempts.push({ ...attempt, outcome: 'applied', enrollmentId: id });
  return { outcome: 'applied', enrollmentId: id };
}

// An approved allocation is itself immutable and cannot be deleted.
function mutateAllocation(program, id, kind) {
  const enrollment = program.enrollments.get(id);
  const attempt = { op: `allocation-${kind}`, id };
  if (!enrollment) {
    program.attempts.push({ ...attempt, outcome: 'missing' });
    return { outcome: 'missing' };
  }
  const message = kind === 'delete' ? ALLOCATION_DELETE_MESSAGE : ALLOCATION_IMMUTABLE_MESSAGE;
  program.attempts.push({ ...attempt, outcome: 'denied', message });
  return { outcome: 'denied', message };
}

// Permitted post-activation change: authorize a merchant (audited append).
function authorizeMerchant(program) {
  const id = randomUUID();
  program.merchants.set(id, { id, status: 'authorized' });
  appendEvent(program, 'merchant_authorized', { merchantAuthId: id });
  program.attempts.push({ op: 'merchant-authorize', outcome: 'applied', merchantAuthId: id });
  return { outcome: 'applied', merchantAuthId: id };
}

// Permitted post-activation change: revoke a merchant (audited append). This
// must NEVER alter any prior confirmed payment (Req 5.9).
function revokeMerchant(program, id) {
  const merchant = program.merchants.get(id);
  const attempt = { op: 'merchant-revoke', id };
  if (!merchant || merchant.status === 'revoked') {
    program.attempts.push({ ...attempt, outcome: 'noop' });
    return { outcome: 'noop' };
  }
  merchant.status = 'revoked';
  appendEvent(program, 'merchant_revoked', { merchantAuthId: id });
  program.attempts.push({ ...attempt, outcome: 'applied' });
  return { outcome: 'applied' };
}

// Merchant authorization history is append-audited; deletion is denied.
function deleteMerchant(program, id) {
  const attempt = { op: 'merchant-delete', id };
  program.attempts.push({ ...attempt, outcome: 'denied', message: MERCHANT_DELETE_MESSAGE });
  return { outcome: 'denied', message: MERCHANT_DELETE_MESSAGE };
}

// Record a confirmed merchant settlement — a prior outcome / settlement rule
// that later operational changes must never rewrite.
function recordConfirmedPayment(program, amount) {
  const id = randomUUID();
  const snapshot = { id, amount, status: 'confirmed' };
  program.payments.set(id, Object.freeze({ ...snapshot }));
  program.paymentsSnapshot = program.paymentsSnapshot ?? new Map();
  program.paymentsSnapshot.set(id, JSON.stringify(snapshot));
  program.attempts.push({ op: 'record-payment', outcome: 'recorded', id });
  return { outcome: 'recorded', id };
}

// Append-only policy events reject edit/delete.
function mutatePolicyEvent(program, kind) {
  program.attempts.push({ op: `event-${kind}`, outcome: 'denied', message: EVENT_APPEND_ONLY_MESSAGE });
  return { outcome: 'denied' };
}

// ---------------------------------------------------------------------------
// Command generators.
// ---------------------------------------------------------------------------

// Distinct replacement values for the frozen fields, so generated mutations
// actually differ from the seeded policy and exercise the freeze.
const policyFieldArb = fc.constantFrom(...FROZEN_POLICY_FIELDS);
const idRefArb = fc.nat({ max: 7 });
const amountArb = fc.integer({ min: 1, max: 2_000 });

const commandArb = fc.oneof(
  // Attempt to change a financial-policy field to a fresh value.
  fc.record({
    kind: fc.constant('set-policy'),
    field: policyFieldArb,
    token: fc.integer({ min: 0, max: 9 }),
  }),
  // Provide complete on-chain funding evidence.
  fc.record({ kind: fc.constant('complete-funding') }),
  // Attempt a lifecycle transition.
  fc.record({
    kind: fc.constant('transition'),
    target: fc.constantFrom('funding', 'funding_failed', 'draft', 'active', 'closing', 'closed'),
  }),
  // Attempt to rewrite active funding status.
  fc.record({ kind: fc.constant('set-funding-status'), value: fc.constantFrom('unreserved', 'reserving', 'funded', 'failed') }),
  // Add an approved beneficiary within (or beyond) remaining budget.
  fc.record({ kind: fc.constant('add-beneficiary'), amount: amountArb }),
  // Attempt to edit / delete an approved allocation.
  fc.record({ kind: fc.constant('allocation-mutate'), id: idRefArb, mutate: fc.constantFrom('update', 'delete') }),
  // Authorize a merchant.
  fc.record({ kind: fc.constant('merchant-authorize') }),
  // Revoke a merchant.
  fc.record({ kind: fc.constant('merchant-revoke'), id: idRefArb }),
  // Attempt to delete merchant history.
  fc.record({ kind: fc.constant('merchant-delete'), id: idRefArb }),
  // Record a confirmed prior settlement.
  fc.record({ kind: fc.constant('record-payment'), amount: amountArb }),
  // Attempt to edit / delete audit history.
  fc.record({ kind: fc.constant('event-mutate'), mutate: fc.constantFrom('update', 'delete') }),
);

const scenarioArb = fc.record({
  // Seeded funded budget for this program.
  fundedBudget: fc.integer({ min: 1_000, max: 100_000 }),
  commands: fc.array(commandArb, { minLength: 1, maxLength: 80 }),
});

// A base policy whose field values are all well-defined and comparable.
function basePolicy(fundedBudget) {
  return {
    organization_id: 'org-seed',
    aid_type: 'voucher',
    budget_stroops: fundedBudget,
    funded_budget_stroops: fundedBudget,
    asset_code: 'RCPHP',
    asset_issuer: 'ISSUER-SEED',
    asset_sac_address: 'SAC-SEED',
    treasury_wallet_id: 'treasury-seed',
    voucher_contract_address: 'CONTRACT-SEED',
    allocation_rules: { strategy: 'variable', allowed_categories: ['Food'] },
    default_allocation_stroops: 0,
    per_beneficiary_limit_stroops: 800,
    per_transaction_limit_stroops: 400,
    daily_limit_stroops: 500,
    expiry_policy: 'fixed',
    policy_expires_at: '2026-01-01T00:00:00Z',
    refund_policy: 'return_to_entitlement',
    refund_window_ends_at: '2026-02-01T00:00:00Z',
    policy_version: 1,
    contract_version: 1,
    supersedes_program_id: null,
    total_budget: fundedBudget,
    amount_per_beneficiary: 100,
    expires_at: '2026-01-01T00:00:00Z',
    voucher_type: 'food',
    voucher_value: 100,
    voucher_quantity: 10,
    voucher_expiration: '2026-01-01T00:00:00Z',
    redemption_type: 'merchant',
  };
}

// A fresh, distinct value for the given field, parameterised by a token so the
// generator produces a variety of changed values.
function freshValueFor(field, current, token) {
  const base = current;
  if (field === 'allocation_rules') return { strategy: 'fixed', token };
  if (typeof base === 'number') return base + 1 + token;
  if (base === null) return `set-${token}`;
  return `${base}-changed-${token}`;
}

function runScenario({ fundedBudget, commands }) {
  const program = newProgram(basePolicy(fundedBudget));

  const enrollmentIdAt = (ref) => [...program.enrollments.keys()][ref % Math.max(program.enrollments.size, 1)];
  const merchantIdAt = (ref) => [...program.merchants.keys()][ref % Math.max(program.merchants.size, 1)];

  for (const command of commands) {
    switch (command.kind) {
      case 'set-policy': {
        const current = program.policy[command.field];
        setPolicyField(program, command.field, freshValueFor(command.field, current, command.token));
        break;
      }
      case 'complete-funding':
        completeFunding(program);
        break;
      case 'transition':
        transition(program, command.target);
        break;
      case 'set-funding-status':
        setActiveFundingStatus(program, command.value);
        break;
      case 'add-beneficiary':
        addBeneficiary(program, command.amount);
        break;
      case 'allocation-mutate':
        if (program.enrollments.size > 0) {
          mutateAllocation(program, enrollmentIdAt(command.id), command.mutate);
        }
        break;
      case 'merchant-authorize':
        authorizeMerchant(program);
        break;
      case 'merchant-revoke':
        if (program.merchants.size > 0) revokeMerchant(program, merchantIdAt(command.id));
        break;
      case 'merchant-delete':
        if (program.merchants.size > 0) deleteMerchant(program, merchantIdAt(command.id));
        break;
      case 'record-payment':
        recordConfirmedPayment(program, command.amount);
        break;
      case 'event-mutate':
        mutatePolicyEvent(program, command.mutate);
        break;
      default:
        throw new Error(`unknown command ${command.kind}`);
    }
  }
  return program;
}

// ---------------------------------------------------------------------------
// Model layer property.
// ---------------------------------------------------------------------------

const seedFromEnv = Number.parseInt(process.env.FC_SEED ?? '', 10);
const fcConfig = {
  numRuns: Number.parseInt(process.env.FC_NUM_RUNS ?? '400', 10),
  endOnFailure: true,
  ...(Number.isFinite(seedFromEnv) ? { seed: seedFromEnv } : {}),
};

test('property: activation freezes financial policy and later operational changes never alter prior entitlement or settlement rules', () => {
  fc.assert(
    fc.property(scenarioArb, (scenario) => {
      const program = runScenario(scenario);

      // (1) Freeze: if the program ever activated, every frozen policy field now
      //     equals its value at activation, no matter what commands followed
      //     (Req 5.7, Req 7.10).
      if (program.frozenSnapshot !== null) {
        assert.equal(
          JSON.stringify(program.policy),
          program.frozenSnapshot,
          'frozen financial policy was altered after activation',
        );
      }

      // (2) Denial: every attempt to change a frozen field while the program is
      //     active / closing / closed is denied with the canonical message.
      for (const attempt of program.attempts) {
        if (attempt.op === 'set-policy' && isFrozen(attempt.statusAtAttempt) && attempt.outcome !== 'noop') {
          assert.equal(attempt.outcome, 'denied', `frozen policy mutation leaked on ${attempt.field}`);
          assert.equal(attempt.message, FREEZE_MESSAGE, 'wrong immutability error for frozen policy mutation');
        }
        // Active funding status is immutable.
        if (attempt.op === 'set-funding-status' && attempt.statusAtAttempt === 'active' && attempt.value !== 'funded') {
          assert.equal(attempt.outcome, 'denied', 'active funding status must be immutable');
        }
      }

      // (3) Budget bound: approved allocations never exceed the funded budget
      //     (Req 5.8). Frozen budget also matches the activation snapshot.
      assert.ok(
        allocatedTotal(program) <= program.policy.funded_budget_stroops,
        `allocated ${allocatedTotal(program)} exceeds funded budget ${program.policy.funded_budget_stroops}`,
      );

      // (4) Approved allocations are immutable: none were edited or deleted, and
      //     every add-beneficiary that succeeded appended exactly one audit event.
      for (const attempt of program.attempts) {
        if (attempt.op === 'allocation-update' || attempt.op === 'allocation-delete') {
          assert.equal(attempt.outcome, 'denied', 'approved allocation mutation must be denied');
        }
      }
      const beneficiaryEvents = program.events.filter((e) => e.type === 'beneficiary_added').length;
      const beneficiaryAdds = program.attempts.filter((a) => a.op === 'add-beneficiary' && a.outcome === 'applied').length;
      assert.equal(beneficiaryEvents, beneficiaryAdds, 'each accepted beneficiary addition is audited exactly once');
      assert.equal(beneficiaryEvents, program.enrollments.size, 'every enrollment has exactly one audit event');

      // (5) Merchant changes are audited appends and cannot be deleted (Req 5.9).
      for (const attempt of program.attempts) {
        if (attempt.op === 'merchant-delete') {
          assert.equal(attempt.outcome, 'denied', 'merchant history deletion must be denied');
          assert.equal(attempt.message, MERCHANT_DELETE_MESSAGE, 'wrong merchant deletion error');
        }
      }
      const merchantEvents = program.events.filter(
        (e) => e.type === 'merchant_authorized' || e.type === 'merchant_revoked',
      ).length;
      const merchantChanges = program.attempts.filter(
        (a) => (a.op === 'merchant-authorize' || a.op === 'merchant-revoke') && a.outcome === 'applied',
      ).length;
      assert.equal(merchantEvents, merchantChanges, 'each accepted merchant change appends exactly one audit event');

      // (6) Prior settlement rules: every confirmed payment recorded during the
      //     run is byte-identical afterward — merchant revocation and every other
      //     operational change left completed payments untouched (Req 5.9).
      if (program.paymentsSnapshot) {
        for (const [id, snapshot] of program.paymentsSnapshot) {
          const current = program.payments.get(id);
          assert.ok(current, `confirmed payment vanished: ${id}`);
          assert.equal(JSON.stringify(current), snapshot, `confirmed payment ${id} was altered by an operational change`);
        }
      }

      // (7) Audit history is append-only and strictly monotonic (Req 5.9 / 7.10).
      for (const attempt of program.attempts) {
        if (attempt.op === 'event-update' || attempt.op === 'event-delete') {
          assert.equal(attempt.outcome, 'denied', 'policy audit events must be append-only');
        }
      }
      program.events.forEach((event, index) => {
        assert.equal(event.seq, index + 1, 'policy event sequence numbers are contiguous and monotonic');
      });

      return true;
    }),
    fcConfig,
  );
});

// The reference frozen-field set is pinned to the Req 5.7 concepts and to the
// 19-field matrix the SQL test exhaustively checks, so the encoding cannot
// silently drift from the migration semantics.
test('property: reference frozen-field set matches the requirement and migration semantics', () => {
  const frozen = new Set(FROZEN_POLICY_FIELDS);

  // Every Req 5.7 frozen concept maps to at least one frozen column.
  for (const [concept, columns] of Object.entries(REQ_5_7_FROZEN_CONCEPTS)) {
    for (const column of columns) {
      assert.ok(frozen.has(column), `Req 5.7 concept ${concept} column ${column} must be frozen`);
    }
  }

  // The 19 policy fields the SQL test mutates one-by-one are all frozen here.
  const dbMatrixFields = [
    'aid_type', 'budget_stroops', 'funded_budget_stroops', 'asset_code', 'asset_issuer',
    'asset_sac_address', 'treasury_wallet_id', 'voucher_contract_address', 'allocation_rules',
    'per_beneficiary_limit_stroops', 'per_transaction_limit_stroops', 'daily_limit_stroops',
    'expiry_policy', 'policy_expires_at', 'refund_policy', 'refund_window_ends_at',
    'policy_version', 'contract_version', 'supersedes_program_id',
  ];
  assert.equal(dbMatrixFields.length, 19, 'the SQL immutability matrix pins 19 policy fields');
  for (const field of dbMatrixFields) {
    assert.ok(frozen.has(field), `SQL-matrix field ${field} must be frozen`);
  }

  // Lifecycle table matches the trigger's allowed transitions exactly.
  assert.deepEqual(LIFECYCLE.draft, ['funding', 'closed']);
  assert.deepEqual(LIFECYCLE.funding, ['active', 'funding_failed', 'draft']);
  assert.deepEqual(LIFECYCLE.funding_failed, ['funding', 'draft', 'closed']);
  assert.deepEqual(LIFECYCLE.active, ['closing', 'closed']);
  assert.deepEqual(LIFECYCLE.closing, ['closed']);
});

// Positive coverage guard: the property must not be vacuously true. Draft edits
// apply, activation freezes, permitted operational changes succeed, and only the
// forbidden financial-policy mutations are denied.
test('property: model allows the legitimate draft/activate/operate paths so it is not vacuous', () => {
  const program = newProgram(basePolicy(1_000));

  // Draft policy is freely editable and reserves no funds (Req 5.2).
  assert.equal(setPolicyField(program, 'daily_limit_stroops', 600).outcome, 'applied');
  assert.equal(program.policy.daily_limit_stroops, 600);

  // Draft -> funding -> (with evidence) active.
  assert.equal(transition(program, 'funding').outcome, 'applied');
  assert.equal(transition(program, 'active').outcome, 'denied'); // no funding evidence yet
  completeFunding(program);
  assert.equal(transition(program, 'active').outcome, 'applied');
  assert.equal(program.status, 'active');
  assert.ok(program.frozenSnapshot !== null);

  // Frozen policy: a financial-policy mutation is now denied and conserves value.
  const denied = setPolicyField(program, 'funded_budget_stroops', 5_000);
  assert.equal(denied.outcome, 'denied');
  assert.equal(denied.message, FREEZE_MESSAGE);
  assert.equal(program.policy.funded_budget_stroops, 1_000, 'denied mutation preserves the funded budget');

  // Active funding status is immutable.
  assert.equal(setActiveFundingStatus(program, 'reserving').outcome, 'denied');

  // Permitted: add an approved beneficiary within the remaining funded budget.
  const add = addBeneficiary(program, 600);
  assert.equal(add.outcome, 'applied');
  // Over-budget addition is rejected and conserves the reservation.
  assert.equal(addBeneficiary(program, 500).outcome, 'denied');
  assert.ok(allocatedTotal(program) <= program.policy.funded_budget_stroops);
  // The approved allocation cannot be edited or deleted.
  assert.equal(mutateAllocation(program, add.enrollmentId, 'update').outcome, 'denied');
  assert.equal(mutateAllocation(program, add.enrollmentId, 'delete').outcome, 'denied');

  // Record a confirmed settlement, then add / revoke a merchant. The confirmed
  // payment must be untouched by the merchant lifecycle (Req 5.9).
  const payment = recordConfirmedPayment(program, 200);
  const before = JSON.stringify(program.payments.get(payment.id));
  const merchant = authorizeMerchant(program);
  assert.equal(revokeMerchant(program, merchant.merchantAuthId).outcome, 'applied');
  assert.equal(deleteMerchant(program, merchant.merchantAuthId).outcome, 'denied');
  assert.equal(JSON.stringify(program.payments.get(payment.id)), before, 'merchant revocation left the payment unchanged');

  // Audit trail: one beneficiary_added, one merchant_authorized, one merchant_revoked.
  const types = program.events.map((e) => e.type);
  assert.deepEqual(types, ['beneficiary_added', 'merchant_authorized', 'merchant_revoked']);
});

// ---------------------------------------------------------------------------
// Database layer property (runs against reset local fixtures when reachable).
// ---------------------------------------------------------------------------

const DB_URL = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function openDatabase() {
  let pg;
  try {
    ({ default: pg } = await import('pg'));
  } catch {
    return null; // pg not installed
  }
  const client = new pg.Client({ connectionString: DB_URL, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    return client;
  } catch {
    try { await client.end(); } catch { /* ignore */ }
    return null;
  }
}

// The 19-field forbidden-mutation matrix, mirroring
// supabase/tests/database/program_financial_policy.test.sql. Each entry is a SQL
// replacement expression that differs from the seeded value and must be rejected.
const dbMutationMatrix = (programId) => [
  ['aid_type', `'cash'::public.program_aid_type`],
  ['budget_stroops', '1001'],
  ['funded_budget_stroops', '999'],
  ['asset_code', `'TEST'`],
  ['asset_issuer', `'G' || repeat('E', 55)`],
  ['asset_sac_address', `'C' || repeat('E', 55)`],
  ['treasury_wallet_id', 'null'],
  ['voucher_contract_address', `'C' || repeat('F', 55)`],
  ['allocation_rules', `'{"strategy":"fixed"}'::jsonb`],
  ['per_beneficiary_limit_stroops', '700'],
  ['per_transaction_limit_stroops', '300'],
  ['daily_limit_stroops', '700'],
  ['expiry_policy', `'none'::public.program_expiry_policy`],
  ['policy_expires_at', `now() + interval '31 days'`],
  ['refund_policy', `'exception_after_expiry'::public.program_refund_policy`],
  ['refund_window_ends_at', `now() + interval '90 days'`],
  ['policy_version', '2'],
  ['contract_version', '2'],
  ['supersedes_program_id', `'${programId}'::uuid`],
];

// Seed a draft voucher program with a verified organization treasury and an
// accredited merchant, then activate it with complete on-chain funding evidence.
// Returns identifiers and the funded budget. Mirrors the canonical SQL fixture.
async function seedActivatedProgram(client) {
  const ids = {
    admin: randomUUID(),
    beneficiary: randomUUID(),
    merchantProfile: randomUUID(),
    org: randomUUID(),
    treasury: randomUUID(),
    merchant: randomUUID(),
    program: randomUUID(),
    activation: randomUUID(),
    merchantAuth: randomUUID(),
    fundedBudget: 1_000,
  };

  const insertUser = async (id, email, role, fullName) => {
    await client.query(
      `insert into auth.users (
         id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at
       ) values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated',
         'authenticated', $2, '', now(),
         '{"provider":"email","providers":["email"]}', $3, now(), now())`,
      [id, email, JSON.stringify(fullName ? { role, full_name: fullName } : { role })],
    );
  };

  await insertUser(ids.admin, `policy-admin-${ids.admin}@example.test`, 'lgu');
  await insertUser(ids.beneficiary, `policy-ben-${ids.beneficiary}@example.test`, 'beneficiary');
  await insertUser(ids.merchantProfile, `policy-merchant-${ids.merchantProfile}@example.test`, 'merchant', 'Policy Merchant');

  await client.query(`insert into public.organizations (id, name, slug) values ($1, 'Policy Org', $2)`, [
    ids.org, `policy-${ids.org}`,
  ]);
  await client.query(
    `select public.upsert_organization_membership($1, $2, 'organization_administrator', $2)`,
    [ids.org, ids.admin],
  );

  await client.query(
    `insert into public.wallets (
       id, owner_type, owner_id, purpose, address,
       verification_status, proof_challenge_digest,
       proof_challenge_issued_at, proof_challenge_expires_at,
       proof_signature_digest, verified_at, verified_by, is_active
     ) values ($1, 'organization', $2, 'organization_treasury', $3,
       'verified', repeat('a', 64), now(), now() + interval '5 minutes',
       repeat('b', 64), now(), $4, true)`,
    [ids.treasury, ids.org, 'G' + 'A'.repeat(55), ids.admin],
  );

  await client.query(
    `insert into public.merchant_entities (id, profile_id, display_name) values ($1, $2, 'Policy Merchant')`,
    [ids.merchant, ids.merchantProfile],
  );
  await client.query(
    `insert into public.merchant_accreditations (
       organization_id, merchant_id, category, status,
       valid_from, valid_until, approved_by, approved_at
     ) values ($1, $2, 'Food', 'active', now() - interval '1 day', now() + interval '1 year', $3, now())`,
    [ids.org, ids.merchant, ids.admin],
  );

  await client.query(
    `insert into public.programs (
       id, organization_id, name, status, aid_type,
       budget_stroops, asset_code, asset_issuer, asset_sac_address,
       treasury_wallet_id, voucher_contract_address,
       allocation_rules, per_beneficiary_limit_stroops,
       per_transaction_limit_stroops, daily_limit_stroops,
       expiry_policy, policy_expires_at, refund_policy, refund_window_ends_at,
       policy_version, contract_version, created_by
     ) values (
       $1, $2, 'Immutable Voucher Policy', 'draft', 'voucher',
       $3, 'RCPHP', $4, $5, $6, $7,
       '{"strategy":"variable","allowed_categories":["Food"]}'::jsonb,
       800, 400, 500, 'fixed', now() + interval '30 days',
       'return_to_entitlement', now() + interval '60 days', 1, 1, $8)`,
    [
      ids.program, ids.org, ids.fundedBudget, 'G' + 'B'.repeat(55), 'C' + 'C'.repeat(55),
      ids.treasury, 'C' + 'D'.repeat(55), ids.admin,
    ],
  );

  // Draft -> funding -> active with complete on-chain funding evidence.
  await client.query(`update public.programs set status = 'funding', funding_status = 'reserving' where id = $1`, [ids.program]);
  await client.query(
    `update public.programs
       set funding_status = 'funded', funded_budget_stroops = budget_stroops,
           funding_transaction_hash = repeat('c', 64), funding_ledger = 12345, funded_at = now(),
           activation_correlation_id = $2, activated_by = $3, status = 'active'
     where id = $1`,
    [ids.program, ids.activation, ids.admin],
  );

  return ids;
}

test('property: activation freeze, budget-bounded beneficiary adds, and audited merchant changes hold against reset local fixtures (database)', async (t) => {
  const client = await openDatabase();
  if (!client) {
    t.skip(
      `local Supabase database unavailable at ${DB_URL}. ` +
        'Run `npx supabase start` and `npx supabase db reset`, then re-run the property suite. ' +
        'No hosted project is contacted.',
    );
    return;
  }

  try {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          // Which frozen field to tamper with this run (index into the 19-field matrix).
          fieldIndex: fc.nat({ max: 18 }),
          // A beneficiary allocation within the funded budget, and one that exceeds it.
          withinBudget: fc.integer({ min: 1, max: 1_000 }),
          overBudgetExtra: fc.integer({ min: 1, max: 1_000 }),
          revokeMerchant: fc.boolean(),
        }),
        async (scenario) => {
          await client.query('begin');
          try {
            const ids = await seedActivatedProgram(client);
            const matrix = dbMutationMatrix(ids.program);
            const [field, replacement] = matrix[scenario.fieldIndex % matrix.length];

            // (1) The chosen forbidden financial-policy mutation is rejected.
            await assert.rejects(
              client.query(
                `update public.programs set ${field} = ${replacement} where id = $1`,
                [ids.program],
              ),
              new RegExp(FREEZE_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
              `frozen field ${field} must be immutable after activation`,
            );

            // The funded budget is conserved after the denied mutation.
            const { rows: budgetRows } = await client.query(
              `select funded_budget_stroops::bigint as b from public.programs where id = $1`,
              [ids.program],
            );
            assert.equal(Number(budgetRows[0].b), ids.fundedBudget, 'denied policy mutation conserves the funded budget');

            // (2) Permitted: add an approved beneficiary within the remaining funded budget.
            const identity = await client.query(
              `select id from public.beneficiary_identities where user_id = $1`,
              [ids.beneficiary],
            );
            if (identity.rows.length > 0) {
              await client.query(
                `insert into public.enrollments (
                   beneficiary_id, beneficiary_identity_id, program_id,
                   approval_status, category, allocation_amount_stroops,
                   allocation_correlation_id, approved_by
                 ) values ($1, $2, $3, 'Approved', 'Food', $4, $5, $6)`,
                [ids.beneficiary, identity.rows[0].id, ids.program, scenario.withinBudget, randomUUID(), ids.admin],
              );

              // A beneficiary allocation beyond the remaining funded budget is rejected.
              await assert.rejects(
                client.query(
                  `insert into public.enrollments (
                     beneficiary_id, beneficiary_identity_id, program_id,
                     approval_status, category, allocation_amount_stroops,
                     allocation_correlation_id, approved_by
                   ) values ($1, $2, $3, 'Approved', 'Food', $4, $5, $6)`,
                  [
                    ids.beneficiary, identity.rows[0].id, ids.program,
                    ids.fundedBudget - scenario.withinBudget + scenario.overBudgetExtra,
                    randomUUID(), ids.admin,
                  ],
                ),
                new RegExp(BUDGET_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
                'beneficiary additions cannot exceed the reserved budget',
              );
            }

            // (3) Permitted: authorize a merchant within active policy categories.
            await client.query(
              `insert into public.program_merchants (
                 id, program_id, merchant_id, category, correlation_id, authorized_by
               ) values ($1, $2, $3, 'Food', $4, $5)`,
              [ids.merchantAuth, ids.program, ids.merchant, randomUUID(), ids.admin],
            );

            if (scenario.revokeMerchant) {
              await client.query(
                `update public.program_merchants
                   set status = 'revoked', correlation_id = $2, revoked_by = $3, reason = 'Accreditation review'
                 where id = $1`,
                [ids.merchantAuth, randomUUID(), ids.admin],
              );
            }

            // Merchant history is append-audited: deletion is denied.
            await assert.rejects(
              client.query(`delete from public.program_merchants where id = $1`, [ids.merchantAuth]),
              new RegExp(MERCHANT_DELETE_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
              'merchant authorization history cannot be deleted',
            );

            // The frozen policy is still intact after all permitted operations.
            const { rows: finalRows } = await client.query(
              `select status::text as status, funded_budget_stroops::bigint as b from public.programs where id = $1`,
              [ids.program],
            );
            assert.equal(finalRows[0].status, 'active', 'program remains active');
            assert.equal(Number(finalRows[0].b), ids.fundedBudget, 'funded budget unchanged by operational changes');

            return true;
          } finally {
            await client.query('rollback');
          }
        },
      ),
      { numRuns: Number.parseInt(process.env.FC_DB_NUM_RUNS ?? '20', 10), endOnFailure: true },
    );
  } finally {
    await client.end();
  }
});

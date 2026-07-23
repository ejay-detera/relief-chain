// Task 6.6: environment-aware approval and emergency-control policy tests.
//
// Verifies that testnet permits single-admin authorization while production
// requires maker/checker (non-self-approval) disbursement authorization and
// multi-party (organization + independent) emergency control. Uses the same
// transpile-inject harness as the other shared-module suites: the pure TS module
// is transpiled and imported as a data URL. The only import is a type
// (`OrganizationRole`), which is elided during transpilation, so no dependency
// injection is needed.
//
// Requirements: 2.7, 2.8, 7.12, 20.9, 24.4

import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const transpile = async (source) => {
  const { outputText, diagnostics = [] } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(diagnostics.length, 0);
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
};

const source = await readFile(
  new URL('../../supabase/functions/_shared/approval-policy.ts', import.meta.url),
  'utf8',
);
const policy = await transpile(source);

const maker = (overrides = {}) => ({
  userId: 'user-maker',
  role: 'finance_approver',
  recentStepUp: true,
  ...overrides,
});

const approver = (overrides = {}) => ({
  userId: 'user-checker',
  role: 'finance_approver',
  recentStepUp: true,
  ...overrides,
});

// --- Environment derivation -------------------------------------------------

test('derives testnet from a disabled mainnet flag and production otherwise', () => {
  assert.equal(policy.policyEnvironmentFromMainnet(false), 'testnet');
  assert.equal(policy.policyEnvironmentFromMainnet(true), 'production');
});

// --- Disbursement: testnet single-admin (Req 2.7) ---------------------------

test('testnet permits a single administrator to authorize a disbursement', () => {
  const decision = policy.evaluateDisbursementApproval({
    environment: 'testnet',
    maker: maker({ role: 'organization_administrator' }),
    approvals: [],
  });
  assert.equal(decision.allowed, true);
  assert.deepEqual(decision.reasons, []);
  assert.ok(decision.controls.includes('testnet_single_admin_authorization'));
});

test('testnet denies an authorizer without recent step-up', () => {
  const decision = policy.evaluateDisbursementApproval({
    environment: 'testnet',
    maker: maker({ recentStepUp: false }),
    approvals: [],
  });
  assert.equal(decision.allowed, false);
  assert.deepEqual(decision.reasons, ['approver_missing_step_up']);
});

test('testnet denies a maker holding no authorizer role and no approvals', () => {
  const decision = policy.evaluateDisbursementApproval({
    environment: 'testnet',
    maker: maker({ role: 'beneficiary_verifier' }),
    approvals: [],
  });
  assert.equal(decision.allowed, false);
  assert.deepEqual(decision.reasons, ['no_authorized_approver']);
});

// --- Disbursement: production maker/checker (Req 2.8, 24.4) -----------------

test('production allows a distinct authorized checker with an authorized maker', () => {
  const decision = policy.evaluateDisbursementApproval({
    environment: 'production',
    maker: maker({ role: 'organization_administrator' }),
    approvals: [approver()],
  });
  assert.equal(decision.allowed, true);
  assert.deepEqual(decision.reasons, []);
  assert.ok(decision.controls.includes('production_maker_checker'));
});

test('production rejects single-admin authorization (no distinct checker)', () => {
  const decision = policy.evaluateDisbursementApproval({
    environment: 'production',
    maker: maker(),
    approvals: [],
  });
  assert.equal(decision.allowed, false);
  assert.ok(decision.reasons.includes('checker_required'));
});

test('production prevents self-approval by the maker', () => {
  const decision = policy.evaluateDisbursementApproval({
    environment: 'production',
    maker: maker({ userId: 'shared-user' }),
    approvals: [approver({ userId: 'shared-user' })],
  });
  assert.equal(decision.allowed, false);
  assert.ok(decision.reasons.includes('self_approval_forbidden'));
});

test('production denies a checker without recent step-up', () => {
  const decision = policy.evaluateDisbursementApproval({
    environment: 'production',
    maker: maker(),
    approvals: [approver({ recentStepUp: false })],
  });
  assert.equal(decision.allowed, false);
  assert.ok(decision.reasons.includes('approver_missing_step_up'));
});

test('production denies when the maker lacks an authorizer role', () => {
  const decision = policy.evaluateDisbursementApproval({
    environment: 'production',
    maker: maker({ role: 'program_manager' }),
    approvals: [approver({ userId: 'checker-2' })],
  });
  assert.equal(decision.allowed, false);
  assert.ok(decision.reasons.includes('maker_not_authorized'));
});

// --- Emergency control: testnet single-admin (Req 7.12) ---------------------

test('testnet permits single-admin emergency pause', () => {
  const decision = policy.evaluateEmergencyControl({
    environment: 'testnet',
    operation: 'pause',
    authorizers: [{ userId: 'admin-1', authority: 'organization', recentStepUp: true }],
  });
  assert.equal(decision.allowed, true);
  assert.ok(decision.controls.includes('testnet_single_admin_emergency'));
});

test('testnet denies emergency control with no authorizer', () => {
  const decision = policy.evaluateEmergencyControl({
    environment: 'testnet',
    operation: 'resume',
    authorizers: [],
  });
  assert.equal(decision.allowed, false);
  assert.deepEqual(decision.reasons, ['no_authorizer']);
});

// --- Emergency control: production multi-party (Req 20.9, 24.4) -------------

test('production allows pause with distinct organization and independent authority', () => {
  const decision = policy.evaluateEmergencyControl({
    environment: 'production',
    operation: 'pause',
    authorizers: [
      { userId: 'org-1', authority: 'organization', recentStepUp: true },
      { userId: 'sec-1', authority: 'platform_security', recentStepUp: true },
    ],
  });
  assert.equal(decision.allowed, true);
  assert.ok(decision.controls.includes('production_multi_party_emergency'));
});

test('production rejects single-admin emergency control (missing independent authority)', () => {
  const decision = policy.evaluateEmergencyControl({
    environment: 'production',
    operation: 'pause',
    authorizers: [{ userId: 'org-1', authority: 'organization', recentStepUp: true }],
  });
  assert.equal(decision.allowed, false);
  assert.ok(decision.reasons.includes('independent_authority_required'));
});

test('production requires two distinct parties for the two authorities', () => {
  const decision = policy.evaluateEmergencyControl({
    environment: 'production',
    operation: 'resume',
    authorizers: [
      { userId: 'same-user', authority: 'organization', recentStepUp: true },
      { userId: 'same-user', authority: 'platform_security', recentStepUp: true },
    ],
  });
  assert.equal(decision.allowed, false);
  assert.ok(decision.reasons.includes('independent_parties_required'));
});

test('production emergency denies an authorizer without recent step-up', () => {
  const decision = policy.evaluateEmergencyControl({
    environment: 'production',
    operation: 'pause',
    authorizers: [
      { userId: 'org-1', authority: 'organization', recentStepUp: false },
      { userId: 'sec-1', authority: 'platform_security', recentStepUp: true },
    ],
  });
  assert.equal(decision.allowed, false);
  assert.ok(decision.reasons.includes('authorizer_missing_step_up'));
});

// --- Production-gate prerequisites (Req 24.4) -------------------------------

test('exposes maker/checker and multi-party emergency as production prerequisites', () => {
  const ids = policy.PRODUCTION_APPROVAL_PREREQUISITES.map((p) => p.id);
  assert.ok(ids.includes('maker_checker_disbursement'));
  assert.ok(ids.includes('multi_party_emergency_control'));
});

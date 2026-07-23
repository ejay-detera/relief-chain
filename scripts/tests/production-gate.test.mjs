// Task 15.1: production-gate evidence model and fail-closed evaluator tests.
//
// Verifies that the mainnet production gate stays closed while any prerequisite
// is missing, pending, rejected, stale, or self-approved, and opens only for the
// complete, fresh, independently-approved set. Also covers the pilot mainnet
// hard-disable, the real-PHP redeemability claim guard, and the regulated-partner
// adapter boundary.
//
// Uses the repo's recursive transpile-inject harness: the pure TS module is
// transpiled in-memory and imported as a data: URL, with the runtime relative
// import (approval-policy.ts) resolved recursively. The type-only import of
// StellarTestnetConfig is elided during transpilation.
//
// Requirements: 1.3, 1.6, 2.8, 19.9, 20.9, 24.1, 24.2, 24.3, 24.4, 24.5, 24.6,
//               24.7, 24.8, 24.9

import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const cache = new Map();
const toDataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;

async function loadModule(absPath) {
  if (cache.has(absPath)) return cache.get(absPath);

  const source = await readFile(absPath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });

  const specifierRe = /\bfrom\s*(['"])([^'"]+)\1/g;
  const replacements = new Map();
  let match;
  while ((match = specifierRe.exec(outputText)) !== null) {
    const specifier = match[2];
    if (specifier.startsWith('.') && !replacements.has(specifier)) {
      const childAbs = path.resolve(path.dirname(absPath), specifier);
      replacements.set(specifier, await loadModule(childAbs));
    }
  }

  const rewritten = outputText.replace(specifierRe, (whole, quote, specifier) => {
    const replacement = replacements.get(specifier);
    return replacement ? `from ${quote}${replacement}${quote}` : whole;
  });

  const url = toDataUrl(rewritten);
  cache.set(absPath, url);
  return url;
}

const modulePath = fileURLToPath(
  new URL('../../supabase/functions/_shared/production-gate.ts', import.meta.url),
);
const gate = await import(await loadModule(modulePath));

// --- Fixtures ---------------------------------------------------------------

// A far-future validity window so approvals are fresh relative to the fixed clock.
const NOW = new Date('2025-01-01T00:00:00.000Z');
const FRESH_EXPIRY = '2025-06-01T00:00:00.000Z';
const PAST_EXPIRY = '2024-06-01T00:00:00.000Z';

const approvedEvidence = (prerequisiteId, overrides = {}) => ({
  prerequisiteId,
  status: 'approved',
  submittedBy: 'preparer',
  approvedBy: 'independent-approver',
  approvedAt: '2025-01-01T00:00:00.000Z',
  expiresAt: FRESH_EXPIRY,
  ...overrides,
});

// A complete, satisfying evidence set: one fresh, independently-approved record
// for every modeled prerequisite.
const completeEvidence = () =>
  gate.PRODUCTION_PREREQUISITE_IDS.map((id) => approvedEvidence(id));

// --- Catalog integrity ------------------------------------------------------

test('models every Requirement 24 prerequisite and reuses shared approval ids', () => {
  const ids = new Set(gate.PRODUCTION_PREREQUISITE_IDS);
  for (const expected of [
    'regulated_php_issuer',
    'institutional_custody',
    'beneficiary_recovery',
    'merchant_settlement',
    'fee_sponsorship',
    'maker_checker_disbursement',
    'multi_party_emergency_control',
    'independent_security_review',
    'legal_compliance_review',
    'operational_procedures',
    'load_reliability_evidence',
  ]) {
    assert.ok(ids.has(expected), `missing prerequisite: ${expected}`);
  }
  // Definitions cover the same set, with requirement traceability populated.
  assert.equal(gate.PRODUCTION_PREREQUISITES.length, gate.PRODUCTION_PREREQUISITE_IDS.length);
  for (const definition of gate.PRODUCTION_PREREQUISITES) {
    assert.ok(definition.requirements.length > 0);
  }
});

// --- Fail-closed evaluator --------------------------------------------------

test('the complete, fresh, independently-approved set passes', () => {
  const decision = gate.evaluateProductionGate({ evidence: completeEvidence(), now: NOW });
  assert.equal(decision.ready, true);
  assert.deepEqual(decision.unsatisfied, []);
});

test('an empty evidence set keeps the gate closed with all prerequisites missing', () => {
  const decision = gate.evaluateProductionGate({ evidence: [], now: NOW });
  assert.equal(decision.ready, false);
  assert.equal(decision.unsatisfied.length, gate.PRODUCTION_PREREQUISITE_IDS.length);
  assert.ok(decision.unsatisfied.every((e) => e.reason === 'missing'));
});

test('a single missing prerequisite keeps the gate closed', () => {
  const evidence = completeEvidence().filter(
    (e) => e.prerequisiteId !== 'legal_compliance_review',
  );
  const decision = gate.evaluateProductionGate({ evidence, now: NOW });
  assert.equal(decision.ready, false);
  const legal = decision.evaluations.find((e) => e.prerequisiteId === 'legal_compliance_review');
  assert.deepEqual(legal, {
    prerequisiteId: 'legal_compliance_review',
    satisfied: false,
    reason: 'missing',
  });
});

test('a rejected prerequisite keeps the gate closed', () => {
  const evidence = completeEvidence().map((e) =>
    e.prerequisiteId === 'independent_security_review' ? { ...e, status: 'rejected' } : e,
  );
  const decision = gate.evaluateProductionGate({ evidence, now: NOW });
  assert.equal(decision.ready, false);
  const review = decision.evaluations.find((e) => e.prerequisiteId === 'independent_security_review');
  assert.equal(review.reason, 'rejected');
});

test('a pending prerequisite keeps the gate closed', () => {
  const evidence = completeEvidence().map((e) =>
    e.prerequisiteId === 'load_reliability_evidence'
      ? { ...e, status: 'pending', approvedBy: null, approvedAt: null }
      : e,
  );
  const decision = gate.evaluateProductionGate({ evidence, now: NOW });
  assert.equal(decision.ready, false);
  const load = decision.evaluations.find((e) => e.prerequisiteId === 'load_reliability_evidence');
  assert.equal(load.reason, 'pending');
});

test('a stale (expired) approval keeps the gate closed', () => {
  const evidence = completeEvidence().map((e) =>
    e.prerequisiteId === 'operational_procedures' ? { ...e, expiresAt: PAST_EXPIRY } : e,
  );
  const decision = gate.evaluateProductionGate({ evidence, now: NOW });
  assert.equal(decision.ready, false);
  const ops = decision.evaluations.find((e) => e.prerequisiteId === 'operational_procedures');
  assert.equal(ops.reason, 'stale');
});

test('an approval with no validity window is treated as stale', () => {
  const evidence = completeEvidence().map((e) =>
    e.prerequisiteId === 'fee_sponsorship' ? { ...e, expiresAt: null } : e,
  );
  const decision = gate.evaluateProductionGate({ evidence, now: NOW });
  assert.equal(decision.ready, false);
  const fee = decision.evaluations.find((e) => e.prerequisiteId === 'fee_sponsorship');
  assert.equal(fee.reason, 'stale');
});

test('a self-approved prerequisite keeps the gate closed', () => {
  const evidence = completeEvidence().map((e) =>
    e.prerequisiteId === 'maker_checker_disbursement'
      ? { ...e, submittedBy: 'same-person', approvedBy: 'same-person' }
      : e,
  );
  const decision = gate.evaluateProductionGate({ evidence, now: NOW });
  assert.equal(decision.ready, false);
  const maker = decision.evaluations.find((e) => e.prerequisiteId === 'maker_checker_disbursement');
  assert.equal(maker.reason, 'self_approved');
});

test('the most severe reason is reported when a prerequisite has several records', () => {
  const evidence = [
    ...completeEvidence(),
    // A second, rejected record for an already-approved prerequisite must fail closed.
    approvedEvidence('institutional_custody', { status: 'rejected' }),
  ];
  const decision = gate.evaluateProductionGate({ evidence, now: NOW });
  assert.equal(decision.ready, false);
  const custody = decision.evaluations.find((e) => e.prerequisiteId === 'institutional_custody');
  assert.equal(custody.reason, 'rejected');
});

// --- Pilot mainnet lock -----------------------------------------------------

const pilotConfig = Object.freeze({ mainnetEnabled: false });

test('a pilot build can never permit mainnet even when the gate is ready', () => {
  const decision = gate.evaluateProductionGate({ evidence: completeEvidence(), now: NOW });
  assert.equal(decision.ready, true);
  assert.equal(gate.isMainnetPermitted(pilotConfig, decision), false);
});

test('mainnet is only permitted when config enables it AND the gate is ready', () => {
  const ready = gate.evaluateProductionGate({ evidence: completeEvidence(), now: NOW });
  const closed = gate.evaluateProductionGate({ evidence: [], now: NOW });
  // The production term is exercised with a would-be production config.
  assert.equal(gate.isMainnetPermitted({ mainnetEnabled: true }, ready), true);
  assert.equal(gate.isMainnetPermitted({ mainnetEnabled: true }, closed), false);
});

test('assertPilotMainnetDisabled throws for a non-pilot config', () => {
  assert.doesNotThrow(() => gate.assertPilotMainnetDisabled(pilotConfig));
  assert.throws(
    () => gate.assertPilotMainnetDisabled({ mainnetEnabled: true }),
    gate.ProductionGateError,
  );
});

// --- Real-PHP redeemability claim guard (Req 24.9) --------------------------

test('detects claims that imply RCPHP is redeemable for real pesos', () => {
  for (const claim of [
    'This token is redeemable for real PHP.',
    'Redeem your balance into Philippine pesos anytime.',
    'Backed 1:1 by real PHP.',
    'Withdraw to real cash at any partner bank.',
    'Your voucher is worth ₱500 in real money.',
  ]) {
    assert.equal(gate.containsRealPhpRedeemabilityClaim(claim), true, claim);
    assert.throws(() => gate.assertNoRealPhpClaim(claim, 'UI copy'), gate.ProductionGateError);
  }
});

test('allows honest testnet disclosures', () => {
  for (const honest of [
    'Testnet only — no real monetary value.',
    'RCPHP is a non-monetary Stellar testnet asset.',
    'Simulated cash-out request (not a real bank transfer).',
  ]) {
    assert.equal(gate.containsRealPhpRedeemabilityClaim(honest), false, honest);
    assert.doesNotThrow(() => gate.assertNoRealPhpClaim(honest));
  }
});

// --- Regulated-partner adapter boundary (Req 1.6) ---------------------------

test('the pilot regulated-partner adapter refuses to supply live configuration', async () => {
  const adapter = gate.createPilotRegulatedPartnerAdapter();
  await assert.rejects(() => adapter.loadConfiguration(), gate.ProductionGateError);
});

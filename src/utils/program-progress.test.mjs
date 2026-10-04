import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeProgramProgressMetrics,
  deriveProgramTimeline,
  formatMilestoneDate,
  resolveProgramStatusForProgress,
} from './program-progress.ts';

test('formatMilestoneDate handles valid, invalid, and null dates safely', () => {
  assert.equal(formatMilestoneDate(null), null);
  assert.equal(formatMilestoneDate(undefined), null);
  assert.equal(formatMilestoneDate('invalid-date'), null);

  const formatted = formatMilestoneDate('2026-10-05T00:00:00Z');
  assert.match(formatted, /Oct 5, 2026/);
});

test('resolveProgramStatusForProgress accurately identifies lifecycle states', () => {
  assert.equal(resolveProgramStatusForProgress('draft'), 'draft');
  assert.equal(resolveProgramStatusForProgress('funding'), 'funding');
  assert.equal(resolveProgramStatusForProgress('funding_failed'), 'funding_failed');
  assert.equal(resolveProgramStatusForProgress('closing'), 'closing');
  assert.equal(resolveProgramStatusForProgress('closed'), 'closed');
  assert.equal(resolveProgramStatusForProgress('completed'), 'completed');

  // Date derived
  assert.equal(resolveProgramStatusForProgress('published', '2020-01-01'), 'active');
  assert.equal(resolveProgramStatusForProgress('published', '2099-01-01'), 'scheduled');
});

test('deriveProgramTimeline: draft program starts at created stage', () => {
  const program = {
    id: 'prog-draft-1',
    name: 'Draft Program',
    status: 'draft',
    totalBudget: 500000,
    maxBeneficiaries: 100,
  };

  const { currentStage, currentStageLabel, timeline } = deriveProgramTimeline(program);

  assert.equal(currentStage, 'created');
  assert.equal(currentStageLabel, 'Program Created');
  assert.equal(timeline.length, 5);

  assert.equal(timeline[0].stage, 'created');
  assert.equal(timeline[0].isCurrent, true);
  assert.equal(timeline[0].isCompleted, false);

  assert.equal(timeline[1].stage, 'funded');
  assert.equal(timeline[1].isCurrent, false);
  assert.equal(timeline[1].isCompleted, false);
});

test('deriveProgramTimeline: funding program advances to funded stage', () => {
  const program = {
    id: 'prog-funding-1',
    name: 'Funding Program',
    status: 'funding',
    totalBudget: 1000000,
    maxBeneficiaries: 200,
  };

  const { currentStage, timeline } = deriveProgramTimeline(program);

  assert.equal(currentStage, 'funded');
  assert.equal(timeline[0].isCompleted, true);
  assert.equal(timeline[1].isCurrent, true);
});

test('deriveProgramTimeline: active program with enrollments advances to enrolling stage', () => {
  const program = {
    id: 'prog-active-1',
    name: 'Active Program with Applicants',
    status: 'active',
    startDate: '2026-01-01',
    totalBudget: 1000000,
    maxBeneficiaries: 500,
  };

  const { currentStage, timeline } = deriveProgramTimeline(program, {
    enrolled: 45,
    approved: 20,
    distributedAmount: 0,
  });

  assert.equal(currentStage, 'enrolling');
  assert.equal(timeline[0].isCompleted, true);
  assert.equal(timeline[1].isCompleted, true);
  assert.equal(timeline[2].isCurrent, true);
  assert.equal(timeline[3].isCompleted, false);
});

test('deriveProgramTimeline: active program with disbursements advances to distributing stage', () => {
  const program = {
    id: 'prog-active-2',
    name: 'Active Program Disbursing',
    status: 'active',
    startDate: '2026-01-01',
    totalBudget: 2000000,
    maxBeneficiaries: 1000,
  };

  const { currentStage, timeline } = deriveProgramTimeline(program, {
    enrolled: 250,
    approved: 200,
    distributedAmount: 400000,
  });

  assert.equal(currentStage, 'distributing');
  assert.equal(timeline[0].isCompleted, true);
  assert.equal(timeline[1].isCompleted, true);
  assert.equal(timeline[2].isCompleted, true);
  assert.equal(timeline[3].isCurrent, true);
  assert.equal(timeline[4].isCompleted, false);
});

test('deriveProgramTimeline: completed program marks all 5 stages as completed', () => {
  const program = {
    id: 'prog-done-1',
    name: 'Concluded Program',
    status: 'completed',
    totalBudget: 500000,
    maxBeneficiaries: 100,
  };

  const { currentStage, timeline } = deriveProgramTimeline(program);

  assert.equal(currentStage, 'completed');
  assert.equal(timeline.every((t) => t.isCompleted), true);
  assert.equal(timeline[4].isCurrent, true);
});

test('computeProgramProgressMetrics: calculates budget and beneficiary KPIs accurately (ORG-06)', () => {
  const program = {
    id: 'prog-kpi-1',
    name: 'Calamity Relief Program',
    status: 'active',
    startDate: '2026-01-01',
    totalBudget: 1000000,
    maxBeneficiaries: 500,
    voucherTypes: ['food', 'medicine'],
    affectedAreas: ['District 1', 'Barangay San Jose'],
  };

  const metrics = computeProgramProgressMetrics(program, {
    enrolled: 300,
    approved: 250,
    verified: 240,
    distributedAmount: 500000,
    confirmedRecipients: 250,
  });

  assert.equal(metrics.totalBudget, 1000000);
  assert.equal(metrics.distributedBudget, 500000);
  assert.equal(metrics.remainingBudget, 500000);
  assert.equal(metrics.budgetUtilizationPercent, 50);

  assert.equal(metrics.maxBeneficiaries, 500);
  assert.equal(metrics.enrolledCount, 300);
  assert.equal(metrics.approvedCount, 250);
  assert.equal(metrics.verifiedCount, 240);
  assert.equal(metrics.remainingBeneficiaries, 250);

  assert.deepEqual(metrics.voucherTypes, ['food', 'medicine']);
  assert.deepEqual(metrics.affectedAreas, ['District 1', 'Barangay San Jose']);
});

test('computeProgramProgressMetrics: safely handles edge cases (zero budget, zero beneficiaries)', () => {
  const program = {
    id: 'prog-zero-1',
    name: 'Zero Budget Draft',
    status: 'draft',
    totalBudget: 0,
    maxBeneficiaries: 0,
  };

  const metrics = computeProgramProgressMetrics(program, {
    enrolled: 0,
    approved: 0,
    verified: 0,
    distributedAmount: 0,
  });

  assert.equal(metrics.totalBudget, 0);
  assert.equal(metrics.distributedBudget, 0);
  assert.equal(metrics.remainingBudget, 0);
  assert.equal(metrics.budgetUtilizationPercent, 0);
  assert.equal(metrics.remainingBeneficiaries, 0);
  assert.equal(Number.isNaN(metrics.budgetUtilizationPercent), false);
});

test('computeProgramProgressMetrics: caps distributedBudget at totalBudget to prevent overflow', () => {
  const program = {
    id: 'prog-cap-1',
    name: 'Budget Cap Test',
    status: 'active',
    startDate: '2026-01-01',
    totalBudget: 100000,
    maxBeneficiaries: 50,
  };

  const metrics = computeProgramProgressMetrics(program, {
    distributedAmount: 150000, // exceeds budget
    approved: 50,
  });

  assert.equal(metrics.distributedBudget, 100000);
  assert.equal(metrics.remainingBudget, 0);
  assert.equal(metrics.budgetUtilizationPercent, 100);
});

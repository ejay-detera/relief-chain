import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateAverageDistributionTime,
  calculateBudgetUtilization,
  calculateGeographicCoverage,
  calculateOrganizationPerformance,
  calculateRedemptionRate,
  DISTRIBUTION_SLA_DAYS,
  getSimulatedDisasterAnalytics,
} from '../utils/disaster-analytics-utils.ts';

test('calculateAverageDistributionTime produces accurate days and SLA status', () => {
  // Test optimal (< 1.5 days)
  const optimal = calculateAverageDistributionTime([1.2, 1.4]);
  assert.equal(optimal.valueDays, 1.3);
  assert.equal(optimal.slaStatus, 'optimal');
  assert.match(optimal.formattedText, /1\.3 Days/);

  // Test within SLA (1.6 - 2.0 days)
  const withinSla = calculateAverageDistributionTime([1.8, 2.0]);
  assert.equal(withinSla.valueDays, 1.9);
  assert.equal(withinSla.slaStatus, 'acceptable');

  // Test delayed (> 2.0 days)
  const delayed = calculateAverageDistributionTime([2.5, 3.1]);
  assert.equal(delayed.valueDays, 2.8);
  assert.equal(delayed.slaStatus, 'delayed');

  // Test empty fallback
  const empty = calculateAverageDistributionTime([]);
  assert.ok(empty.valueDays > 0);
  assert.ok(empty.formattedText.length > 0);
});

test('calculateRedemptionRate computes percentage and handles zero safe bounds', () => {
  const result = calculateRedemptionRate(1000, 850);
  assert.equal(result.percentage, 85);
  assert.equal(result.formattedPercentage, '85.0%');
  assert.equal(result.redeemedCount, 850);
  assert.equal(result.distributedCount, 1000);

  // Redemption cannot exceed distributed
  const bounded = calculateRedemptionRate(500, 600);
  assert.equal(bounded.percentage, 100);
  assert.equal(bounded.redeemedCount, 500);

  // Zero distributed handles fallback without NaN
  const zero = calculateRedemptionRate(0, 0);
  assert.ok(!isNaN(zero.percentage));
  assert.ok(zero.formattedPercentage.includes('%'));
});

test('calculateBudgetUtilization calculates percentages and remaining funds accurately', () => {
  const result = calculateBudgetUtilization(1000000, 750000);
  assert.equal(result.percentage, 75);
  assert.equal(result.utilizedPhp, 750000);
  assert.equal(result.remainingPhp, 250000);
  assert.match(result.formattedUtilized, /₱750,000/);

  // Zero allocation handles without NaN
  const zero = calculateBudgetUtilization(0, 0);
  assert.ok(!isNaN(zero.percentage));
  assert.ok(zero.formattedPercentage.includes('%'));
});

test('calculateGeographicCoverage calculates coverage percentage across unique barangays', () => {
  const barangays = ['Barangay 1', 'Barangay 2', 'Barangay 1', 'Barangay 3']; // 3 unique
  const result = calculateGeographicCoverage(barangays, 10);
  assert.equal(result.coveredCount, 3);
  assert.equal(result.totalTargetCount, 10);
  assert.equal(result.percentage, 30);
  assert.equal(result.coverageBadge, 'Localized Reach');

  // High coverage
  const highCoverage = calculateGeographicCoverage(
    ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9'],
    10,
  );
  assert.equal(highCoverage.percentage, 90);
  assert.equal(highCoverage.coverageBadge, 'High Reach (Priority Coverage)');
});

test('calculateOrganizationPerformance synthesizes weighted index and grade', () => {
  const optimal = calculateOrganizationPerformance(85, 90, 98);
  assert.ok(optimal.scorePercentage >= 90);
  assert.match(optimal.ratingGrade, /Grade A/);
  assert.equal(optimal.isLedgerReconciled, true);
  assert.equal(optimal.onchainSettlementRate, 100);
});

test('getSimulatedDisasterAnalytics responds to filter options', () => {
  const allFilter = { programId: 'all', aidType: 'all', datePreset: 'all' };
  const analyticsAll = getSimulatedDisasterAnalytics(allFilter);
  assert.ok(analyticsAll.distributionTime);
  assert.ok(analyticsAll.redemptionRate);
  assert.ok(analyticsAll.budgetUtilization);
  assert.ok(analyticsAll.geographicCoverage);
  assert.ok(analyticsAll.organizationPerformance);
  assert.equal(analyticsAll.isReadOnlyLedger, true);

  const foodFilter = { programId: 'all', aidType: 'food', datePreset: 'last_30_days' };
  const analyticsFood = getSimulatedDisasterAnalytics(foodFilter);
  assert.ok(analyticsFood.redemptionRate.percentage > 0);
  assert.equal(analyticsFood.isReadOnlyLedger, true);
});

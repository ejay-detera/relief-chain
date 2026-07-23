// Beneficiary funding-source eligibility for a scanned invoice.
//
// A scanned, locally-verified invoice can be paid from exactly ONE eligible
// beneficiary-selected source (Requirement 11.3); split payments are deferred
// (Requirement 11.4). Unrestricted cash and each voucher entitlement are always
// listed separately (Requirement 11.1), and any source that cannot pay the
// invoice is returned as `eligible: false` with a user-facing reason rather than
// hidden, so the review screen can disable it and explain why (Requirement 11.2).
//
// This module is pure: it derives eligibility and the resulting balance from the
// reconciled balances passed in. It never reads the network and never fabricates
// a balance.
//
// Validates: Requirements 11.1, 11.2, 11.3, 11.4

import { parseStroopAmount, type StroopAmount } from '@/types/blockchain';
import type { FundingSource, InvoiceV1 } from '@/types/invoice';
import type { BeneficiaryProgramEntitlement } from '@/types/projection';
import { formatStroops } from '@/utils/format-stroops';

const CASH_SOURCE_ID = 'cash' as const;

const covers = (available: StroopAmount, amount: StroopAmount): boolean =>
  BigInt(available) >= BigInt(amount);

const remainder = (available: StroopAmount, amount: StroopAmount): StroopAmount =>
  parseStroopAmount(BigInt(available) - BigInt(amount));

const insufficientReason = (available: StroopAmount): string =>
  `Insufficient balance. Only ${formatStroops(available)} RCPHP is available for this invoice.`;

const buildCashSource = (
  invoice: InvoiceV1,
  cashAvailableStroops: StroopAmount,
): FundingSource => {
  const base = {
    id: CASH_SOURCE_ID,
    kind: 'cash' as const,
    label: 'Unrestricted cash',
    detail: 'Cash assistance · no category limits',
    category: null,
    availableStroops: cashAvailableStroops,
    assetCode: 'RCPHP' as const,
    network: 'testnet' as const,
  };

  // A voucher invoice is redeemed through its program's Soroban contract, so cash
  // can never pay it (Requirements 11.2, 11.5).
  if (invoice.kind === 'voucher') {
    return {
      ...base,
      eligible: false,
      disabledReason: 'This is a voucher invoice. It must be paid with its program voucher, not unrestricted cash.',
    };
  }

  if (!covers(cashAvailableStroops, invoice.amountStroops)) {
    return { ...base, eligible: false, disabledReason: insufficientReason(cashAvailableStroops) };
  }

  return { ...base, eligible: true, resultingBalanceStroops: remainder(cashAvailableStroops, invoice.amountStroops) };
};

const buildVoucherSource = (
  invoice: InvoiceV1,
  entitlement: BeneficiaryProgramEntitlement,
): FundingSource => {
  const matchesInvoiceProgram = invoice.kind === 'voucher' && entitlement.programId === invoice.programId;
  const base = {
    id: entitlement.programId,
    kind: 'voucher' as const,
    label: entitlement.programName,
    detail: entitlement.purpose,
    category: matchesInvoiceProgram ? invoice.category : entitlement.purpose,
    availableStroops: entitlement.availableStroops,
    assetCode: 'RCPHP' as const,
    network: 'testnet' as const,
  };

  // A cash invoice carries no program/category, so a category-restricted voucher
  // cannot pay it (Requirement 11.2).
  if (invoice.kind === 'cash') {
    return {
      ...base,
      eligible: false,
      disabledReason: 'Voucher aid is category-restricted and cannot pay a cash invoice.',
    };
  }

  // A voucher entitlement can only pay its own program's invoice.
  if (!matchesInvoiceProgram) {
    return {
      ...base,
      eligible: false,
      disabledReason: `This voucher only pays ${entitlement.programName} invoices, not this program.`,
    };
  }

  if (!covers(entitlement.availableStroops, invoice.amountStroops)) {
    return { ...base, eligible: false, disabledReason: insufficientReason(entitlement.availableStroops) };
  }

  return { ...base, eligible: true, resultingBalanceStroops: remainder(entitlement.availableStroops, invoice.amountStroops) };
};

/**
 * Builds the ordered funding-source list for a scanned invoice: eligible sources
 * first, then disabled sources with their explanations. `voucherEntitlements`
 * should already be scoped to reconciled voucher entitlements; the aggregated
 * cash balance is passed separately so cash is never double-counted with a
 * per-program cash projection row.
 */
export const buildFundingSources = (
  invoice: InvoiceV1,
  cashAvailableStroops: StroopAmount,
  voucherEntitlements: readonly BeneficiaryProgramEntitlement[],
): FundingSource[] => {
  const sources: FundingSource[] = [
    buildCashSource(invoice, cashAvailableStroops),
    ...voucherEntitlements.map((entitlement) => buildVoucherSource(invoice, entitlement)),
  ];

  // Eligible sources first; original relative order is otherwise preserved.
  return sources
    .map((source, index) => ({ source, index }))
    .sort((a, b) => {
      if (a.source.eligible !== b.source.eligible) return a.source.eligible ? -1 : 1;
      return a.index - b.index;
    })
    .map(({ source }) => source);
};

/** True when at least one source can pay the invoice. Drives the review CTA. */
export const hasEligibleSource = (sources: readonly FundingSource[]): boolean =>
  sources.some((source) => source.eligible);

import { parseStroopAmount, type StroopAmount } from '../types/blockchain.ts';
import type { BeneficiaryProgramEntitlement } from '../types/projection.ts';
import type { EnrolledProgram } from '../types/wallet.ts';
import { addStroops, ZERO_STROOPS } from './format-stroops.ts';

/**
 * Determines whether an aid type or category represents a non-cash voucher
 * (e.g., Food, Gas, Medicine, Supplies, Transportation, General Voucher).
 * Cash assistance is strictly excluded.
 */
export const isNonCashVoucher = (params: {
  aidType?: string | null;
  category?: string | null;
  purpose?: string | null;
  name?: string | null;
}): boolean => {
  const aidType = (params.aidType ?? '').toLowerCase().trim();
  const category = (params.category ?? '').toLowerCase().trim();
  const purpose = (params.purpose ?? '').toLowerCase().trim();
  const name = (params.name ?? '').toLowerCase().trim();

  // Explicit cash aid rail or category is excluded
  if (aidType === 'cash') return false;
  if (category === 'cash') return false;
  if (purpose === 'cash' || purpose === 'cash aid' || purpose === 'unrestricted cash') return false;

  const combined = `${category} ${purpose} ${name}`;
  if (
    combined.includes('cash aid') ||
    combined.includes('cash assistance') ||
    combined.includes('unrestricted cash')
  ) {
    return false;
  }

  return true;
};

export const getStroopAmountSafe = (value: unknown): StroopAmount => {
  if (value == null) return ZERO_STROOPS;
  try {
    return parseStroopAmount(value);
  } catch {
    return ZERO_STROOPS;
  }
};

export type VoucherBreakdownResult = {
  totalStroops: StroopAmount;
  breakdown: { label: string; amountStroops: StroopAmount }[];
  voucherCount: number;
};

/**
 * Computes the total spendable non-cash voucher amount across programs and entitlements.
 * Factors in approved programs whose on-chain reconciliation is still indexing
 * (matching ProgramVoucherCard behavior) and excludes cash aid.
 */
export const computeVoucherBreakdownAndTotal = (
  entitlements: readonly BeneficiaryProgramEntitlement[] | null,
  programs?: readonly EnrolledProgram[]
): VoucherBreakdownResult => {
  const map = new Map<string, StroopAmount>();
  let totalStroops = ZERO_STROOPS;
  let voucherCount = 0;
  const accountedProgramIds = new Set<string>();

  if (programs && programs.length > 0) {
    for (const prog of programs) {
      if (
        !isNonCashVoucher({
          category: prog.category,
          purpose: prog.purpose,
          name: prog.name,
        })
      ) {
        continue;
      }

      voucherCount += 1;
      accountedProgramIds.add(prog.id);

      const matchingEntitlement = entitlements?.find(
        (e) => e.programId === prog.id && !e.isAbandoned
      );

      let progAmount = ZERO_STROOPS;
      if (matchingEntitlement) {
        progAmount = matchingEntitlement.availableStroops;
      } else if (prog.approvalStatus === 'Approved') {
        if (prog.remainingVoucherStroops != null) {
          progAmount = getStroopAmountSafe(prog.remainingVoucherStroops);
        } else if (prog.allocatedAmountStroops != null) {
          progAmount = getStroopAmountSafe(prog.allocatedAmountStroops);
        }
      }

      totalStroops = addStroops(totalStroops, progAmount);

      const label = prog.category || prog.purpose || prog.name || 'General Voucher';
      const existing = map.get(label) ?? ZERO_STROOPS;
      map.set(label, addStroops(existing, progAmount));
    }
  }

  // Also include any reconciled non-abandoned voucher entitlements not already in programs
  if (entitlements) {
    for (const ent of entitlements) {
      if (ent.isAbandoned || accountedProgramIds.has(ent.programId)) continue;
      if (
        !isNonCashVoucher({
          aidType: ent.aidType,
          category: ent.voucherType,
          purpose: ent.purpose,
          name: ent.programName,
        })
      ) {
        continue;
      }

      voucherCount += 1;
      totalStroops = addStroops(totalStroops, ent.availableStroops);

      const label = ent.voucherType || ent.purpose || ent.programName || 'General Voucher';
      const existing = map.get(label) ?? ZERO_STROOPS;
      map.set(label, addStroops(existing, ent.availableStroops));
    }
  }

  const breakdown = Array.from(map.entries())
    .filter(([_, amount]) => BigInt(amount) > 0n)
    .map(([label, amountStroops]) => ({
      label,
      amountStroops,
    }));

  return { totalStroops, breakdown, voucherCount };
};

import { useCallback, useMemo, useState } from 'react';

import { useMerchantWallet } from '@/hooks/use-merchant-wallet';
import {
  extractVoucherTarget,
  lookupBeneficiaryBalances,
  type BeneficiaryLookupResult,
  type BeneficiaryVoucherBalanceItem,
} from '@/services/merchant-redemption-service';
import { parseStroopAmount, type StroopAmount } from '@/types/blockchain';
import { formatStroops, stroopsFromDecimalInput, ZERO_STROOPS } from '@/utils/format-stroops';

export interface UseBeneficiaryBalanceCheckResult {
  isLoading: boolean;
  error: string | null;
  beneficiary: BeneficiaryLookupResult | null;
  selectedVoucher: BeneficiaryVoucherBalanceItem | null;
  amount: string;
  setAmount: (val: string) => void;
  selectVoucher: (v: BeneficiaryVoucherBalanceItem | null) => void;
  lookup: (scannedData: string) => Promise<boolean>;
  reset: () => void;
  validation: {
    isValid: boolean;
    error: string | null;
    amountStroops: StroopAmount | null;
    remainingStroops: StroopAmount | null;
    remainingPhp: string | null;
  };
}

export function useBeneficiaryBalanceCheck(
  merchantCategories?: string[],
  merchantName?: string | null,
  merchantIdentifiers?: string[]
): UseBeneficiaryBalanceCheckResult {
  const { merchantEntityId } = useMerchantWallet();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [beneficiary, setBeneficiary] = useState<BeneficiaryLookupResult | null>(null);
  const [selectedVoucher, setSelectedVoucher] = useState<BeneficiaryVoucherBalanceItem | null>(null);
  const [amount, setAmount] = useState('');

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
    setBeneficiary(null);
    setSelectedVoucher(null);
    setAmount('');
  }, []);

  const lookup = useCallback(
    async (scannedData: string): Promise<boolean> => {
      setIsLoading(true);
      setError(null);
      setBeneficiary(null);
      setSelectedVoucher(null);
      setAmount('');

      try {
        const result = await lookupBeneficiaryBalances({
          scannedData,
          merchantEntityId,
          merchantCategories,
          merchantName,
          merchantIdentifiers,
        });

        setIsLoading(false);

        if (!result.ok) {
          setError(result.error);
          return false;
        }

        // If a specific voucher program was targeted by the scanned QR, prioritize it and isolate it
        const voucherTarget = extractVoucherTarget(scannedData);
        let finalBalances = result.data.balances;

        if (voucherTarget?.programId || voucherTarget?.programName) {
          const matched = result.data.balances.filter(
            (b) =>
              (voucherTarget.programId && b.programId === voucherTarget.programId) ||
              (voucherTarget.programName &&
                b.programName.trim().toLowerCase() === voucherTarget.programName.trim().toLowerCase())
          );
          if (matched.length > 0) {
            finalBalances = matched;
          }
        } else if (voucherTarget?.category) {
          const matched = result.data.balances.filter(
            (b) => b.category.toLowerCase() === voucherTarget.category?.toLowerCase()
          );
          if (matched.length > 0) {
            finalBalances = matched;
          }
        }

        const beneficiaryData: BeneficiaryLookupResult = {
          ...result.data,
          balances: finalBalances,
        };

        setBeneficiary(beneficiaryData);

        const targetVoucher =
          (voucherTarget?.programId || voucherTarget?.programName
            ? finalBalances.find(
                (b) =>
                  (voucherTarget.programId && b.programId === voucherTarget.programId) ||
                  (voucherTarget.programName &&
                    b.programName.trim().toLowerCase() === voucherTarget.programName.trim().toLowerCase())
              )
            : null) ??
          finalBalances.find((b) => b.isAllowedForMerchant) ??
          finalBalances[0] ??
          null;

        if (targetVoucher) {
          setSelectedVoucher(targetVoucher);
          if (targetVoucher.availablePhp && targetVoucher.availablePhp !== '0.00') {
            setAmount(targetVoucher.availablePhp.replace(/,/g, ''));
          }
        }

        return true;
      } catch (err) {
        setIsLoading(false);
        const msg = err instanceof Error ? err.message : 'Unable to complete beneficiary lookup.';
        setError(msg);
        return false;
      }
    },
    [merchantEntityId, merchantCategories, merchantName, merchantIdentifiers]
  );

  const selectVoucher = useCallback((v: BeneficiaryVoucherBalanceItem | null) => {
    setSelectedVoucher(v);
    setError(null);
  }, []);

  const validation = useMemo(() => {
    if (!selectedVoucher) {
      return {
        isValid: false,
        error: 'Please select an assistance or voucher program.',
        amountStroops: null,
        remainingStroops: null,
        remainingPhp: null,
      };
    }

    if (!selectedVoucher.isAllowedForMerchant) {
      return {
        isValid: false,
        error: selectedVoucher.disallowedReason || 'Merchant is not accredited for this voucher category.',
        amountStroops: null,
        remainingStroops: null,
        remainingPhp: null,
      };
    }

    if (!amount.trim()) {
      return {
        isValid: false,
        error: null,
        amountStroops: null,
        remainingStroops: null,
        remainingPhp: null,
      };
    }

    let parsedStroops: StroopAmount;
    try {
      parsedStroops = stroopsFromDecimalInput(amount);
    } catch (e: unknown) {
      return {
        isValid: false,
        error: e instanceof RangeError ? e.message : 'Enter a valid amount.',
        amountStroops: null,
        remainingStroops: null,
        remainingPhp: null,
      };
    }

    const available = BigInt(selectedVoucher.availableStroops);
    const requested = BigInt(parsedStroops);

    if (requested > available) {
      return {
        isValid: false,
        error: `Insufficient balance. Beneficiary only has ₱${selectedVoucher.availablePhp} available for this program.`,
        amountStroops: parsedStroops,
        remainingStroops: null,
        remainingPhp: null,
      };
    }

    const remaining = parseStroopAmount(available - requested);

    return {
      isValid: true,
      error: null,
      amountStroops: parsedStroops,
      remainingStroops: remaining,
      remainingPhp: formatStroops(remaining),
    };
  }, [selectedVoucher, amount]);

  return {
    isLoading,
    error,
    beneficiary,
    selectedVoucher,
    amount,
    setAmount,
    selectVoucher,
    lookup,
    reset,
    validation,
  };
}

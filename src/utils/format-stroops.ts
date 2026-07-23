import { parseStroopAmount, type StroopAmount } from '@/types/blockchain';

/** Stellar classic assets, including the RCPHP test asset, use 7 decimal places. */
const STROOPS_PER_UNIT = 10_000_000n;
const DECIMAL_PLACES = 7;

/**
 * Formats a canonical integer stroop amount as a human-readable decimal string.
 * Never performs floating-point math; all scaling uses BigInt to preserve exactness.
 */
export const formatStroops = (
  amount: StroopAmount,
  options: Readonly<{ minimumFractionDigits?: number }> = {},
): string => {
  const total = BigInt(amount);
  const whole = total / STROOPS_PER_UNIT;
  const fraction = total % STROOPS_PER_UNIT;

  const groupedWhole = whole
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  const fractionDigits = fraction
    .toString()
    .padStart(DECIMAL_PLACES, '0');

  const minimumFractionDigits = Math.min(
    Math.max(options.minimumFractionDigits ?? 2, 0),
    DECIMAL_PLACES,
  );

  const trimmed = fractionDigits.replace(/0+$/, '');
  const displayFraction = trimmed.length < minimumFractionDigits
    ? fractionDigits.slice(0, minimumFractionDigits)
    : trimmed;

  return displayFraction.length > 0 ? `${groupedWhole}.${displayFraction}` : groupedWhole;
};

const DECIMAL_INPUT_PATTERN = /^\d{1,12}(\.\d{1,7})?$/;

/**
 * Parses a human-entered decimal amount (e.g. `"500"` or `"12.50"`) into a
 * canonical positive integer stroop amount. Uses only BigInt math so no
 * floating-point rounding can occur. Throws {@link RangeError} for malformed or
 * non-positive input; callers surface the message to the user.
 */
export const stroopsFromDecimalInput = (input: string): StroopAmount => {
  const trimmed = input.trim();
  if (!DECIMAL_INPUT_PATTERN.test(trimmed)) {
    throw new RangeError('Enter a valid amount with up to 7 decimal places.');
  }
  const [whole, fraction = ''] = trimmed.split('.');
  const paddedFraction = fraction.padEnd(DECIMAL_PLACES, '0');
  const total = BigInt(whole) * STROOPS_PER_UNIT + BigInt(paddedFraction || '0');
  if (total <= 0n) {
    throw new RangeError('Amount must be greater than zero.');
  }
  return parseStroopAmount(total);
};

/** Adds two canonical stroop amounts and returns a canonical stroop amount. */
export const addStroops = (a: StroopAmount, b: StroopAmount): StroopAmount =>
  parseStroopAmount(BigInt(a) + BigInt(b));

export const ZERO_STROOPS: StroopAmount = parseStroopAmount(0);

/**
 * Format RCPHP (Relief Chain PHP) currency values
 * RCPHP is a tokenized asset, not traditional PHP, so we display it as "RCPHP"
 */

/**
 * Format a number as RCPHP currency with full decimals
 * @param value The numeric value to format
 * @returns Formatted string like "1,234.56 RCPHP"
 */
export const formatRCPHP = (value: number): string => {
  return `${value.toLocaleString(undefined, { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  })} RCPHP`;
};

/**
 * Format a number as RCPHP currency with no decimals (for whole amounts)
 * @param value The numeric value to format
 * @returns Formatted string like "1,234 RCPHP"
 */
export const formatRCPHPWhole = (value: number): string => {
  return `${value.toLocaleString(undefined, { 
    minimumFractionDigits: 0, 
    maximumFractionDigits: 0 
  })} RCPHP`;
};

/**
 * Convert stroops (7 decimal places) to RCPHP and format
 * @param stroops The value in stroops (1 RCPHP = 10,000,000 stroops)
 * @returns Formatted string like "1,234.56 RCPHP"
 */
export const formatStroopsAsRCPHP = (stroops: bigint | number): string => {
  const value = Number(stroops) / 10000000;
  return formatRCPHP(value);
};

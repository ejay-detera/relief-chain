/**
 * Voucher Category Matcher & Accreditation Eligibility Engine.
 * 
 * Enforces MER-01, MER-02, and VOUCHERS acceptance criteria:
 * - A purpose-specific digital voucher (Food, Medicine, Shelter, School Supplies)
 *   is redeemable ONLY at merchants accredited for the matching category.
 * - Non-matching attempts are strictly blocked with explicit, user-friendly reasons.
 * - Cash assistance is unrestricted across accredited merchants.
 * - General merchandise / multi-category merchants can redeem across multiple aid types.
 */

export type CanonicalVoucherType = 'food' | 'medicine' | 'shelter' | 'supplies' | 'livelihood' | 'cash';

export interface VoucherTypeMetadata {
  key: CanonicalVoucherType;
  label: string;
  categoryLabel: string;
  icon: string; // MaterialCommunityIcons name
  description: string;
  acceptedMerchantCategories: string[];
}

export const VOUCHER_METADATA_MAP: Record<CanonicalVoucherType, VoucherTypeMetadata> = {
  food: {
    key: 'food',
    label: 'Food Assistance',
    categoryLabel: 'Food & Groceries',
    icon: 'food-apple-outline',
    description: 'Fresh food, rice, canned goods, groceries, and essential nutrition.',
    acceptedMerchantCategories: ['grocery', 'supermarket', 'convenience store', 'food retail', 'general merchandise'],
  },
  medicine: {
    key: 'medicine',
    label: 'Medicine & Health',
    categoryLabel: 'Medicine & Health',
    icon: 'medical-bag',
    description: 'Prescription medicines, first-aid kits, vitamins, and healthcare necessities.',
    acceptedMerchantCategories: ['pharmacy', 'drugstore', 'health supplies', 'medical', 'general merchandise'],
  },
  shelter: {
    key: 'shelter',
    label: 'Shelter & Repair',
    categoryLabel: 'Shelter & Construction',
    icon: 'home-roof',
    description: 'Construction materials, roofing, emergency shelter kits, hardware, and tools.',
    acceptedMerchantCategories: ['hardware', 'construction', 'building supplies', 'general merchandise'],
  },
  supplies: {
    key: 'supplies',
    label: 'School & Supplies',
    categoryLabel: 'School & General Supplies',
    icon: 'book-open-page-variant-outline',
    description: 'School supplies, textbooks, hygiene kits, clothing, and household necessities.',
    acceptedMerchantCategories: ['school supplies', 'bookstore', 'stationery', 'general merchandise', 'department store'],
  },
  livelihood: {
    key: 'livelihood',
    label: 'Livelihood Aid',
    categoryLabel: 'Livelihood & Agriculture',
    icon: 'tractor-variant',
    description: 'Farming seeds, fertilizers, fishing gear, and livelihood equipment.',
    acceptedMerchantCategories: ['agriculture', 'fisheries', 'hardware', 'general merchandise'],
  },
  cash: {
    key: 'cash',
    label: 'Unrestricted Cash',
    categoryLabel: 'General Financial Aid',
    icon: 'cash-multiple',
    description: 'Universal direct cash assistance with no category spending restrictions.',
    acceptedMerchantCategories: ['*'], // Open to all accredited merchants
  },
};

/**
 * Normalizes category or aid type string for fuzzy/case-insensitive matching.
 */
export function normalizeCategory(val: string | null | undefined): string {
  if (!val) return '';
  return val.trim().toLowerCase().replace(/[-_/]/g, ' ');
}

/**
 * Resolves a raw string (e.g. "Food", "food assistance", "grocery", "Pharmacy", "Medicine Assistance")
 * into a CanonicalVoucherType.
 */
export function resolveCanonicalVoucherType(raw: string | null | undefined): CanonicalVoucherType {
  const norm = normalizeCategory(raw);
  if (!norm) return 'cash';

  if (norm.includes('food') || norm.includes('grocer') || norm.includes('nutrition') || norm.includes('rice') || norm.includes('meal')) {
    return 'food';
  }
  if (norm.includes('med') || norm.includes('pharm') || norm.includes('drug') || norm.includes('health')) {
    return 'medicine';
  }
  if (norm.includes('shelt') || norm.includes('roof') || norm.includes('hardw') || norm.includes('construct') || norm.includes('build')) {
    return 'shelter';
  }
  if (norm.includes('suppl') || norm.includes('school') || norm.includes('book') || norm.includes('hygiene') || norm.includes('educat')) {
    return 'supplies';
  }
  if (norm.includes('live') || norm.includes('agri') || norm.includes('farm') || norm.includes('fish')) {
    return 'livelihood';
  }
  return 'cash';
}

/**
 * Checks whether a merchant accredited in one or more categories can redeem
 * a specific voucher type or program category.
 */
export function canMerchantRedeemVoucher(
  merchantCategories: string | string[] | null | undefined,
  voucherTypeOrCategory: string | null | undefined
): { allowed: boolean; reason?: string } {
  const voucherType = resolveCanonicalVoucherType(voucherTypeOrCategory);
  
  // Unrestricted cash is always redeemable at any accredited merchant
  if (voucherType === 'cash') {
    return { allowed: true };
  }

  // Parse merchant categories into array
  const rawCats = Array.isArray(merchantCategories)
    ? merchantCategories
    : merchantCategories ? [merchantCategories] : [];

  if (rawCats.length === 0) {
    return {
      allowed: false,
      reason: 'Merchant has no accredited categories on record.',
    };
  }

  const normalizedMerchantCats = rawCats.map(normalizeCategory);

  // Check if merchant has "general merchandise" or wildcard
  const hasUniversalCategory = normalizedMerchantCats.some((c) =>
    c.includes('general') || c.includes('department') || c.includes('all') || c === '*' || c.includes('other')
  );
  if (hasUniversalCategory) {
    return { allowed: true };
  }

  const meta = VOUCHER_METADATA_MAP[voucherType];
  const isMatch = normalizedMerchantCats.some((merchantCat) => {
    return meta.acceptedMerchantCategories.some((accepted) => {
      return merchantCat.includes(accepted) || accepted.includes(merchantCat);
    });
  });

  if (isMatch) {
    return { allowed: true };
  }

  const acceptedNames = meta.acceptedMerchantCategories
    .filter((c) => c !== 'general merchandise')
    .map((c) => c.charAt(0).toUpperCase() + c.slice(1))
    .join(', ');

  return {
    allowed: false,
    reason: `This is a ${meta.label} voucher. It can only be redeemed at accredited ${acceptedNames} stores.`,
  };
}

/**
 * Returns human-readable metadata for a voucher type.
 */
export function getVoucherTypeDetails(typeOrCategory: string | null | undefined): VoucherTypeMetadata {
  const key = resolveCanonicalVoucherType(typeOrCategory);
  return VOUCHER_METADATA_MAP[key];
}

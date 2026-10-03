export type AvatarRole = 'merchant' | 'beneficiary' | 'lgu';

export type AvatarPreset = {
  id: string;
  name: string;
  role: AvatarRole;
  iconName: string;
  backgroundColor: string;
  iconColor: string;
  accentColor: string;
};

export const AVATAR_PRESETS: AvatarPreset[] = [
  // Merchant presets
  {
    id: 'merchant-store',
    name: 'General Store',
    role: 'merchant',
    iconName: 'storefront',
    backgroundColor: '#E8F5E9',
    iconColor: '#1B5E20',
    accentColor: '#6FCA4B',
  },
  {
    id: 'merchant-basket',
    name: 'Market Basket',
    role: 'merchant',
    iconName: 'basket',
    backgroundColor: '#E3F2FD',
    iconColor: '#0D47A1',
    accentColor: '#1E88E5',
  },
  {
    id: 'merchant-pharmacy',
    name: 'Pharmacy',
    role: 'merchant',
    iconName: 'medical-bag',
    backgroundColor: '#E0F2F1',
    iconColor: '#004D40',
    accentColor: '#00897B',
  },
  {
    id: 'merchant-cart',
    name: 'Supermarket',
    role: 'merchant',
    iconName: 'cart',
    backgroundColor: '#FFF3E0',
    iconColor: '#E65100',
    accentColor: '#FB8C00',
  },
  {
    id: 'merchant-stall',
    name: 'Market Stall',
    role: 'merchant',
    iconName: 'store',
    backgroundColor: '#F3E5F5',
    iconColor: '#4A148C',
    accentColor: '#8E24AA',
  },
  {
    id: 'merchant-food',
    name: 'Food & Dining',
    role: 'merchant',
    iconName: 'silverware-fork-knife',
    backgroundColor: '#FBE9E7',
    iconColor: '#BF360C',
    accentColor: '#F4511E',
  },

  // Beneficiary presets
  {
    id: 'beneficiary-citizen',
    name: 'Citizen',
    role: 'beneficiary',
    iconName: 'account',
    backgroundColor: '#E8F5E9',
    iconColor: '#1B5E20',
    accentColor: '#6FCA4B',
  },
  {
    id: 'beneficiary-smile',
    name: 'Resident',
    role: 'beneficiary',
    iconName: 'emoticon-happy-outline',
    backgroundColor: '#E1F5FE',
    iconColor: '#01579B',
    accentColor: '#0288D1',
  },
  {
    id: 'beneficiary-family',
    name: 'Household',
    role: 'beneficiary',
    iconName: 'account-group',
    backgroundColor: '#EDE7F6',
    iconColor: '#311B92',
    accentColor: '#5E35B1',
  },
  {
    id: 'beneficiary-heart',
    name: 'Community',
    role: 'beneficiary',
    iconName: 'hand-heart',
    backgroundColor: '#FCE4EC',
    iconColor: '#880E4F',
    accentColor: '#D81B60',
  },
  {
    id: 'beneficiary-star',
    name: 'Beneficiary',
    role: 'beneficiary',
    iconName: 'account-star',
    backgroundColor: '#FFF8E1',
    iconColor: '#F57F17',
    accentColor: '#FBC02D',
  },

  // LGU presets
  {
    id: 'lgu-hall',
    name: 'City Hall',
    role: 'lgu',
    iconName: 'town-hall',
    backgroundColor: '#E8EAF6',
    iconColor: '#1A237E',
    accentColor: '#112E58',
  },
  {
    id: 'lgu-shield',
    name: 'Official Seal',
    role: 'lgu',
    iconName: 'shield-account',
    backgroundColor: '#ECEFF1',
    iconColor: '#263238',
    accentColor: '#546E7A',
  },
  {
    id: 'lgu-briefcase',
    name: 'Aid Admin',
    role: 'lgu',
    iconName: 'briefcase-account',
    backgroundColor: '#EDE7F6',
    iconColor: '#4A148C',
    accentColor: '#7B1FA2',
  },
];

/**
 * Deterministically chooses a default avatar preset for any given user based on their role and identifier.
 */
export const getDefaultAvatarForUser = (
  role: AvatarRole = 'beneficiary',
  identifier?: string | null,
  presetId?: string | null,
): AvatarPreset => {
  if (presetId) {
    const matched = AVATAR_PRESETS.find((p) => p.id === presetId);
    if (matched) return matched;
  }

  const rolePresets = AVATAR_PRESETS.filter((p) => p.role === role);
  const pool = rolePresets.length > 0 ? rolePresets : AVATAR_PRESETS;

  if (!identifier) return pool[0];

  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    hash = (hash << 5) - hash + identifier.charCodeAt(i);
    hash |= 0;
  }

  const index = Math.abs(hash) % pool.length;
  return pool[index];
};

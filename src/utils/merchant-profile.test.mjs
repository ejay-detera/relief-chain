import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  AVATAR_PRESETS,
  getDefaultAvatarForUser,
} from './avatar-presets.ts';
import {
  buildMerchantProfileUpdatePayloads,
  extractMerchantMetadata,
  validateMerchantProfileForm,
} from './merchant-profile.ts';

test('extractMerchantMetadata extracts fields correctly from full metadata', () => {
  const metadata = {
    business_name: 'Metro Care Pharmacy',
    business_type: 'pharmacy',
    business_address: '123 Health Ave, Manila',
    contact_person: 'Dr. Clara Reyes',
    contact_number: '+639171234567',
    operating_notes: 'Open 24/7',
    avatar_preset: 'merchant-pharmacy',
  };

  const result = extractMerchantMetadata(metadata);
  assert.equal(result.businessName, 'Metro Care Pharmacy');
  assert.equal(result.businessType, 'pharmacy');
  assert.equal(result.businessAddress, '123 Health Ave, Manila');
  assert.equal(result.contactPerson, 'Dr. Clara Reyes');
  assert.equal(result.contactNumber, '+639171234567');
  assert.equal(result.operatingNotes, 'Open 24/7');
  assert.equal(result.avatarPreset, 'merchant-pharmacy');
});

test('extractMerchantMetadata handles fallbacks when primary fields are missing', () => {
  const metadata = {
    business_name: 'Sari-Sari Store',
    business_types: ['grocery'],
    location: 'Barangay Hall Road',
    full_name: 'Juan Dela Cruz',
    mobile_number: '09181234567',
  };

  const result = extractMerchantMetadata(metadata);
  assert.equal(result.businessName, 'Sari-Sari Store');
  assert.equal(result.businessType, 'grocery');
  assert.equal(result.businessAddress, 'Barangay Hall Road');
  assert.equal(result.contactPerson, 'Juan Dela Cruz');
  assert.equal(result.contactNumber, '09181234567');
  assert.equal(result.operatingNotes, '');
  assert.equal(result.avatarPreset, '');
});

test('extractMerchantMetadata safely handles null or non-object metadata', () => {
  const resultNull = extractMerchantMetadata(null);
  assert.equal(resultNull.businessName, '');
  assert.equal(resultNull.businessType, '');
  assert.equal(resultNull.businessAddress, '');
  assert.equal(resultNull.contactPerson, '');
  assert.equal(resultNull.contactNumber, '');
  assert.equal(resultNull.avatarPreset, '');

  const resultUndefined = extractMerchantMetadata(undefined);
  assert.equal(resultUndefined.businessName, '');
});

test('validateMerchantProfileForm validates mandatory business fields', () => {
  const validForm = {
    businessName: "Aling Nena's Store",
    ownerName: 'Nena Santos',
    address: '123 Rizal St, Pasig',
    mobileNumber: '09171234567',
  };

  const validResult = validateMerchantProfileForm(validForm);
  assert.equal(validResult.isValid, true);
  assert.equal(validResult.error, null);

  const missingName = validateMerchantProfileForm({ ...validForm, businessName: '   ' });
  assert.equal(missingName.isValid, false);
  assert.match(missingName.error, /Business name/);

  const missingOwner = validateMerchantProfileForm({ ...validForm, ownerName: '' });
  assert.equal(missingOwner.isValid, false);
  assert.match(missingOwner.error, /Owner/);

  const missingAddress = validateMerchantProfileForm({ ...validForm, address: '   ' });
  assert.equal(missingAddress.isValid, false);
  assert.match(missingAddress.error, /address/);

  const invalidPhone = validateMerchantProfileForm({ ...validForm, mobileNumber: '123' });
  assert.equal(invalidPhone.isValid, false);
  assert.match(invalidPhone.error, /phone/i);
});

test('buildMerchantProfileUpdatePayloads formats clean mutation objects with avatar_preset', () => {
  const form = {
    businessName: '  Fresh Market  ',
    ownerName: '  Maria Dela Cruz  ',
    address: '  10 Market St  ',
    mobileNumber: '  09171234567  ',
    businessType: 'grocery',
    operatingNotes: '  8am - 8pm  ',
    avatarPreset: 'merchant-basket',
  };

  const payloads = buildMerchantProfileUpdatePayloads(form);

  assert.deepEqual(payloads.profilesPayload, {
    full_name: 'Maria Dela Cruz',
    location: '10 Market St',
    complete_address: '10 Market St',
    mobile_number: '09171234567',
  });

  assert.equal(payloads.authMetadataPayload.business_name, 'Fresh Market');
  assert.equal(payloads.authMetadataPayload.owner_name, 'Maria Dela Cruz');
  assert.equal(payloads.authMetadataPayload.location, '10 Market St');
  assert.equal(payloads.authMetadataPayload.business_type, 'grocery');
  assert.deepEqual(payloads.authMetadataPayload.business_types, ['grocery']);
  assert.equal(payloads.authMetadataPayload.operating_notes, '8am - 8pm');
  assert.equal(payloads.authMetadataPayload.avatar_preset, 'merchant-basket');

  assert.equal(payloads.merchantEntityPayload.display_name, 'Fresh Market');
});

test('getDefaultAvatarForUser provides role-specific default avatars deterministically', () => {
  const merchantAvatar1 = getDefaultAvatarForUser('merchant', 'merchant-user-123');
  const merchantAvatar2 = getDefaultAvatarForUser('merchant', 'merchant-user-123');
  assert.equal(merchantAvatar1.id, merchantAvatar2.id, 'Deterministic for same user identifier');
  assert.equal(merchantAvatar1.role, 'merchant');

  const beneficiaryAvatar = getDefaultAvatarForUser('beneficiary', 'ben-user-456');
  assert.equal(beneficiaryAvatar.role, 'beneficiary');

  const lguAvatar = getDefaultAvatarForUser('lgu', 'lgu-user-789');
  assert.equal(lguAvatar.role, 'lgu');

  // Explicit preset matching
  const explicit = getDefaultAvatarForUser('merchant', 'user-1', 'merchant-pharmacy');
  assert.equal(explicit.id, 'merchant-pharmacy');
});

test('AVATAR_PRESETS contains presets for merchant, beneficiary, and lgu roles', () => {
  const merchantPresets = AVATAR_PRESETS.filter((p) => p.role === 'merchant');
  const beneficiaryPresets = AVATAR_PRESETS.filter((p) => p.role === 'beneficiary');
  const lguPresets = AVATAR_PRESETS.filter((p) => p.role === 'lgu');

  assert.ok(merchantPresets.length >= 4, 'Has at least 4 merchant presets');
  assert.ok(beneficiaryPresets.length >= 4, 'Has at least 4 beneficiary presets');
  assert.ok(lguPresets.length >= 2, 'Has at least 2 LGU presets');
});

test('Merchant _layout registers edit-profile route', () => {
  const layoutPath = fileURLToPath(new URL('../app/(merchant)/_layout.tsx', import.meta.url));
  const source = readFileSync(layoutPath, 'utf8');

  assert.match(
    source,
    /<Stack\.Screen\s+name="edit-profile"\s*\/>/,
    'Merchant layout must register the edit-profile screen in Stack',
  );
});

test('Merchant profile screen provides edit profile entry points', () => {
  const profilePath = fileURLToPath(new URL('../app/(merchant)/profile.tsx', import.meta.url));
  const source = readFileSync(profilePath, 'utf8');

  assert.match(
    source,
    /\/\(merchant\)\/edit-profile/,
    'Merchant profile screen must provide navigation to edit-profile',
  );
});

test('Merchant profile screen does not duplicate merchant ID, stellar wallet, or mobile number', () => {
  const profilePath = fileURLToPath(new URL('../app/(merchant)/profile.tsx', import.meta.url));
  const profileSource = readFileSync(profilePath, 'utf8');
  const contentPath = fileURLToPath(new URL('../components/MerchantProfile/MerchantProfileContent.tsx', import.meta.url));
  const contentSource = readFileSync(contentPath, 'utf8');

  assert.doesNotMatch(
    contentSource,
    /label="Merchant ID"/,
    'Profile content must not contain Merchant ID row',
  );
  assert.doesNotMatch(
    contentSource,
    /label="Stellar Wallet Address"/,
    'Profile content must not contain Stellar Wallet Address row',
  );
  assert.doesNotMatch(
    contentSource,
    /label="Mobile Number"/,
    'Profile content must not contain Mobile Number row',
  );
  assert.doesNotMatch(
    profileSource,
    /useMerchantWallet/,
    'Profile screen does not need wallet hook after removing duplicate credentials',
  );
});

test('UserAvatar is used across Merchant, Beneficiary, and Edit Profile screens', () => {
  const merchantContent = readFileSync(
    fileURLToPath(new URL('../components/MerchantProfile/MerchantProfileContent.tsx', import.meta.url)),
    'utf8',
  );
  assert.match(merchantContent, /<UserAvatar/, 'MerchantProfileContent must use UserAvatar');

  const beneficiaryHeader = readFileSync(
    fileURLToPath(new URL('../components/beneficiary/Profile/profile-header.tsx', import.meta.url)),
    'utf8',
  );
  assert.match(beneficiaryHeader, /<UserAvatar/, 'Beneficiary ProfileHeader must use UserAvatar');

  const editProfile = readFileSync(
    fileURLToPath(new URL('../app/(merchant)/edit-profile.tsx', import.meta.url)),
    'utf8',
  );
  assert.match(editProfile, /<UserAvatar/, 'Edit profile must use UserAvatar');
  assert.match(editProfile, /<AvatarPresetSelector/, 'Edit profile must use AvatarPresetSelector');
});

test('Merchant edit profile screen contains required editable fields and other details', () => {
  const editProfilePath = fileURLToPath(new URL('../app/(merchant)/edit-profile.tsx', import.meta.url));
  const source = readFileSync(editProfilePath, 'utf8');

  // Business info fields
  assert.match(source, /Business \/ Store Name/, 'Must have Business Name field');
  assert.match(source, /Owner \/ Authorized Representative/, 'Must have Owner field');
  assert.match(source, /Store \/ Business Address/, 'Must have Address field');
  assert.match(source, /Contact \/ Mobile Number/, 'Must have Contact Number field');
  assert.match(source, /Contact Email/, 'Must have Contact Email field');
  assert.match(source, /Business Category/, 'Must have Business Category section');

  // Other details requested by user: Merchant ID, Stellar Wallet Address, Mobile Number
  assert.match(source, /Merchant ID/, 'Must display Merchant ID');
  assert.match(source, /Stellar Wallet Address/, 'Must display Stellar Wallet Address');
  assert.match(source, /Registered Mobile/, 'Must display Mobile Number');

  // Clipboard copy support
  assert.match(source, /Clipboard\.setStringAsync/, 'Must support copy to clipboard');

  // Safe navigation
  assert.match(source, /router\.canGoBack\(\)/, 'Must verify canGoBack');
});

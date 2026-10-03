export interface ExtractedMerchantMetadata {
  businessName: string;
  businessType: string;
  businessAddress: string;
  contactPerson: string;
  contactNumber: string;
  operatingNotes: string;
}

export interface MerchantProfileFormData {
  businessName: string;
  ownerName: string;
  address: string;
  mobileNumber: string;
  email?: string;
  businessType?: string;
  operatingNotes?: string;
}

export interface MerchantProfileValidationResult {
  isValid: boolean;
  error: string | null;
}

export interface PreparedMerchantProfileUpdates {
  profilesPayload: {
    full_name: string;
    location: string;
    complete_address: string;
    mobile_number: string;
  };
  authMetadataPayload: {
    business_name: string;
    full_name: string;
    owner_name: string;
    contact_person: string;
    location: string;
    business_address: string;
    mobile_number: string;
    contact_number: string;
    business_type?: string;
    business_types?: string[];
    operating_notes?: string;
  };
  merchantEntityPayload: {
    display_name: string;
  };
}

const safeString = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : '';
};

/**
 * Safely extracts merchant metadata from Supabase user_metadata with full fallbacks.
 */
export const extractMerchantMetadata = (metadata: unknown): ExtractedMerchantMetadata => {
  if (!metadata || typeof metadata !== 'object') {
    return {
      businessName: '',
      businessType: '',
      businessAddress: '',
      contactPerson: '',
      contactNumber: '',
      operatingNotes: '',
    };
  }

  const data = metadata as Record<string, unknown>;
  const rawBusinessTypes = Array.isArray(data.business_types) ? data.business_types : [];
  const primaryTypeFromList = typeof rawBusinessTypes[0] === 'string' ? rawBusinessTypes[0] : '';

  return {
    businessName: safeString(data.business_name),
    businessType: safeString(data.business_type) || primaryTypeFromList,
    businessAddress: safeString(data.business_address) || safeString(data.location),
    contactPerson: safeString(data.contact_person) || safeString(data.owner_name) || safeString(data.full_name),
    contactNumber: safeString(data.contact_number) || safeString(data.mobile_number),
    operatingNotes: safeString(data.operating_notes),
  };
};

/**
 * Validates the editable merchant business information form.
 */
export const validateMerchantProfileForm = (
  form: MerchantProfileFormData,
): MerchantProfileValidationResult => {
  if (!form.businessName || !form.businessName.trim()) {
    return { isValid: false, error: 'Business name is required.' };
  }

  if (!form.ownerName || !form.ownerName.trim()) {
    return { isValid: false, error: 'Owner or authorized representative name is required.' };
  }

  if (!form.address || !form.address.trim()) {
    return { isValid: false, error: 'Business address is required.' };
  }

  const cleanPhone = form.mobileNumber?.replace(/[^\d+]/g, '').trim() ?? '';
  if (!cleanPhone || cleanPhone.length < 7) {
    return { isValid: false, error: 'A valid contact phone number is required.' };
  }

  return { isValid: true, error: null };
};

/**
 * Prepares consistent mutation payloads for database and auth metadata updates.
 */
export const buildMerchantProfileUpdatePayloads = (
  form: MerchantProfileFormData,
): PreparedMerchantProfileUpdates => {
  const businessName = form.businessName.trim();
  const ownerName = form.ownerName.trim();
  const address = form.address.trim();
  const mobileNumber = form.mobileNumber.trim();
  const businessType = form.businessType?.trim();
  const operatingNotes = form.operatingNotes?.trim();

  const authMetadata: PreparedMerchantProfileUpdates['authMetadataPayload'] = {
    business_name: businessName,
    full_name: ownerName,
    owner_name: ownerName,
    contact_person: ownerName,
    location: address,
    business_address: address,
    mobile_number: mobileNumber,
    contact_number: mobileNumber,
  };

  if (businessType) {
    authMetadata.business_type = businessType;
    authMetadata.business_types = [businessType];
  }

  if (operatingNotes) {
    authMetadata.operating_notes = operatingNotes;
  }

  return {
    profilesPayload: {
      full_name: ownerName,
      location: address,
      complete_address: address,
      mobile_number: mobileNumber,
    },
    authMetadataPayload: authMetadata,
    merchantEntityPayload: {
      display_name: businessName,
    },
  };
};

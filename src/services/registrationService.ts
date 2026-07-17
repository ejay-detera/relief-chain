import { supabase } from '@/lib/supabase';
import type { OrganizationRegistrationData } from '@/types/organization-registration';
import type { RegistrationStatus, RegistrationSummary } from '@/types/registration';

/**
 * The subset of `OrganizationRegistrationData` a Resubmission actually
 * updates (Requirement 15.1) — organization name, organization type,
 * contact information, and Authorized_Representative details. This mirrors
 * `ResubmitFormData` (`src/components/ApplicationReview/resubmitValidation.ts`)
 * structurally rather than importing it, so this service layer does not
 * depend on the components folder; the two types are kept in sync by both
 * being `Pick`s of the same underlying fields.
 */
export type ResubmissionData = Pick<
  OrganizationRegistrationData,
  'organizationName' | 'organizationType' | 'regionProvinceCity' | 'firstName' | 'lastName' | 'middleInitial' | 'position'
>;

type RegistrationRow = {
  id: string;
  status: RegistrationStatus;
  rejection_reason: string | null;
};

const toRegistrationSummary = (row: RegistrationRow): RegistrationSummary => ({
  id: row.id,
  status: row.status,
  rejectionReason: row.rejection_reason,
});

/**
 * Fetches the authenticated `lgu` user's own `registrations` row. Relies on the
 * "Super_Admin reads all registrations" RLS policy's owning-lgu clause
 * (`lgu_id = auth.uid()`), the same "own row" convention used by
 * `updateOwnProfile` for `profiles`. Returns `null` when no row exists yet
 * (e.g. the profile-creation trigger has not run) rather than throwing.
 */
export const fetchOwnRegistration = async (userId: string): Promise<RegistrationSummary | null> => {
  const { data, error } = await supabase
    .from('registrations')
    .select('id, status, rejection_reason')
    .eq('lgu_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return toRegistrationSummary(data);
};

/**
 * Resubmits a Rejected Registration with edited data (Requirement 15.1, 15.3).
 * Updates the existing row rather than creating a new one, and only succeeds
 * when the row's current status is still `Rejected` (Requirement 15.2); the
 * status-guard trigger sets status back to `Pending` and clears
 * rejection_reason (Requirement 15.4).
 */
export const resubmitRegistration = async (
  registrationId: string,
  data: ResubmissionData,
): Promise<void> => {
  const { error } = await supabase
    .from('registrations')
    .update({
      organization_name: data.organizationName.trim(),
      organization_type: data.organizationType.trim(),
      contact_info: data.regionProvinceCity.trim(),
      representative_first_name: data.firstName.trim(),
      representative_last_name: data.lastName.trim(),
      representative_middle_initial: data.middleInitial.trim() || null,
      representative_position: data.position.trim(),
      status: 'Pending',
      rejection_reason: null,
    })
    .eq('id', registrationId)
    .eq('status', 'Rejected');

  if (error) throw error;
};

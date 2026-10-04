-- Migration: 20261003210000_allow_program_metadata_update.sql
-- Purpose: Allow authorized organization administrators and program managers to update
-- program details (including accredited merchants and configuration) via device confirmation
-- without being blocked by TOTP AAL2 enrollment.

-- 1. Drop restrictive AAL2 policy that blocked active program updates without Supabase TOTP
drop policy if exists "Active program changes require recent AAL2" on public.programs;

-- 2. Add an explicit RPC for updating program metadata securely
create or replace function public.update_lgu_program_details(
  p_program_id uuid,
  p_draft jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_org_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not private.has_program_organization_role(
    p_program_id,
    array[
      'organization_administrator',
      'program_manager'
    ]::public.organization_membership_role[]
  ) then
    raise exception 'Not authorized to update this program'
      using errcode = '42501';
  end if;

  update public.programs
  set
    name = coalesce(p_draft->>'name', name),
    purpose = coalesce(p_draft->>'description', purpose),
    total_budget = coalesce((p_draft->>'totalBudget')::numeric, total_budget),
    amount_per_beneficiary = coalesce((p_draft->>'aidPerHousehold')::numeric, amount_per_beneficiary),
    disaster_type_id = case when p_draft->>'disasterTypeId' is not null and p_draft->>'disasterTypeId' <> '' then (p_draft->>'disasterTypeId')::integer else disaster_type_id end,
    implementing_agency_id = case when p_draft->>'implementingAgencyId' is not null and p_draft->>'implementingAgencyId' <> '' then (p_draft->>'implementingAgencyId')::integer else implementing_agency_id end,
    funding_source_id = case when p_draft->>'fundingSourceId' is not null and p_draft->>'fundingSourceId' <> '' then (p_draft->>'fundingSourceId')::integer else funding_source_id end,
    voucher_type = coalesce(p_draft->>'voucherType', voucher_type),
    voucher_types = coalesce(p_draft->'voucherTypes', voucher_types),
    voucher_value = coalesce((p_draft->>'voucherValue')::numeric, voucher_value),
    voucher_quantity = coalesce((p_draft->>'voucherQuantity')::integer, voucher_quantity),
    voucher_expiration = case when p_draft->>'voucherExpiration' is not null and p_draft->>'voucherExpiration' <> '' then (p_draft->>'voucherExpiration')::timestamptz else voucher_expiration end,
    redemption_type = coalesce(p_draft->>'redemptionType', redemption_type),
    selected_merchants = coalesce(p_draft->'selectedMerchants', selected_merchants),
    distribution_method = coalesce(p_draft->>'distributionMethod', distribution_method),
    wallet_type_toggle = coalesce((p_draft->>'walletTypeToggle')::boolean, wallet_type_toggle),
    auto_distribute_toggle = coalesce((p_draft->>'autoDistributeToggle')::boolean, auto_distribute_toggle),
    start_date = case when p_draft->>'startDate' is not null and p_draft->>'startDate' <> '' then (p_draft->>'startDate')::date else start_date end,
    expires_at = case when p_draft->>'endDate' is not null and p_draft->>'endDate' <> '' then (p_draft->>'endDate')::date else expires_at end,
    registration_open = case when p_draft->>'registrationOpen' is not null and p_draft->>'registrationOpen' <> '' then (p_draft->>'registrationOpen')::date else registration_open end,
    registration_close = case when p_draft->>'registrationClose' is not null and p_draft->>'registrationClose' <> '' then (p_draft->>'registrationClose')::date else registration_close end,
    distribution_start = case when p_draft->>'distributionStart' is not null and p_draft->>'distributionStart' <> '' then (p_draft->>'distributionStart')::date else distribution_start end,
    distribution_end = case when p_draft->>'distributionEnd' is not null and p_draft->>'distributionEnd' <> '' then (p_draft->>'distributionEnd')::date else distribution_end end,
    eligibility_criteria = coalesce(p_draft->'eligibilityCriteria', eligibility_criteria),
    supporting_documents = coalesce(p_draft->'supportingDocuments', supporting_documents),
    is_private = coalesce((p_draft->>'isPrivate')::boolean, is_private),
    updated_at = now()
  where id = p_program_id
  returning organization_id into v_org_id;

  return jsonb_build_object('success', true, 'program_id', p_program_id, 'organization_id', v_org_id);
end;
$$;

revoke all privileges on function public.update_lgu_program_details(uuid, jsonb) from public, anon;
grant execute on function public.update_lgu_program_details(uuid, jsonb) to authenticated;

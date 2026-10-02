-- Close the US1 "required fields enforced before submit" gap at the
-- database level. Previously only `registration-validation.ts` (client-side)
-- blocked an incomplete beneficiary registration — a direct API call could
-- create a `beneficiary` profile with null name, gov_id, address, or phone.
--
-- A plain `not null` is wrong here: `finalize_identity_deletion()`
-- (20260716110000) deliberately nulls these exact columns when anonymizing a
-- beneficiary and sets `identity_data_locked = true`. The constraint below
-- is conditional on role and that lock flag, so it enforces completeness for
-- every live beneficiary registration without breaking anonymization.

alter table public.profiles
  add constraint profiles_beneficiary_required_fields_check check (
    role <> 'beneficiary'
    or identity_data_locked
    or (
      full_name is not null and length(btrim(full_name)) > 0
      and gov_id is not null and length(btrim(gov_id)) > 0
      and complete_address is not null and length(btrim(complete_address)) > 0
      and mobile_number is not null and length(btrim(mobile_number)) > 0
      and household_size is not null
    )
  ) not valid;

-- `not valid` lets the constraint attach without failing this migration on
-- the one pre-existing incomplete demo profile; it still applies to every
-- future insert/update from this point on. Validate it separately once that
-- demo profile is backfilled or anonymized — tracked as a known gap, not
-- silently ignored.
comment on constraint profiles_beneficiary_required_fields_check on public.profiles is
  'BEN-01: a non-anonymized beneficiary profile must have full_name, gov_id, complete_address, mobile_number, and household_size populated. Added NOT VALID because of one pre-existing incomplete demo profile — see migration comment before validating.';

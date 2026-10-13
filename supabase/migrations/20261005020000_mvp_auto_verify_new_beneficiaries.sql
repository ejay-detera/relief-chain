-- MVP-ONLY: automatically verify newly created BENEFICIARY accounts.
--
-- WHY
--   While the product is in its MVP phase, a new beneficiary account was created
--   with profiles.verification_status = 'Pending' (the column default) and the
--   matching beneficiary_identities row was created 'Pending' by the
--   profiles_ensure_beneficiary_identity trigger. Nothing in the app could ever
--   move either row to 'Verified' (an organization cannot see a beneficiary
--   profile before that beneficiary applies, and its Verify action is a
--   profiles UPDATE that RLS turns into a silent 0-row no-op), so new accounts
--   were stuck at Pending and the "Verified" gates downstream (Distribute Aid
--   list, wallet-proof challenge, wallet rotation precondition) could never
--   open for them. For the MVP, new beneficiaries are therefore verified at
--   creation.
--
-- WHAT
--   public.handle_new_user() now inserts verification_status = 'Verified' when,
--   and only when, the server-derived role is 'beneficiary'. Every other role
--   (lgu, merchant, and the 'merchant' fallback for unknown roles) still starts
--   'Pending' exactly as before. The existing trigger
--   profiles_ensure_beneficiary_identity is unchanged: it already copies the
--   profile status into beneficiary_identities, so the identity is created
--   'Verified' too. verified_at and verified_by are left NULL on purpose: no
--   person verified these accounts, and NULL/NULL marks them as auto-verified
--   (heuristic marker only; for an exact cut use created_at >= the time this
--   migration was applied).
--
-- WHAT THIS DOES NOT DO
--   * No backfill: existing Pending profiles and identities are untouched, and
--     the ON CONFLICT branch below deliberately does not rewrite
--     verification_status of an existing row.
--   * No settings flag or feature switch: this is a plain, unconditional change.
--   * It does not weaken, drop, or bypass any append-only, workflow, chain-
--     evidence, or re-verification trigger or any RLS policy. It does not
--     create re-verification evidence (beneficiary_identity_reverifications),
--     which wallet rotation still requires.
--   * It does not change how the role is chosen (raw_user_meta_data ->> 'role').
--
-- HOW TO REVERT (later, with a NEW migration; never edit this file)
--   Add a migration that runs CREATE OR REPLACE FUNCTION public.handle_new_user()
--   with the body from 20261002190000_add_household_size_to_profiles.sql (no
--   verification_status column in the insert list), then restore its original
--   function comment. Execute privileges are preserved by CREATE OR REPLACE.
--   Reverting stops FUTURE auto-verification only. Rows already created
--   'Verified' stay 'Verified' until a deliberate data decision is made, e.g.
--     update public.profiles set verification_status = 'Pending'
--       where role = 'beneficiary' and created_at >= '<this migration applied at>';
--     update public.beneficiary_identities set verification_status = 'Pending'
--       where verified_at is null and verified_by is null
--         and created_at >= '<this migration applied at>';
--   (review before running; those updates are not part of the revert migration).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text;
begin
  requested_role := case
    when new.raw_user_meta_data ->> 'role' in ('lgu', 'beneficiary', 'merchant')
      then new.raw_user_meta_data ->> 'role'
    else 'merchant'
  end;

  insert into public.profiles (
    id,
    role,
    full_name,
    gov_id,
    location,
    stellar_pubkey,
    first_name,
    last_name,
    middle_initial,
    mobile_number,
    sex,
    civil_status,
    birthdate,
    gov_id_url,
    complete_address,
    municipality_city,
    city_id,
    area_id,
    barangay_id,
    household_size,
    verification_status
  )
  values (
    new.id,
    requested_role,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'gov_id', ''),
    nullif(new.raw_user_meta_data ->> 'location', ''),
    nullif(new.raw_user_meta_data ->> 'stellar_pubkey', ''),
    nullif(new.raw_user_meta_data ->> 'first_name', ''),
    nullif(new.raw_user_meta_data ->> 'last_name', ''),
    nullif(new.raw_user_meta_data ->> 'middle_initial', ''),
    nullif(new.raw_user_meta_data ->> 'mobile_number', ''),
    nullif(new.raw_user_meta_data ->> 'sex', ''),
    nullif(new.raw_user_meta_data ->> 'civil_status', ''),
    nullif(new.raw_user_meta_data ->> 'birthdate', ''),
    nullif(new.raw_user_meta_data ->> 'gov_id_url', ''),
    nullif(new.raw_user_meta_data ->> 'complete_address', ''),
    nullif(new.raw_user_meta_data ->> 'municipality_city', ''),
    (new.raw_user_meta_data ->> 'city_id')::integer,
    (new.raw_user_meta_data ->> 'area_id')::integer,
    (new.raw_user_meta_data ->> 'barangay_id')::integer,
    (new.raw_user_meta_data ->> 'household_size')::integer,
    -- MVP-ONLY auto-verification: beneficiary accounts only (see header).
    case when requested_role = 'beneficiary' then 'Verified' else 'Pending' end
  )
  on conflict (id) do update set
    role = excluded.role,
    full_name = excluded.full_name,
    gov_id = excluded.gov_id,
    location = excluded.location,
    stellar_pubkey = excluded.stellar_pubkey,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    middle_initial = excluded.middle_initial,
    mobile_number = excluded.mobile_number,
    sex = excluded.sex,
    civil_status = excluded.civil_status,
    birthdate = excluded.birthdate,
    gov_id_url = excluded.gov_id_url,
    complete_address = excluded.complete_address,
    municipality_city = excluded.municipality_city,
    city_id = excluded.city_id,
    area_id = excluded.area_id,
    barangay_id = excluded.barangay_id,
    household_size = excluded.household_size;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates the profile row from sign-up metadata. MVP-ONLY: a newly created beneficiary profile starts Verified (the profiles_ensure_beneficiary_identity trigger copies that to beneficiary_identities); every other role starts Pending. verified_at/verified_by stay NULL. Revert with a new migration restoring the 20261002190000 body.';

-- Close the US1 "household composition" gap: BEN-01 lists name, address,
-- household composition, and valid ID as the required fields before a
-- beneficiary can submit — household composition was entirely absent from
-- the data model, the registration form, and client-side validation.
--
-- This adds `household_size` as a simple positive integer (total people in
-- the household, including the applicant) rather than a full dependents
-- roster — the sprint backlog's own acceptance criterion only asks for
-- "household composition" generically, and a single count is the smallest
-- change that satisfies "required field... must be completed before I can
-- submit" without inventing an unrequested dependents-detail UI.

alter table public.profiles
  add column if not exists household_size integer
    check (household_size is null or (household_size >= 1 and household_size <= 50));

comment on column public.profiles.household_size is
  'Total number of people in the beneficiary''s household, including themselves. Collected at registration (BEN-01).';

-- Redefine handle_new_user() once more to also populate household_size from
-- signup metadata, following the exact pattern of every prior redefinition
-- in this chain (20260714130000, 20260715020000).
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
    household_size
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
    (new.raw_user_meta_data ->> 'household_size')::integer
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

-- Add structured location columns to profiles so a Beneficiary's residence can be
-- matched against a Program's assigned barangays/areas for eligibility checks.
alter table public.profiles
add column if not exists city_id integer references public.cities(id),
add column if not exists area_id integer references public.areas(id),
add column if not exists barangay_id integer references public.barangays(id);

-- Redefine handle_new_user() to also populate the new location id columns from
-- signup metadata (previously collected in the registration form but discarded).
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
    barangay_id
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
    (new.raw_user_meta_data ->> 'barangay_id')::integer
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
    barangay_id = excluded.barangay_id;

  return new;
end;
$$;

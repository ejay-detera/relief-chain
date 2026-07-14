-- Alter profiles table to add beneficiary-specific columns
alter table public.profiles
add column if not exists first_name text,
add column if not exists last_name text,
add column if not exists middle_initial text,
add column if not exists mobile_number text,
add column if not exists sex text,
add column if not exists civil_status text,
add column if not exists birthdate text,
add column if not exists gov_id_url text,
add column if not exists complete_address text,
add column if not exists municipality_city text;

-- Create helper function to check if user is an LGU (security definer to bypass RLS and avoid recursion)
create or replace function public.is_lgu(user_id uuid)
returns boolean
security definer
set search_path = ''
language plpgsql
as $$
begin
  return exists (
    select 1 from public.profiles
    where id = user_id and role = 'lgu'
  );
end;
$$;

-- Redefine handle_new_user() trigger function to populate new fields
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
    municipality_city
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
    nullif(new.raw_user_meta_data ->> 'municipality_city', '')
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
    municipality_city = excluded.municipality_city;

  return new;
end;
$$;

-- Create the valid_ids storage bucket
insert into storage.buckets (id, name, public)
values ('valid_ids', 'valid_ids', false)
on conflict (id) do nothing;

-- Storage policies for valid_ids bucket
drop policy if exists "Allow public uploads to valid_ids" on storage.objects;
create policy "Allow public uploads to valid_ids"
on storage.objects for insert
with check (bucket_id = 'valid_ids');

drop policy if exists "Allow LGU and owner to read IDs" on storage.objects;
create policy "Allow LGU and owner to read IDs"
on storage.objects for select
using (
  bucket_id = 'valid_ids'
  and (
    public.is_lgu(auth.uid())
    or
    exists (
      select 1 from public.profiles
      where id = auth.uid() and gov_id_url = name
    )
  )
);

-- Profiles policy for LGU access
drop policy if exists "LGU can view all profiles" on public.profiles;
create policy "LGU can view all profiles"
on public.profiles for select
using (
  public.is_lgu(auth.uid())
);

-- Create the initial organization registration after the profile signup trigger
-- has created an LGU profile. The submitted values are kept in auth.users
-- raw_user_meta_data, which is the same payload used by the mobile sign-up flow.
create or replace function public.create_registration_on_lgu_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_metadata jsonb;
begin
  if new.role is distinct from 'lgu' then
    return new;
  end if;

  select coalesce(raw_user_meta_data, '{}'::jsonb)
    into user_metadata
    from auth.users
   where id = new.id;

  insert into public.registrations (
    lgu_id,
    organization_name,
    organization_type,
    contact_info,
    representative_first_name,
    representative_last_name,
    representative_middle_initial,
    representative_position,
    document_reference,
    status
  )
  values (
    new.id,
    nullif(user_metadata ->> 'organization_name', ''),
    nullif(user_metadata ->> 'organization_type', ''),
    nullif(user_metadata ->> 'location', ''),
    nullif(user_metadata ->> 'representative_first_name', ''),
    nullif(user_metadata ->> 'representative_last_name', ''),
    nullif(user_metadata ->> 'representative_middle_initial', ''),
    nullif(user_metadata ->> 'representative_position', ''),
    coalesce(
      nullif(user_metadata ->> 'organization_document_reference', ''),
      nullif(user_metadata ->> 'organization_document_name', '')
    ),
    'Pending'
  )
  on conflict (lgu_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_lgu_profile_created on public.profiles;
create trigger on_lgu_profile_created
after insert on public.profiles
for each row
execute procedure public.create_registration_on_lgu_signup();

-- Registration rows created through any path must begin Pending. This is an
-- INSERT-only invariant; status transitions remain the responsibility of the
-- separate status-guard migration.
create or replace function public.enforce_pending_registration_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.status := 'Pending';
  new.rejection_reason := null;
  return new;
end;
$$;

drop trigger if exists registrations_pending_on_insert on public.registrations;
create trigger registrations_pending_on_insert
before insert on public.registrations
for each row
execute procedure public.enforce_pending_registration_insert();

-- Extend profile roles for platform Super Admin accounts.
alter table public.profiles
drop constraint if exists profiles_role_check;

alter table public.profiles
add constraint profiles_role_check
check (role in ('lgu', 'beneficiary', 'merchant', 'super_admin'));

-- Security-definer helper used by Supabase policies to check Super Admin access
-- without recursively evaluating the profiles table's row-level security policy.
create or replace function public.is_super_admin(user_id uuid)
returns boolean
security definer
set search_path = ''
language plpgsql
as $$
begin
  return exists (
    select 1 from public.profiles
    where id = user_id and role = 'super_admin'
  );
end;
$$;

-- Seed credentials for the login-only relief-chain-web Super Admin account:
-- email: superadmin@reliefchain.app
-- password: ReliefChainSuperAdmin!2026
--
do $$
declare
  seeded_email constant text := 'superadmin@reliefchain.app';
  seeded_user_id uuid;
begin
  -- Resolve the existing auth user first so applying this seed again never
  -- creates another user for the same seeded identity.
  select id
    into seeded_user_id
    from auth.users
   where lower(email) = lower(seeded_email)
   limit 1;

  if seeded_user_id is null then
    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change,
      email_change_token_current,
      phone_change,
      phone_change_token,
      reauthentication_token,
      created_at,
      updated_at
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      seeded_email,
      crypt('ReliefChainSuperAdmin!2026', gen_salt('bf')),
      now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('role', 'super_admin', 'full_name', 'Relief Chain Super Admin'),
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      now(),
      now()
    )
    returning id into seeded_user_id;
  end if;

  -- Direct auth.users inserts do not reliably create the email identity row.
  -- Insert it only when absent; the predicate makes reruns idempotent without
  -- depending on a generated-column or constraint name in auth.identities.
  -- provider_id must be set explicitly (it is NOT NULL and not derived from
  -- identity_data automatically on this Supabase Auth schema version), and
  -- created_at/updated_at must be non-null or GoTrue's login query fails
  -- with "Database error querying schema" when scanning the row.
  insert into auth.identities (provider_id, user_id, provider, identity_data, created_at, updated_at)
  select seeded_user_id::text,
         seeded_user_id,
         'email',
         jsonb_build_object('sub', seeded_user_id::text, 'email', seeded_email),
         now(),
         now()
   where not exists (
     select 1
       from auth.identities
      where user_id = seeded_user_id
        and provider = 'email'
   );

  -- The signup trigger may have created a profile already; in either case,
  -- ensure this seeded identity has the required role without duplicating it.
  insert into public.profiles (id, role, full_name)
  values (seeded_user_id, 'super_admin', 'Relief Chain Super Admin')
  on conflict (id) do update
    set role = 'super_admin',
        full_name = excluded.full_name;
end
$$;

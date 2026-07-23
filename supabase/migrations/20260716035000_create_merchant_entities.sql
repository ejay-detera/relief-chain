-- Create merchant_entities table early so it can be referenced by later RLS policies

create table if not exists public.merchant_entities (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references auth.users(id) on delete set null,
  display_name text not null check (length(btrim(display_name)) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed existing merchant profiles
insert into public.merchant_entities (profile_id, display_name)
select profile.id, coalesce(nullif(btrim(profile.full_name), ''), 'Merchant')
from public.profiles profile
where profile.role = 'merchant'
on conflict (profile_id) do nothing;

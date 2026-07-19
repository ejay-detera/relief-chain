-- Record denied access attempts against organization registrations.
create table if not exists public.registration_access_denials (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid,
  operation    text not null check (operation in ('select', 'update')),
  attempted_at timestamptz not null default now()
);

alter table public.registration_access_denials enable row level security;

-- RLS policies can call this helper to record a denied attempt without exposing
-- the audit table to callers. The empty search_path prevents object shadowing.
create or replace function public.log_registration_access_denial(op text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.registration_access_denials (requester_id, operation)
  values (auth.uid(), op);
end;
$$;

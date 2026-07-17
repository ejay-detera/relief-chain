-- Fix authenticated read grants for profiles and programs
-- Do not grant private program or profile access to anon.
-- RLS policies must remain the authoritative row filter.

grant select on table public.profiles to authenticated;
grant select on table public.programs to authenticated, service_role;

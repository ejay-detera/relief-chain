-- Add CRUD grants for authenticated users to standard operational tables
-- RLS policies will enforce the actual row-level permissions.

grant insert, update, delete on table public.programs to authenticated;
grant insert, update, delete on table public.enrollments to authenticated;
grant update on table public.profiles to authenticated;

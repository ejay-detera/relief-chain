-- Grant SELECT on registrations to authenticated role.
-- The table enables RLS but was missing the underlying table-level privilege.
-- RLS policies already restrict rows to super_admin or lgu_id = auth.uid().
grant select on table public.registrations to authenticated;
grant update on table public.registrations to authenticated;

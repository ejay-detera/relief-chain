-- Restrict organization registration reads and updates by role and ownership.
-- The initial LGU registration row is created by the task 3 profile trigger;
-- there is intentionally no direct INSERT policy here.

drop policy if exists "Super_Admin reads all registrations" on public.registrations;
create policy "Super_Admin reads all registrations"
on public.registrations
for select
to authenticated
using (
  public.is_super_admin(auth.uid())
  or lgu_id = auth.uid()
);

drop policy if exists "Super_Admin updates registrations" on public.registrations;
create policy "Super_Admin updates registrations"
on public.registrations
for update
to authenticated
using (
  public.is_super_admin(auth.uid())
)
with check (
  public.is_super_admin(auth.uid())
);

drop policy if exists "Owning lgu updates own registration for resubmission" on public.registrations;
create policy "Owning lgu updates own registration for resubmission"
on public.registrations
for update
to authenticated
using (
  lgu_id = auth.uid()
  and status = 'Rejected'
)
with check (
  lgu_id = auth.uid()
  and status = 'Pending'
  and rejection_reason is null
);

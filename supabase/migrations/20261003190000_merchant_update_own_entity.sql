-- Allow merchants to update their own merchant entity record (display_name, updated_at)
grant update (display_name, updated_at) on table public.merchant_entities to authenticated;

drop policy if exists "Merchants can update own entity" on public.merchant_entities;
create policy "Merchants can update own entity"
on public.merchant_entities for update to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));

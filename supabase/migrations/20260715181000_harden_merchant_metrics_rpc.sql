grant insert, update on table public.merchant_metrics to authenticated;

drop policy if exists "Merchants can insert own metrics" on public.merchant_metrics;
create policy "Merchants can insert own metrics"
on public.merchant_metrics
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = merchant_id
  and exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'merchant'
  )
);

drop policy if exists "Merchants can update own metrics" on public.merchant_metrics;
create policy "Merchants can update own metrics"
on public.merchant_metrics
for update
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = merchant_id)
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = merchant_id
  and exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'merchant'
  )
);

alter function public.get_or_create_merchant_metrics() security invoker;
alter function public.record_demo_merchant_redemption() security invoker;

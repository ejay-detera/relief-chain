create table public.merchant_metrics (
  merchant_id uuid primary key references public.profiles(id) on delete cascade,
  vouchers_processed integer not null default 1248 check (vouchers_processed >= 0),
  total_sales numeric(14, 2) not null default 142800 check (total_sales >= 0),
  updated_at timestamptz not null default now()
);

alter table public.merchant_metrics enable row level security;

revoke all on table public.merchant_metrics from public;
revoke all on table public.merchant_metrics from anon;
revoke all on table public.merchant_metrics from authenticated;
grant select on table public.merchant_metrics to authenticated;

create policy "Merchants can select own metrics"
on public.merchant_metrics
for select
to authenticated
using ((select auth.uid()) = merchant_id);

create function public.get_or_create_merchant_metrics()
returns public.merchant_metrics
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  result public.merchant_metrics;
begin
  if current_user_id is null or not exists (
    select 1 from public.profiles
    where id = current_user_id and role = 'merchant'
  ) then
    raise exception 'Only authenticated merchants can access merchant metrics.' using errcode = '42501';
  end if;

  insert into public.merchant_metrics (merchant_id)
  values (current_user_id)
  on conflict (merchant_id) do nothing;

  select * into result from public.merchant_metrics where merchant_id = current_user_id;
  return result;
end;
$$;
create function public.record_demo_merchant_redemption()
returns public.merchant_metrics
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  result public.merchant_metrics;
begin
  if current_user_id is null or not exists (
    select 1 from public.profiles
    where id = current_user_id and role = 'merchant'
  ) then
    raise exception 'Only authenticated merchants can record merchant redemptions.' using errcode = '42501';
  end if;

  insert into public.merchant_metrics (
    merchant_id,
    vouchers_processed,
    total_sales,
    updated_at
  ) values (
    current_user_id,
    1249,
    143300,
    now()
  )
  on conflict (merchant_id) do update set
    vouchers_processed = public.merchant_metrics.vouchers_processed + 1,
    total_sales = public.merchant_metrics.total_sales + 500,
    updated_at = now()
  returning * into result;

  return result;
end;
$$;

revoke execute on function public.get_or_create_merchant_metrics() from public;
revoke execute on function public.get_or_create_merchant_metrics() from anon;
grant execute on function public.get_or_create_merchant_metrics() to authenticated;

revoke execute on function public.record_demo_merchant_redemption() from public;
revoke execute on function public.record_demo_merchant_redemption() from anon;
grant execute on function public.record_demo_merchant_redemption() to authenticated;

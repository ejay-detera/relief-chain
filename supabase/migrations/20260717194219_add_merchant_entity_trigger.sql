-- Create trigger to automatically insert into merchant_entities when a merchant profile is created
create or replace function public.handle_merchant_profile_created()
returns trigger
security definer set search_path = public
language plpgsql
as $$
begin
  if new.role = 'merchant' then
    insert into public.merchant_entities (profile_id, display_name)
    values (
      new.id,
      coalesce(nullif(btrim(new.full_name), ''), 'Merchant')
    )
    on conflict (profile_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_merchant_profile_created on public.profiles;
create trigger on_merchant_profile_created
after insert on public.profiles
for each row execute function public.handle_merchant_profile_created();

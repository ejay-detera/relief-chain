create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text;
begin
  requested_role := case
    when new.raw_user_meta_data ->> 'role' in ('lgu', 'beneficiary', 'merchant')
      then new.raw_user_meta_data ->> 'role'
    else 'merchant'
  end;

  insert into public.profiles (
    id,
    role,
    full_name,
    gov_id,
    location,
    stellar_pubkey
  )
  values (
    new.id,
    requested_role,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'gov_id', ''),
    nullif(new.raw_user_meta_data ->> 'location', ''),
    nullif(new.raw_user_meta_data ->> 'stellar_pubkey', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
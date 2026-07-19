-- Allow merchants to view beneficiary profiles for verification activities

-- Helper function to get current user's role without triggering RLS recursion
create or replace function private.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

grant execute on function private.current_user_role() to authenticated;

create policy "Merchants can view beneficiary profiles"
on public.profiles for select to authenticated
using (
  private.current_user_role() = 'merchant'
  and role = 'beneficiary'
);

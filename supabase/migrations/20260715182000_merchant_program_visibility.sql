drop policy if exists "Merchants can view available programs" on public.programs;
create policy "Merchants can view available programs"
on public.programs
for select
to authenticated
using (
  status <> 'draft'
  and exists (
    select 1
    from public.profiles merchant_profile
    where merchant_profile.id = (select auth.uid())
      and merchant_profile.role = 'merchant'
      and (
        jsonb_array_length(coalesce(programs.selected_merchants, '[]'::jsonb)) = 0
        or exists (
          select 1
          from jsonb_array_elements_text(
            coalesce(programs.selected_merchants, '[]'::jsonb)
          ) selected(merchant_name)
          where lower(btrim(selected.merchant_name))
            = lower(btrim(coalesce(merchant_profile.full_name, '')))
        )
      )
  )
);
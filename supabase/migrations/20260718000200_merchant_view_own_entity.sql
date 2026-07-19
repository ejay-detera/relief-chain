-- Allow merchants to view their own merchant entity

create policy "Merchants can view own entity"
on public.merchant_entities for select to authenticated
using (profile_id = auth.uid());

create policy "Organization members can update merchant accreditations"
on public.merchant_accreditations for update
using (private.is_organization_member(organization_id))
with check (private.is_organization_member(organization_id));

create policy "Merchants can insert their own accreditations"
on public.merchant_accreditations for insert
with check (private.is_merchant_profile(merchant_id));

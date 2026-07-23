-- Allow wallet owners to update their own wallet addresses (needed for dev wallet auto-healing)

create policy "Merchant owners can update own wallets"
on public.wallets for update to authenticated
using (
  owner_type = 'merchant_entity'
  and exists (
    select 1 from public.merchant_entities merchant
    where merchant.id = owner_id
      and merchant.profile_id = auth.uid()
  )
)
with check (
  owner_type = 'merchant_entity'
  and exists (
    select 1 from public.merchant_entities merchant
    where merchant.id = owner_id
      and merchant.profile_id = auth.uid()
  )
);

create policy "Beneficiary owners can update own wallets"
on public.wallets for update to authenticated
using (
  owner_type = 'beneficiary_identity'
  and exists (
    select 1 from public.beneficiary_identities identity
    where identity.id = owner_id
      and identity.user_id = auth.uid()
  )
)
with check (
  owner_type = 'beneficiary_identity'
  and exists (
    select 1 from public.beneficiary_identities identity
    where identity.id = owner_id
      and identity.user_id = auth.uid()
  )
);

create policy "User owners can update own wallets"
on public.wallets for update to authenticated
using (
  owner_type = 'user'
  and owner_id = auth.uid()
)
with check (
  owner_type = 'user'
  and owner_id = auth.uid()
);

DROP POLICY IF EXISTS "Owners and scoped organization members can view wallets" ON public.wallets;
CREATE POLICY "Owners and scoped organization members can view wallets"
ON public.wallets FOR SELECT TO authenticated
USING (
  (select auth.uid()) is not null
  and (
    (owner_type = 'user' and owner_id = (select auth.uid()))
    or (
      owner_type = 'beneficiary_identity'
      and (
        exists (
          select 1 from public.beneficiary_identities identity
          where identity.id = owner_id
            and identity.user_id = (select auth.uid())
        )
        or private.is_beneficiary_identity_organization_member(owner_id)
      )
    )
    or (
      owner_type = 'merchant_entity'
      and (
        exists (
          select 1 from public.merchant_entities merchant
          where merchant.id = owner_id
            and merchant.profile_id = (select auth.uid())
        )
      )
    )
    or (
      owner_type = 'organization'
      and private.is_organization_member(owner_id)
    )
  )
);

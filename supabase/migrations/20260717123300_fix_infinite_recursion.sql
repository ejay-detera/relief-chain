CREATE OR REPLACE FUNCTION private.is_merchant_profile(p_merchant_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.merchant_entities
    WHERE id = p_merchant_id AND profile_id = (select auth.uid())
  );
$$;

DROP POLICY IF EXISTS "Organization members can view merchant accreditations" ON public.merchant_accreditations;
CREATE POLICY "Organization members can view merchant accreditations"
ON public.merchant_accreditations FOR SELECT TO authenticated
USING (
  private.is_organization_member(organization_id)
  OR private.is_merchant_profile(merchant_id)
);

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
      and private.is_merchant_profile(owner_id)
    )
    or (
      owner_type = 'organization'
      and private.is_organization_member(owner_id)
    )
  )
);

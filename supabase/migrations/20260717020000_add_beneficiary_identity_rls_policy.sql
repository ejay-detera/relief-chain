-- Add RLS policy to allow beneficiaries to view their own beneficiary identity row.
-- This is also required for beneficiaries to view their own wallets mapped under their beneficiary identity.

create policy "Beneficiaries can view own beneficiary identity"
on public.beneficiary_identities for select to authenticated
using (user_id = (select auth.uid()));

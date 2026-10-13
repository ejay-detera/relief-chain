-- Let a signed-in user read the geography (barangay and area restrictions) of
-- programs they can already discover, so Find Organization can show the real
-- coverage instead of defaulting every program to "Open to all locations".
--
-- Until now program_barangays / program_areas had only organization-member
-- SELECT policies, so the app's embed of both tables was always empty for a
-- beneficiary. The database still enforced the real barangay list at
-- enrollment insert (private.is_program_geo_eligible, 20261002120000), which
-- surfaced as a raw RLS error on Apply.
--
-- Scope is exactly the predicate family of the existing discovery policy on
-- public.programs ("Beneficiaries can discover active programs to apply"):
-- the program must be active AND public-or-invited. Geography of draft,
-- closed, or non-invited private programs stays hidden. Read access only; the
-- table grants (select to authenticated) already exist from
-- 20260716051000_harden_financial_mutation_paths.sql.

create policy "Beneficiaries can view geography of discoverable programs"
on public.program_barangays for select
to authenticated
using (
  private.is_active_program(program_id)
  and private.is_program_privacy_eligible(program_id, (select auth.uid()))
);

create policy "Beneficiaries can view areas of discoverable programs"
on public.program_areas for select
to authenticated
using (
  private.is_active_program(program_id)
  and private.is_program_privacy_eligible(program_id, (select auth.uid()))
);

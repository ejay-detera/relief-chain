-- Beneficiaries could not discover any program to apply to.
--
-- `public.programs` had only two SELECT policies: "Organization members can
-- view programs" (staff of the owning org) and "Program participants can view
-- programs" (`private.is_program_participant`, which requires an EXISTING
-- enrollment). No policy ever granted a beneficiary visibility into an active
-- program they have not yet applied to, so `find-organization.tsx`'s query
-- (`programs.select(...).eq('status','active')`) always returned an empty set
-- for a beneficiary with no prior enrollments — the entire apply-to-a-program
-- flow was unreachable regardless of seeded data.
--
-- `private.is_active_program()` already exists and is trusted elsewhere (the
-- enrollment INSERT check policy), so this adds the matching READ policy: any
-- authenticated user may see a program once, and only once, it is `active`.
-- Draft/funding/closed programs, budgets, and organization-internal detail
-- remain gated by the existing organization-member policy.
create policy "Beneficiaries can discover active programs to apply"
on public.programs for select
to authenticated
using (status = 'active');

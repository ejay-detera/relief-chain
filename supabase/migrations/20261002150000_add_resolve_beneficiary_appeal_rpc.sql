-- Atomic appeal resolution.
--
-- `resolveAppeal()` in `src/services/appeal-service.ts` previously performed
-- the appeal status update and the enrollment reopen (on approval) as two
-- separate, sequential `.update()` calls from the client. If the app
-- crashed, lost connectivity, or the second call failed for any reason
-- between them, an appeal could be left marked 'approved' with its
-- enrollment never reopened — silently stuck. Wrapping both writes in one
-- `security definer` function makes the transition atomic from the caller's
-- point of view, matching the pattern already used for
-- `mark_distribution_recipient_submitted()`
-- (20260924010000_atomic_recipient_submitted_transition.sql).
--
-- This function is `security definer` because reopening `enrollments` must
-- be done by someone with reviewer authority over the appeal's program, not
-- blanket enrollment-write access — so the organization-membership check
-- below stands in for the RLS policy that would otherwise gate the
-- `enrollments` update directly.
create or replace function public.resolve_beneficiary_appeal(
  p_appeal_id uuid,
  p_decision text,
  p_reviewer_notes text default null
)
returns public.beneficiary_appeals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appeal public.beneficiary_appeals;
  v_is_member boolean;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'invalid appeal decision: %', p_decision using errcode = '22023';
  end if;

  select * into v_appeal from public.beneficiary_appeals where id = p_appeal_id;
  if v_appeal.id is null then
    raise exception 'appeal not found' using errcode = 'P0002';
  end if;

  select exists (
    select 1
    from public.programs p
    join public.organization_memberships m on m.organization_id = p.organization_id
    where p.id = v_appeal.program_id
      and m.user_id = (select auth.uid())
      and m.is_active
  ) into v_is_member;

  if not v_is_member then
    raise exception 'not authorized to resolve this appeal' using errcode = '42501';
  end if;

  if p_decision = 'rejected' and (p_reviewer_notes is null or length(btrim(p_reviewer_notes)) = 0) then
    raise exception 'reviewer notes are required when rejecting an appeal' using errcode = '23514';
  end if;

  update public.beneficiary_appeals
  set
    status = p_decision,
    reviewer_notes = p_reviewer_notes,
    reviewed_by = (select auth.uid()),
    reviewed_at = now(),
    updated_at = now()
  where id = p_appeal_id
  returning * into v_appeal;

  if p_decision = 'approved' and v_appeal.enrollment_id is not null then
    update public.enrollments
    set approval_status = 'Pending', rejection_remarks = null
    where id = v_appeal.enrollment_id;
  end if;

  return v_appeal;
end;
$$;

revoke all privileges on function public.resolve_beneficiary_appeal(uuid, text, text)
  from public, anon;
grant execute on function public.resolve_beneficiary_appeal(uuid, text, text)
  to authenticated, service_role;

comment on function public.resolve_beneficiary_appeal(uuid, text, text) is
  'Atomically updates a beneficiary_appeals row and, on approval, reopens the linked enrollment to Pending in the same transaction. Requires the caller to be an active member of the appeal''s program organization, and requires reviewer_notes when rejecting.';

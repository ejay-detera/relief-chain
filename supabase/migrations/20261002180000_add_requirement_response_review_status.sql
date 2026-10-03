-- Close the US8 per-requirement review granularity gap.
--
-- `enrollment_requirement_responses` previously had no status column at
-- all — org reviewers approved/rejected the whole enrollment via
-- `ProgramApplicantsSection`/`updateEnrollmentStatus`, with no way to mark
-- "this specific requirement response was verified" vs. "that one was
-- rejected." Beneficiaries likewise had no way to see per-requirement
-- feedback — only the overall application status. This adds the status
-- column, a reviewer-attribution trail, and the RLS to let org members
-- review-and-mark individual responses while beneficiaries continue to
-- read (but never write) that status.

alter table public.enrollment_requirement_responses
  add column if not exists status text not null default 'submitted'
    check (status in ('submitted', 'verified', 'rejected')),
  add column if not exists reviewer_notes text,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add constraint enrollment_requirement_responses_review_state_check check (
    (status = 'submitted' and reviewed_by is null and reviewed_at is null)
    or (status in ('verified', 'rejected') and reviewed_by is not null and reviewed_at is not null)
  );

-- Org members (the same membership scope already granted read/write on
-- `program_requirements` and update on `enrollments`) may review individual
-- responses. Beneficiaries keep their existing own-response select/insert
-- policies from 20261001190000 — unaffected by this migration — and can now
-- also see the review fields on their own rows via that same policy.
drop policy if exists "Org members can review requirement responses" on public.enrollment_requirement_responses;
create policy "Org members can review requirement responses"
  on public.enrollment_requirement_responses for select
  to authenticated
  using (
    exists (
      select 1 from public.enrollments e
      join public.programs p on p.id = e.program_id
      join public.organization_memberships m on m.organization_id = p.organization_id
      where e.id = enrollment_requirement_responses.enrollment_id
        and m.user_id = (select auth.uid())
        and m.is_active
    )
  );

drop policy if exists "Org members can update requirement response review status" on public.enrollment_requirement_responses;
create policy "Org members can update requirement response review status"
  on public.enrollment_requirement_responses for update
  to authenticated
  using (
    exists (
      select 1 from public.enrollments e
      join public.programs p on p.id = e.program_id
      join public.organization_memberships m on m.organization_id = p.organization_id
      where e.id = enrollment_requirement_responses.enrollment_id
        and m.user_id = (select auth.uid())
        and m.is_active
    )
  );

comment on column public.enrollment_requirement_responses.status is
  'Per-requirement review verdict: submitted (default, awaiting review) -> verified / rejected by an org reviewer. Independent of the enrollment''s overall approval_status.';

-- ---------------------------------------------------------------------------
-- Atomic, authorization-checked review RPC — mirrors the pattern used for
-- `resolve_beneficiary_appeal()` so the client cannot forge `reviewed_by`/
-- `reviewed_at` (the UPDATE RLS policy alone would let any org member set
-- those columns to arbitrary values via a direct `.update()` call).
-- ---------------------------------------------------------------------------
create or replace function public.review_requirement_response(
  p_response_id uuid,
  p_status text,
  p_reviewer_notes text default null
)
returns public.enrollment_requirement_responses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_response public.enrollment_requirement_responses;
  v_is_member boolean;
begin
  if p_status not in ('verified', 'rejected') then
    raise exception 'invalid requirement review status: %', p_status using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.enrollment_requirement_responses r
    join public.enrollments e on e.id = r.enrollment_id
    join public.programs p on p.id = e.program_id
    join public.organization_memberships m on m.organization_id = p.organization_id
    where r.id = p_response_id
      and m.user_id = (select auth.uid())
      and m.is_active
  ) into v_is_member;

  if not v_is_member then
    raise exception 'not authorized to review this requirement response' using errcode = '42501';
  end if;

  if p_status = 'rejected' and (p_reviewer_notes is null or length(btrim(p_reviewer_notes)) = 0) then
    raise exception 'reviewer notes are required when rejecting a requirement response' using errcode = '23514';
  end if;

  update public.enrollment_requirement_responses
  set
    status = p_status,
    reviewer_notes = p_reviewer_notes,
    reviewed_by = (select auth.uid()),
    reviewed_at = now()
  where id = p_response_id
  returning * into v_response;

  if v_response.id is null then
    raise exception 'requirement response not found' using errcode = 'P0002';
  end if;

  return v_response;
end;
$$;

revoke all privileges on function public.review_requirement_response(uuid, text, text)
  from public, anon;
grant execute on function public.review_requirement_response(uuid, text, text)
  to authenticated, service_role;

comment on function public.review_requirement_response(uuid, text, text) is
  'Marks a single enrollment_requirement_responses row verified/rejected with reviewer attribution, scoped to org members of the response''s program. Requires reviewer_notes when rejecting.';

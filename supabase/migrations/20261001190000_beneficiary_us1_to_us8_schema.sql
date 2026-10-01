-- Beneficiary features expansion: US1 through US8
-- 1. Rejection remarks on enrollments
alter table public.enrollments
  add column if not exists rejection_remarks text;

-- 2. Private program flag for targeted/invite-only distribution
alter table public.programs
  add column if not exists is_private boolean not null default false;

-- 3. Expand notifications type check
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (
    type in (
      'application_submitted',
      'application_approved',
      'application_rejected',
      'new_applicant',
      'merchant_payment_received',
      'aid_released',
      'appeal_submitted',
      'appeal_decision'
    )
  );

-- 4. Beneficiary appeals
create table if not exists public.beneficiary_appeals (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  beneficiary_id uuid not null references public.profiles(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  reason text not null check (length(btrim(reason)) between 5 and 2000),
  document_urls text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'under_review', 'approved', 'rejected')),
  reviewer_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.beneficiary_appeals enable row level security;

create policy "Beneficiaries can view own appeals"
  on public.beneficiary_appeals for select
  to authenticated
  using (beneficiary_id = (select auth.uid()));

create policy "Beneficiaries can insert own appeals"
  on public.beneficiary_appeals for insert
  to authenticated
  with check (beneficiary_id = (select auth.uid()));

create policy "Org members can view appeals"
  on public.beneficiary_appeals for select
  to authenticated
  using (
    exists (
      select 1 from public.programs p
      join public.organization_memberships m on m.organization_id = p.organization_id
      where p.id = beneficiary_appeals.program_id
        and m.user_id = (select auth.uid())
        and m.is_active
    )
  );

create policy "Org members can update appeals"
  on public.beneficiary_appeals for update
  to authenticated
  using (
    exists (
      select 1 from public.programs p
      join public.organization_memberships m on m.organization_id = p.organization_id
      where p.id = beneficiary_appeals.program_id
        and m.user_id = (select auth.uid())
        and m.is_active
    )
  );

grant select, insert, update on table public.beneficiary_appeals to authenticated;

-- 5. Dynamic program requirements and beneficiary responses
create table if not exists public.program_requirements (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  label text not null check (length(btrim(label)) between 1 and 200),
  description text,
  type text not null default 'document' check (type in ('document', 'text', 'number', 'boolean')),
  is_mandatory boolean not null default true,
  allowed_file_types text[] default array['png','jpg','jpeg','pdf','docx'],
  created_at timestamptz not null default now()
);

alter table public.program_requirements enable row level security;

create policy "Anyone authenticated can view program requirements"
  on public.program_requirements for select
  to authenticated
  using (true);

create policy "Org members can manage program requirements"
  on public.program_requirements for all
  to authenticated
  using (
    exists (
      select 1 from public.programs p
      join public.organization_memberships m on m.organization_id = p.organization_id
      where p.id = program_requirements.program_id
        and m.user_id = (select auth.uid())
        and m.is_active
    )
  );

grant select, insert, update, delete on table public.program_requirements to authenticated;

create table if not exists public.enrollment_requirement_responses (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  requirement_id uuid not null references public.program_requirements(id) on delete cascade,
  value text,
  file_url text,
  created_at timestamptz not null default now(),
  unique (enrollment_id, requirement_id)
);

alter table public.enrollment_requirement_responses enable row level security;

create policy "Beneficiaries can view own requirement responses"
  on public.enrollment_requirement_responses for select
  to authenticated
  using (
    exists (
      select 1 from public.enrollments e
      where e.id = enrollment_id and e.beneficiary_id = (select auth.uid())
    )
  );

create policy "Beneficiaries can insert own requirement responses"
  on public.enrollment_requirement_responses for insert
  to authenticated
  with check (
    exists (
      select 1 from public.enrollments e
      where e.id = enrollment_id and e.beneficiary_id = (select auth.uid())
    )
  );

grant select, insert, update on table public.enrollment_requirement_responses to authenticated;

-- 6. Pending SMS invitations for bulk imported beneficiaries
create table if not exists public.pending_sms_invites (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  phone_number text not null,
  full_name text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'registered', 'failed')),
  invite_code text unique,
  created_at timestamptz not null default now()
);

alter table public.pending_sms_invites enable row level security;

create policy "Org members can view pending invites"
  on public.pending_sms_invites for select
  to authenticated
  using (true);

create policy "Org members can insert pending invites"
  on public.pending_sms_invites for insert
  to authenticated
  with check (true);

grant select, insert, update on table public.pending_sms_invites to authenticated;

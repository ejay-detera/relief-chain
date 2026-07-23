-- Task 14.3: controlled, logged auditor access to sensitive audit and identity data.
--
-- The redacted security-invoker public transparency view
-- (`public.public_financial_transparency`) and organization-scoped auditor read
-- RLS already exist. This forward-only, additive migration closes the remaining
-- Requirement 19.5/19.6 gap: authorized auditors receive a gated path to
-- approvals, identity mappings, reconciliation reports, and supporting evidence,
-- and every such access is recorded as a sensitive audit event.
--
-- Beneficiary identity mappings stay private under RLS. They are reachable only
-- through these SECURITY DEFINER accessors, which (1) require an active auditor
-- or organization administrator membership in the target organization and
-- (2) append a sensitive-access audit event before returning any rows.

-- Central sensitive-access logger. SECURITY DEFINER accessors below run as the
-- function owner, so they may append through the service-only audit path.
create or replace function private.log_sensitive_access(
  p_organization_id uuid,
  p_action text,
  p_correlation_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_correlation_id is null then
    raise exception 'sensitive access logging requires a correlation ID'
      using errcode = '22004';
  end if;

  return public.append_audit_event(
    p_organization_id,
    (select auth.uid()),
    p_action,
    p_correlation_id,
    true,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

-- Shared gate: only active auditors and organization administrators receive
-- controlled access to sensitive audit and identity information (Req 19.5).
create or replace function private.assert_sensitive_auditor(
  p_organization_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not private.has_organization_role(
    p_organization_id,
    array['organization_administrator', 'auditor']::public.organization_membership_role[]
  ) then
    raise exception 'controlled auditor access requires an active auditor or administrator role'
      using errcode = '42501';
  end if;
end;
$$;

-- Identity mappings: beneficiary identity to wallet and Supabase user linkage.
-- Kept out of the public transparency view; reachable only through this logged,
-- auditor-gated accessor.
create or replace function public.auditor_view_identity_mappings(
  p_organization_id uuid,
  p_correlation_id uuid,
  p_beneficiary_identity_id uuid default null
)
returns table (
  beneficiary_identity_id uuid,
  subject_user_id uuid,
  identity_data_status public.identity_data_status,
  wallet_id uuid,
  wallet_network public.wallet_network,
  wallet_purpose public.wallet_purpose,
  wallet_address text,
  wallet_verification_status public.wallet_verification_status,
  wallet_is_active boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_correlation_id is null then
    raise exception 'controlled access requires a correlation ID' using errcode = '22004';
  end if;
  perform private.assert_sensitive_auditor(p_organization_id);

  perform private.log_sensitive_access(
    p_organization_id,
    'audit.identity_mapping.accessed',
    p_correlation_id,
    jsonb_build_object(
      'beneficiary_identity_id', p_beneficiary_identity_id,
      'scope', case when p_beneficiary_identity_id is null then 'organization' else 'single_identity' end
    )
  );

  return query
  select
    identity.id,
    identity.user_id,
    identity.data_status,
    wallet.id,
    wallet.network,
    wallet.purpose,
    wallet.address,
    wallet.verification_status,
    wallet.is_active
  from public.beneficiary_identities identity
  left join public.wallets wallet
    on wallet.owner_type = 'beneficiary_identity'
   and wallet.owner_id = identity.id
  where (p_beneficiary_identity_id is null or identity.id = p_beneficiary_identity_id)
    and exists (
      select 1
      from public.enrollments enrollment
      join public.programs program on program.id = enrollment.program_id
      where enrollment.beneficiary_identity_id = identity.id
        and program.organization_id = p_organization_id
    )
  order by identity.id, wallet.created_at;
end;
$$;

-- Approvals: beneficiary eligibility decisions and disbursement authorizations.
create or replace function public.auditor_view_approvals(
  p_organization_id uuid,
  p_correlation_id uuid,
  p_program_id uuid default null
)
returns table (
  approval_type text,
  record_id uuid,
  program_id uuid,
  status text,
  decided_at timestamptz,
  detail jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_correlation_id is null then
    raise exception 'controlled access requires a correlation ID' using errcode = '22004';
  end if;
  perform private.assert_sensitive_auditor(p_organization_id);

  perform private.log_sensitive_access(
    p_organization_id,
    'audit.approvals.accessed',
    p_correlation_id,
    jsonb_build_object('program_id', p_program_id)
  );

  return query
  select
    'enrollment_eligibility'::text,
    enrollment.id,
    program.id,
    enrollment.approval_status,
    enrollment.created_at,
    jsonb_build_object(
      'beneficiary_identity_id', enrollment.beneficiary_identity_id,
      'category', enrollment.category
    )
  from public.enrollments enrollment
  join public.programs program on program.id = enrollment.program_id
  where program.organization_id = p_organization_id
    and enrollment.approval_status in ('Approved', 'Rejected')
    and (p_program_id is null or program.id = p_program_id)
  union all
  select
    'disbursement'::text,
    disbursement.id,
    program.id,
    'authorized'::text,
    disbursement.created_at,
    jsonb_build_object(
      'amount', disbursement.amount,
      'recipients_count', disbursement.recipients_count,
      'transaction_hash', disbursement.tx_hash
    )
  from public.disbursements disbursement
  join public.programs program on program.id = disbursement.program_id
  where program.organization_id = p_organization_id
    and (p_program_id is null or program.id = p_program_id)
  order by 5 desc nulls last;
end;
$$;

-- Reconciliation reports: run summaries with open-issue counts.
create or replace function public.auditor_view_reconciliation_report(
  p_organization_id uuid,
  p_correlation_id uuid,
  p_reconciliation_run_id uuid default null
)
returns table (
  reconciliation_run_id uuid,
  program_id uuid,
  stream_name text,
  status text,
  start_ledger_sequence bigint,
  end_ledger_sequence bigint,
  observed_transaction_count integer,
  observed_event_count integer,
  reconciliation_lag_seconds integer,
  open_issue_count integer,
  started_at timestamptz,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_correlation_id is null then
    raise exception 'controlled access requires a correlation ID' using errcode = '22004';
  end if;
  perform private.assert_sensitive_auditor(p_organization_id);

  perform private.log_sensitive_access(
    p_organization_id,
    'audit.reconciliation_report.accessed',
    p_correlation_id,
    jsonb_build_object('reconciliation_run_id', p_reconciliation_run_id)
  );

  return query
  select
    run.id,
    run.program_id,
    run.stream_name,
    run.status::text,
    run.start_ledger_sequence,
    run.end_ledger_sequence,
    run.observed_transaction_count,
    run.observed_event_count,
    run.reconciliation_lag_seconds,
    (
      select count(*)::integer
      from public.reconciliation_issues issue
      where issue.reconciliation_run_id = run.id
        and issue.status in ('open', 'investigating')
    ),
    run.started_at,
    run.completed_at
  from public.reconciliation_runs run
  where run.organization_id = p_organization_id
    and (p_reconciliation_run_id is null or run.id = p_reconciliation_run_id)
  order by run.started_at desc;
end;
$$;

-- Supporting evidence: append-only dispute evidence metadata and digests.
create or replace function public.auditor_view_dispute_evidence(
  p_organization_id uuid,
  p_correlation_id uuid,
  p_dispute_id uuid default null
)
returns table (
  evidence_id uuid,
  dispute_id uuid,
  dispute_status public.dispute_status,
  evidence_kind text,
  storage_reference text,
  content_digest text,
  submitted_by uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_correlation_id is null then
    raise exception 'controlled access requires a correlation ID' using errcode = '22004';
  end if;
  perform private.assert_sensitive_auditor(p_organization_id);

  perform private.log_sensitive_access(
    p_organization_id,
    'audit.dispute_evidence.accessed',
    p_correlation_id,
    jsonb_build_object('dispute_id', p_dispute_id)
  );

  return query
  select
    evidence.id,
    dispute.id,
    dispute.status,
    evidence.evidence_kind,
    evidence.storage_reference,
    evidence.content_digest,
    evidence.submitted_by,
    evidence.created_at
  from public.dispute_evidence evidence
  join public.disputes dispute on dispute.id = evidence.dispute_id
  where dispute.organization_id = p_organization_id
    and (p_dispute_id is null or dispute.id = p_dispute_id)
  order by evidence.created_at;
end;
$$;

-- Least privilege: the gate and logger are internal; accessors are execute-only
-- for authenticated callers, which are authorized and logged inside each body.
revoke all privileges on function private.log_sensitive_access(uuid, text, uuid, jsonb)
  from public, anon, authenticated;
revoke all privileges on function private.assert_sensitive_auditor(uuid)
  from public, anon, authenticated;

revoke all privileges on function public.auditor_view_identity_mappings(uuid, uuid, uuid)
  from public, anon;
revoke all privileges on function public.auditor_view_approvals(uuid, uuid, uuid)
  from public, anon;
revoke all privileges on function public.auditor_view_reconciliation_report(uuid, uuid, uuid)
  from public, anon;
revoke all privileges on function public.auditor_view_dispute_evidence(uuid, uuid, uuid)
  from public, anon;

grant execute on function public.auditor_view_identity_mappings(uuid, uuid, uuid)
  to authenticated, service_role;
grant execute on function public.auditor_view_approvals(uuid, uuid, uuid)
  to authenticated, service_role;
grant execute on function public.auditor_view_reconciliation_report(uuid, uuid, uuid)
  to authenticated, service_role;
grant execute on function public.auditor_view_dispute_evidence(uuid, uuid, uuid)
  to authenticated, service_role;

comment on function private.log_sensitive_access(uuid, text, uuid, jsonb) is
  'Appends a sensitive-data-access audit event for controlled auditor reads (Req 19.6).';
comment on function private.assert_sensitive_auditor(uuid) is
  'Raises unless the caller is an active auditor or organization administrator of the organization.';
comment on function public.auditor_view_identity_mappings(uuid, uuid, uuid) is
  'Controlled, logged auditor access to private beneficiary identity-to-wallet mappings (Req 19.4, 19.5, 19.6).';
comment on function public.auditor_view_approvals(uuid, uuid, uuid) is
  'Controlled, logged auditor access to eligibility and disbursement approvals (Req 19.5, 19.6).';
comment on function public.auditor_view_reconciliation_report(uuid, uuid, uuid) is
  'Controlled, logged auditor access to reconciliation run reports and open-issue counts (Req 19.5, 19.6).';
comment on function public.auditor_view_dispute_evidence(uuid, uuid, uuid) is
  'Controlled, logged auditor access to append-only supporting dispute evidence (Req 19.5, 19.6).';

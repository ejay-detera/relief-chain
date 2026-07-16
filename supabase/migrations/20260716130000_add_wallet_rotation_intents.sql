-- Add trusted wallet proof transitions, identity re-verification evidence, and
-- rotation intents. Only digests and public keys are persisted; raw challenges,
-- signatures, identity documents, recovery phrases, and private keys are excluded.

do $$
begin
  create type public.wallet_rotation_status as enum (
    'proof_verified', 'approved', 'submitted', 'confirmed',
    'rejected', 'expired', 'failed'
  );
exception when duplicate_object then null;
end
$$;

create table public.beneficiary_identity_reverifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  beneficiary_identity_id uuid not null
    references public.beneficiary_identities(id) on delete restrict,
  verification_method text not null
    check (verification_method in ('in_person', 'document_review', 'regulated_partner')),
  evidence_digest text not null check (evidence_digest ~ '^[0-9a-f]{64}$'),
  verified_by uuid not null references auth.users(id) on delete restrict,
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  constraint beneficiary_identity_reverification_window_check check (
    expires_at > verified_at and expires_at <= verified_at + interval '24 hours'
  )
);

create index beneficiary_identity_reverifications_identity_verified_idx
  on public.beneficiary_identity_reverifications (
    beneficiary_identity_id, verified_at desc
  );

create table public.wallet_rotation_intents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  beneficiary_identity_id uuid not null
    references public.beneficiary_identities(id) on delete restrict,
  current_wallet_id uuid not null references public.wallets(id) on delete restrict,
  replacement_wallet_id uuid not null unique references public.wallets(id) on delete restrict,
  identity_reverification_id uuid not null unique
    references public.beneficiary_identity_reverifications(id) on delete restrict,
  financial_intent_id uuid unique references public.financial_intents(id) on delete restrict,
  idempotency_key text not null check (length(idempotency_key) between 1 and 255),
  status public.wallet_rotation_status not null default 'proof_verified',
  step_up_verified_at timestamptz not null,
  requested_by uuid not null references auth.users(id) on delete restrict,
  correlation_id uuid not null,
  approved_at timestamptz,
  submitted_at timestamptz,
  confirmed_at timestamptz,
  failure_code text check (failure_code is null or length(failure_code) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wallet_rotation_intents_distinct_wallets_check
    check (current_wallet_id <> replacement_wallet_id),
  constraint wallet_rotation_intents_identity_idempotency_key
    unique (beneficiary_identity_id, idempotency_key),
  constraint wallet_rotation_intents_state_evidence_check check (
    (status = 'proof_verified'
      and approved_at is null and submitted_at is null and confirmed_at is null
      and failure_code is null)
    or (status = 'approved'
      and approved_at is not null and submitted_at is null and confirmed_at is null
      and failure_code is null)
    or (status = 'submitted'
      and approved_at is not null and submitted_at is not null
      and confirmed_at is null and failure_code is null)
    or (status = 'confirmed'
      and approved_at is not null and submitted_at is not null
      and confirmed_at is not null and failure_code is null)
    or (status in ('rejected', 'expired', 'failed')
      and confirmed_at is null and failure_code is not null)
  )
);

create unique index wallet_rotation_intents_one_open_identity_idx
  on public.wallet_rotation_intents (beneficiary_identity_id)
  where status in ('proof_verified', 'approved', 'submitted');
create index wallet_rotation_intents_organization_created_idx
  on public.wallet_rotation_intents (organization_id, created_at desc);

create or replace function private.reject_identity_reverification_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'identity re-verification evidence is append-only'
    using errcode = '55000';
end;
$$;

create trigger beneficiary_identity_reverifications_reject_mutation
before update or delete on public.beneficiary_identity_reverifications
for each row execute function private.reject_identity_reverification_mutation();

create or replace function private.validate_wallet_rotation_intent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_wallet public.wallets;
  replacement_wallet public.wallets;
  reverification public.beneficiary_identity_reverifications;
  linked_intent public.financial_intents;
begin
  if tg_op = 'UPDATE' then
    if row(
      new.organization_id, new.beneficiary_identity_id, new.current_wallet_id,
      new.replacement_wallet_id, new.identity_reverification_id,
      new.idempotency_key, new.step_up_verified_at, new.requested_by,
      new.correlation_id, new.created_at
    ) is distinct from row(
      old.organization_id, old.beneficiary_identity_id, old.current_wallet_id,
      old.replacement_wallet_id, old.identity_reverification_id,
      old.idempotency_key, old.step_up_verified_at, old.requested_by,
      old.correlation_id, old.created_at
    ) then
      raise exception 'wallet rotation intent identity and security evidence are immutable'
        using errcode = '23514';
    end if;

    if new.status is distinct from old.status and not (
      (old.status = 'proof_verified' and new.status in ('approved', 'rejected', 'expired', 'failed'))
      or (old.status = 'approved' and new.status in ('submitted', 'rejected', 'expired', 'failed'))
      or (old.status = 'submitted' and new.status in ('confirmed', 'failed'))
    ) then
      raise exception 'invalid wallet rotation status transition'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'INSERT' then
    select * into strict current_wallet
    from public.wallets where id = new.current_wallet_id;
    select * into strict replacement_wallet
    from public.wallets where id = new.replacement_wallet_id;
    select * into strict reverification
    from public.beneficiary_identity_reverifications
    where id = new.identity_reverification_id;

    if current_wallet.owner_type <> 'beneficiary_identity'
      or current_wallet.owner_id <> new.beneficiary_identity_id
      or current_wallet.purpose <> 'beneficiary'
      or current_wallet.verification_status <> 'verified'
      or not current_wallet.is_active then
      raise exception 'rotation requires the current active verified beneficiary wallet'
        using errcode = '23514';
    end if;
    if replacement_wallet.owner_type <> 'beneficiary_identity'
      or replacement_wallet.owner_id <> new.beneficiary_identity_id
      or replacement_wallet.purpose <> 'beneficiary'
      or replacement_wallet.network <> current_wallet.network
      or replacement_wallet.verification_status <> 'verified'
      or replacement_wallet.is_active then
      raise exception 'rotation requires a proof-verified inactive replacement wallet for the same identity'
        using errcode = '23514';
    end if;
    if reverification.organization_id <> new.organization_id
      or reverification.beneficiary_identity_id <> new.beneficiary_identity_id
      or reverification.expires_at <= now()
      or reverification.verified_at < now() - interval '24 hours' then
      raise exception 'fresh identity re-verification is required for wallet rotation'
        using errcode = '42501';
    end if;
  end if;

  if new.financial_intent_id is not null then
    select * into strict linked_intent
    from public.financial_intents where id = new.financial_intent_id;
    if linked_intent.operation_type <> 'wallet_rotation'
      or linked_intent.organization_id <> new.organization_id
      or linked_intent.beneficiary_identity_id <> new.beneficiary_identity_id then
      raise exception 'wallet rotation financial intent scope mismatch'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger wallet_rotation_intents_validate
before insert or update on public.wallet_rotation_intents
for each row execute function private.validate_wallet_rotation_intent();
create trigger wallet_rotation_intents_set_updated_at
before update on public.wallet_rotation_intents
for each row execute function private.set_updated_at();

create or replace function public.issue_wallet_proof_challenge(
  p_wallet_id uuid,
  p_owner_type public.wallet_owner_type,
  p_owner_id uuid,
  p_purpose public.wallet_purpose,
  p_address text,
  p_challenge_digest text,
  p_expires_at timestamptz
)
returns public.wallets
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.wallets;
begin
  if p_wallet_id is null or p_challenge_digest !~ '^[0-9a-f]{64}$'
    or p_expires_at <= now() or p_expires_at > now() + interval '5 minutes' then
    raise exception 'invalid wallet proof challenge parameters'
      using errcode = '22023';
  end if;
  if p_purpose = 'beneficiary' and (
    p_owner_type <> 'beneficiary_identity'
    or not exists (
      select 1 from public.beneficiary_identities identity
      where identity.id = p_owner_id
        and identity.verification_status = 'Verified'
        and identity.data_status = 'active'
    )
  ) then
    raise exception 'beneficiary wallet binding requires a stable verified identity'
      using errcode = '23514';
  end if;

  select * into result from public.wallets where id = p_wallet_id;
  if found then
    if result.owner_type <> p_owner_type or result.owner_id <> p_owner_id
      or result.purpose <> p_purpose or result.address <> p_address
      or result.proof_challenge_digest <> p_challenge_digest then
      raise exception 'wallet proof challenge idempotency conflict'
        using errcode = '23505';
    end if;
    return result;
  end if;

  insert into public.wallets (
    id, owner_type, owner_id, network, purpose, address,
    verification_status, proof_challenge_digest,
    proof_challenge_issued_at, proof_challenge_expires_at
  ) values (
    p_wallet_id, p_owner_type, p_owner_id, 'stellar_testnet', p_purpose, p_address,
    'challenge_issued', p_challenge_digest, now(), p_expires_at
  ) returning * into result;
  return result;
end;
$$;

create or replace function public.complete_wallet_proof(
  p_wallet_id uuid,
  p_challenge_digest text,
  p_signature_digest text,
  p_verified_by uuid
)
returns public.wallets
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.wallets;
  result public.wallets;
  activate_binding boolean;
begin
  if p_signature_digest !~ '^[0-9a-f]{64}$' or p_verified_by is null then
    raise exception 'invalid wallet proof evidence' using errcode = '22023';
  end if;
  select * into strict target from public.wallets where id = p_wallet_id for update;
  if target.verification_status <> 'challenge_issued'
    or target.proof_challenge_expires_at <= now()
    or target.proof_challenge_digest <> p_challenge_digest then
    raise exception 'wallet proof challenge is stale or does not match'
      using errcode = '42501';
  end if;
  activate_binding := not exists (
    select 1 from public.wallets wallet
    where wallet.owner_type = target.owner_type
      and wallet.owner_id = target.owner_id
      and wallet.network = target.network
      and wallet.purpose = target.purpose
      and wallet.is_active
  );
  update public.wallets
  set verification_status = 'verified',
      proof_signature_digest = p_signature_digest,
      verified_at = now(),
      verified_by = p_verified_by,
      is_active = activate_binding
  where id = p_wallet_id
  returning * into result;
  return result;
end;
$$;

create or replace function public.record_beneficiary_identity_reverification(
  p_organization_id uuid,
  p_beneficiary_identity_id uuid,
  p_verification_method text,
  p_evidence_digest text,
  p_verified_by uuid,
  p_expires_at timestamptz,
  p_correlation_id uuid
)
returns public.beneficiary_identity_reverifications
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.beneficiary_identity_reverifications;
begin
  if p_evidence_digest !~ '^[0-9a-f]{64}$'
    or p_expires_at <= now() or p_expires_at > now() + interval '24 hours'
    or p_correlation_id is null then
    raise exception 'invalid identity re-verification evidence'
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = p_organization_id
      and membership.user_id = p_verified_by
      and membership.role in ('organization_administrator', 'beneficiary_verifier')
      and membership.is_active
  ) then
    raise exception 'beneficiary verifier role is required'
      using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.beneficiary_identities identity
    join public.enrollments enrollment
      on enrollment.beneficiary_identity_id = identity.id
    join public.programs program on program.id = enrollment.program_id
    where identity.id = p_beneficiary_identity_id
      and identity.verification_status = 'Verified'
      and identity.data_status = 'active'
      and program.organization_id = p_organization_id
  ) then
    raise exception 'verified beneficiary identity is not in the organization scope'
      using errcode = '42501';
  end if;

  insert into public.beneficiary_identity_reverifications (
    organization_id, beneficiary_identity_id, verification_method,
    evidence_digest, verified_by, expires_at, correlation_id
  ) values (
    p_organization_id, p_beneficiary_identity_id, p_verification_method,
    p_evidence_digest, p_verified_by, p_expires_at, p_correlation_id
  ) returning * into result;

  perform public.append_audit_event(
    p_organization_id, p_verified_by, 'wallet.identity_reverified',
    p_correlation_id, true,
    jsonb_build_object(
      'beneficiary_identity_id', p_beneficiary_identity_id,
      'reverification_id', result.id,
      'method', p_verification_method
    )
  );
  return result;
end;
$$;

create or replace function public.request_wallet_rotation(
  p_organization_id uuid,
  p_beneficiary_identity_id uuid,
  p_current_wallet_id uuid,
  p_replacement_wallet_id uuid,
  p_identity_reverification_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid
)
returns public.wallet_rotation_intents
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  step_up_at timestamptz;
  existing public.wallet_rotation_intents;
  result public.wallet_rotation_intents;
begin
  if caller is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;
  perform private.require_sensitive_action('wallet_rotation', interval '10 minutes');
  if p_correlation_id is null or length(p_idempotency_key) not between 1 and 255 then
    raise exception 'rotation correlation and idempotency key are required'
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.beneficiary_identities identity
    where identity.id = p_beneficiary_identity_id
      and identity.user_id = caller
      and identity.verification_status = 'Verified'
      and identity.data_status = 'active'
  ) then
    raise exception 'wallet rotation requires the caller stable verified identity'
      using errcode = '42501';
  end if;

  select max(to_timestamp((method.value ->> 'timestamp')::double precision))
  into step_up_at
  from jsonb_array_elements(
    coalesce((select auth.jwt() -> 'amr'), '[]'::jsonb)
  ) as method(value)
  where method.value ->> 'method' in ('totp', 'otp', 'webauthn')
    and coalesce(method.value ->> 'timestamp', '') ~ '^[0-9]{1,16}$';

  select * into existing
  from public.wallet_rotation_intents intent
  where intent.beneficiary_identity_id = p_beneficiary_identity_id
    and intent.idempotency_key = p_idempotency_key;
  if found then
    if existing.organization_id <> p_organization_id
      or existing.current_wallet_id <> p_current_wallet_id
      or existing.replacement_wallet_id <> p_replacement_wallet_id
      or existing.identity_reverification_id <> p_identity_reverification_id
      or existing.requested_by <> caller then
      raise exception 'wallet rotation idempotency conflict'
        using errcode = '23505';
    end if;
    return existing;
  end if;

  insert into public.wallet_rotation_intents (
    organization_id, beneficiary_identity_id, current_wallet_id,
    replacement_wallet_id, identity_reverification_id, idempotency_key,
    step_up_verified_at, requested_by, correlation_id
  ) values (
    p_organization_id, p_beneficiary_identity_id, p_current_wallet_id,
    p_replacement_wallet_id, p_identity_reverification_id, p_idempotency_key,
    step_up_at, caller, p_correlation_id
  ) returning * into result;

  perform public.append_audit_event(
    p_organization_id, caller, 'wallet.rotation.requested',
    p_correlation_id, false,
    jsonb_build_object(
      'wallet_rotation_intent_id', result.id,
      'beneficiary_identity_id', p_beneficiary_identity_id,
      'current_wallet_id', p_current_wallet_id,
      'replacement_wallet_id', p_replacement_wallet_id
    )
  );
  return result;
end;
$$;

create or replace function public.transition_wallet_rotation_intent(
  p_wallet_rotation_intent_id uuid,
  p_status public.wallet_rotation_status,
  p_actor_id uuid,
  p_financial_intent_id uuid default null,
  p_failure_code text default null
)
returns public.wallet_rotation_intents
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.wallet_rotation_intents;
  result public.wallet_rotation_intents;
begin
  if p_actor_id is null or p_status = 'proof_verified' then
    raise exception 'invalid wallet rotation transition request'
      using errcode = '22023';
  end if;
  select * into strict target
  from public.wallet_rotation_intents
  where id = p_wallet_rotation_intent_id
  for update;

  if target.financial_intent_id is not null
    and p_financial_intent_id is not null
    and target.financial_intent_id <> p_financial_intent_id then
    raise exception 'wallet rotation financial intent cannot be replaced'
      using errcode = '23514';
  end if;
  if p_status in ('submitted', 'confirmed')
    and coalesce(target.financial_intent_id, p_financial_intent_id) is null then
    raise exception 'submitted wallet rotation requires a financial intent'
      using errcode = '23514';
  end if;
  if p_status in ('rejected', 'expired', 'failed')
    and coalesce(length(p_failure_code), 0) = 0 then
    raise exception 'terminal wallet rotation failure requires a failure code'
      using errcode = '22023';
  end if;

  update public.wallet_rotation_intents
  set financial_intent_id = coalesce(financial_intent_id, p_financial_intent_id),
      status = p_status,
      approved_at = case
        when p_status = 'approved' then now() else approved_at end,
      submitted_at = case
        when p_status = 'submitted' then now() else submitted_at end,
      confirmed_at = case
        when p_status = 'confirmed' then now() else confirmed_at end,
      failure_code = case
        when p_status in ('rejected', 'expired', 'failed') then p_failure_code
        else null end
  where id = p_wallet_rotation_intent_id
  returning * into result;

  if p_status = 'confirmed' then
    perform 1 from public.wallets
    where id in (target.current_wallet_id, target.replacement_wallet_id)
    order by id
    for update;

    update public.wallets
    set is_active = false,
        superseded_by_wallet_id = target.replacement_wallet_id,
        superseded_at = now(),
        superseded_by = p_actor_id
    where id = target.current_wallet_id
      and owner_type = 'beneficiary_identity'
      and owner_id = target.beneficiary_identity_id
      and verification_status = 'verified'
      and is_active;
    if not found then
      raise exception 'current wallet is no longer the active verified binding'
        using errcode = '23514';
    end if;

    update public.wallets
    set is_active = true
    where id = target.replacement_wallet_id
      and owner_type = 'beneficiary_identity'
      and owner_id = target.beneficiary_identity_id
      and verification_status = 'verified'
      and not is_active
      and superseded_by_wallet_id is null;
    if not found then
      raise exception 'replacement wallet is no longer eligible for activation'
        using errcode = '23514';
    end if;
  end if;

  perform public.append_audit_event(
    target.organization_id, p_actor_id, 'wallet.rotation.' || p_status::text,
    target.correlation_id, false,
    jsonb_build_object(
      'wallet_rotation_intent_id', target.id,
      'beneficiary_identity_id', target.beneficiary_identity_id,
      'financial_intent_id', result.financial_intent_id,
      'failure_code', result.failure_code
    )
  );
  return result;
end;
$$;

alter table public.beneficiary_identity_reverifications enable row level security;
alter table public.wallet_rotation_intents enable row level security;

create policy "Authorized roles can view identity re-verification evidence"
on public.beneficiary_identity_reverifications
for select to authenticated
using (
  private.has_organization_role(
    organization_id,
    array[
      'organization_administrator',
      'beneficiary_verifier',
      'auditor'
    ]::public.organization_membership_role[]
  )
);

create policy "Beneficiaries and authorized roles can view wallet rotation intents"
on public.wallet_rotation_intents
for select to authenticated
using (
  exists (
    select 1 from public.beneficiary_identities identity
    where identity.id = beneficiary_identity_id
      and identity.user_id = (select auth.uid())
  )
  or private.has_organization_role(
    organization_id,
    array[
      'organization_administrator',
      'beneficiary_verifier',
      'auditor'
    ]::public.organization_membership_role[]
  )
);

revoke all privileges on table public.beneficiary_identity_reverifications
  from anon, authenticated;
revoke all privileges on table public.wallet_rotation_intents
  from anon, authenticated;
grant select on table public.beneficiary_identity_reverifications to authenticated;
grant select on table public.wallet_rotation_intents to authenticated;
grant all privileges on table public.beneficiary_identity_reverifications to service_role;
grant all privileges on table public.wallet_rotation_intents to service_role;

revoke all privileges on function public.issue_wallet_proof_challenge(
  uuid, public.wallet_owner_type, uuid, public.wallet_purpose,
  text, text, timestamptz
) from public, anon, authenticated;
revoke all privileges on function public.complete_wallet_proof(
  uuid, text, text, uuid
) from public, anon, authenticated;
revoke all privileges on function public.record_beneficiary_identity_reverification(
  uuid, uuid, text, text, uuid, timestamptz, uuid
) from public, anon, authenticated;
revoke all privileges on function public.request_wallet_rotation(
  uuid, uuid, uuid, uuid, uuid, text, uuid
) from public, anon;
revoke all privileges on function public.transition_wallet_rotation_intent(
  uuid, public.wallet_rotation_status, uuid, uuid, text
) from public, anon, authenticated;
revoke all privileges on function private.validate_wallet_rotation_intent()
  from public, anon, authenticated;
revoke all privileges on function private.reject_identity_reverification_mutation()
  from public, anon, authenticated;

grant execute on function public.issue_wallet_proof_challenge(
  uuid, public.wallet_owner_type, uuid, public.wallet_purpose,
  text, text, timestamptz
) to service_role;
grant execute on function public.complete_wallet_proof(
  uuid, text, text, uuid
) to service_role;
grant execute on function public.record_beneficiary_identity_reverification(
  uuid, uuid, text, text, uuid, timestamptz, uuid
) to service_role;
grant execute on function public.request_wallet_rotation(
  uuid, uuid, uuid, uuid, uuid, text, uuid
) to authenticated, service_role;
grant execute on function public.transition_wallet_rotation_intent(
  uuid, public.wallet_rotation_status, uuid, uuid, text
) to service_role;

comment on table public.beneficiary_identity_reverifications is
  'Append-only, digest-only evidence that identity was freshly re-verified for recovery.';
comment on table public.wallet_rotation_intents is
  'Audited wallet replacement intent tied to one stable beneficiary identity.';
comment on function public.issue_wallet_proof_challenge(
  uuid, public.wallet_owner_type, uuid, public.wallet_purpose,
  text, text, timestamptz
) is
  'Trusted challenge issuance path. Raw challenges and private keys are never persisted.';
comment on function public.complete_wallet_proof(uuid, text, text, uuid) is
  'Trusted completion path called only after server-side signature verification.';
comment on function public.request_wallet_rotation(
  uuid, uuid, uuid, uuid, uuid, text, uuid
) is
  'Beneficiary rotation request requiring stable identity, fresh re-verification, and recent AAL2.';
comment on function public.transition_wallet_rotation_intent(
  uuid, public.wallet_rotation_status, uuid, uuid, text
) is
  'Service-only audited transition path; confirmation atomically supersedes the old binding.';
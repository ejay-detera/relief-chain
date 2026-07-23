-- Add canonical wallet bindings and proof-of-possession state.
-- Public keys are records only; raw private keys must never be stored here.

do $$
begin
  create type public.wallet_owner_type as enum (
    'user',
    'beneficiary_identity',
    'organization',
    'merchant_entity',
    'platform'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.wallet_network as enum ('stellar_testnet');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.wallet_purpose as enum (
    'beneficiary',
    'merchant_settlement',
    'organization_treasury',
    'cash_program_treasury',
    'issuer',
    'distribution',
    'fee_sponsor',
    'contract_deployer'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.wallet_verification_status as enum (
    'pending',
    'challenge_issued',
    'verified',
    'rejected',
    'expired'
  );
exception
  when duplicate_object then null;
end
$$;
create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  owner_type public.wallet_owner_type not null,
  owner_id uuid not null,
  network public.wallet_network not null default 'stellar_testnet',
  purpose public.wallet_purpose not null,
  address text not null check (address ~ '^G[A-Z2-7]{55}$'),
  verification_status public.wallet_verification_status not null default 'pending',
  proof_challenge_digest text
    check (proof_challenge_digest ~ '^[0-9a-f]{64}$'),
  proof_challenge_issued_at timestamptz,
  proof_challenge_expires_at timestamptz,
  proof_signature_digest text
    check (proof_signature_digest ~ '^[0-9a-f]{64}$'),
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete restrict,
  is_active boolean not null default false,
  superseded_by_wallet_id uuid,
  superseded_at timestamptz,
  superseded_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wallets_network_address_key unique (network, address),
  constraint wallets_owner_purpose_check check (
    (owner_type in ('user', 'beneficiary_identity') and purpose = 'beneficiary')
    or (owner_type = 'merchant_entity' and purpose = 'merchant_settlement')
    or (owner_type = 'organization' and purpose in (
      'organization_treasury', 'cash_program_treasury'
    ))
    or (owner_type = 'platform' and purpose in (
      'issuer', 'distribution', 'fee_sponsor', 'contract_deployer'
    ))
  ),
  constraint wallets_challenge_window_check check (
    (
      proof_challenge_digest is null
      and proof_challenge_issued_at is null
      and proof_challenge_expires_at is null
    )
    or (
      proof_challenge_digest is not null
      and proof_challenge_issued_at is not null
      and proof_challenge_expires_at > proof_challenge_issued_at
    )
  )
);
alter table public.wallets
  add constraint wallets_verification_state_check check (
    (
      verification_status = 'pending'
      and proof_challenge_digest is null
      and proof_signature_digest is null
      and verified_at is null
      and verified_by is null
    )
    or (
      verification_status = 'challenge_issued'
      and proof_challenge_digest is not null
      and proof_signature_digest is null
      and verified_at is null
      and verified_by is null
    )
    or (
      verification_status = 'verified'
      and proof_challenge_digest is not null
      and proof_signature_digest is not null
      and verified_at is not null
      and verified_by is not null
    )
    or (
      verification_status in ('rejected', 'expired')
      and proof_challenge_digest is not null
      and proof_signature_digest is null
      and verified_at is null
      and verified_by is null
    )
  ),
  add constraint wallets_active_verified_check check (
    not is_active or verification_status = 'verified'
  ),
  add constraint wallets_supersession_state_check check (
    (
      superseded_by_wallet_id is null
      and superseded_at is null
      and superseded_by is null
    )
    or (
      superseded_by_wallet_id is not null
      and superseded_at is not null
      and superseded_by is not null
      and not is_active
    )
  ),
  add constraint wallets_not_self_superseded_check check (
    superseded_by_wallet_id is null or superseded_by_wallet_id <> id
  ),
  add constraint wallets_superseded_by_wallet_fkey
    foreign key (superseded_by_wallet_id)
    references public.wallets(id) on delete restrict;
create unique index wallets_one_active_owner_purpose_idx
  on public.wallets (owner_type, owner_id, network, purpose)
  where is_active;

create index wallets_owner_lookup_idx
  on public.wallets (owner_type, owner_id, network, created_at desc);

create index wallets_verification_queue_idx
  on public.wallets (verification_status, proof_challenge_expires_at)
  where verification_status in ('challenge_issued', 'expired');

create index wallets_superseded_by_wallet_idx
  on public.wallets (superseded_by_wallet_id)
  where superseded_by_wallet_id is not null;

create trigger wallets_set_updated_at
before update on public.wallets
for each row execute function private.set_updated_at();

create or replace function private.protect_verified_wallet_binding()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and old.verification_status = 'verified' then
    raise exception 'verified wallet bindings cannot be deleted'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE'
    and old.verification_status = 'verified'
    and (
      new.owner_type is distinct from old.owner_type
      or new.owner_id is distinct from old.owner_id
      or new.network is distinct from old.network
      or new.purpose is distinct from old.purpose
      or new.address is distinct from old.address
      or new.verification_status is distinct from old.verification_status
      or new.proof_challenge_digest is distinct from old.proof_challenge_digest
      or new.proof_challenge_issued_at is distinct from old.proof_challenge_issued_at
      or new.proof_challenge_expires_at is distinct from old.proof_challenge_expires_at
      or new.proof_signature_digest is distinct from old.proof_signature_digest
      or new.verified_at is distinct from old.verified_at
      or new.verified_by is distinct from old.verified_by
    ) then
    raise exception 'verified wallet binding evidence is immutable; supersede it instead'
      using errcode = '23514';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger wallets_protect_verified_binding
before update or delete on public.wallets
for each row execute function private.protect_verified_wallet_binding();
alter table public.wallets enable row level security;

create policy "Owners and organization members can view wallets"
on public.wallets
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (
    (owner_type = 'user' and owner_id = (select auth.uid()))
    or (
      owner_type = 'beneficiary_identity'
      and exists (
        select 1
        from public.beneficiary_identities identity
        where identity.id = owner_id
          and identity.user_id = (select auth.uid())
      )
    )
    or (
      owner_type = 'organization'
      and private.is_organization_member(owner_id)
    )
  )
);

revoke all privileges on table public.wallets from anon, authenticated;
grant select on table public.wallets to authenticated;
grant all privileges on table public.wallets to service_role;

revoke all privileges on function private.protect_verified_wallet_binding()
  from public, anon, authenticated;

comment on table public.wallets is
  'Canonical public wallet bindings and proof-of-possession state; never stores private keys.';
comment on column public.wallets.owner_id is
  'Stable polymorphic owner identifier interpreted by owner_type; merchant FK validation is added with merchant entities.';
comment on column public.wallets.proof_challenge_digest is
  'SHA-256 hex digest of the issued proof challenge; the raw challenge is not retained.';
comment on column public.wallets.proof_signature_digest is
  'SHA-256 hex digest of verified proof evidence; signed payload material is not retained.';
comment on column public.wallets.superseded_by_wallet_id is
  'Replacement binding; verified evidence remains immutable and rotation creates a new row.';
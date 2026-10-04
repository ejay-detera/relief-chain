-- Migration: 20261005010000_inter_organization_transfers.sql
-- Fulfills ORG-01: Inter-organization funds transfer records and treasury signing keys

-- 1. Table for organization treasury keys (accessible only by service role / edge functions)
create table if not exists public.organization_treasury_keys (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  secret_seed text not null,
  created_at timestamptz not null default now()
);

alter table public.organization_treasury_keys enable row level security;

-- Deny all access to anon and authenticated
revoke all on public.organization_treasury_keys from anon, authenticated;
grant all on public.organization_treasury_keys to service_role;

create policy "Service role only"
  on public.organization_treasury_keys
  for all
  to service_role
  using (true)
  with check (true);

-- 2. Inter-organization transfer tracking table
create table if not exists public.organization_transfers (
  id uuid primary key default gen_random_uuid(),
  sender_organization_id uuid not null references public.organizations(id) on delete restrict,
  sender_wallet_address text not null,
  destination_wallet_address text not null check (length(destination_wallet_address) = 56 and destination_wallet_address ~ '^G[A-Z2-7]{55}$'),
  destination_organization_id uuid references public.organizations(id) on delete set null,
  amount_stroops bigint not null check (amount_stroops > 0),
  transaction_hash text check (transaction_hash is null or transaction_hash ~ '^[0-9a-fA-F]{64}$'),
  ledger_sequence bigint,
  memo text,
  status text not null default 'pending' check (status in ('pending', 'submitted', 'confirmed', 'failed')),
  error_message text,
  initiated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create index if not exists org_transfers_sender_idx
  on public.organization_transfers (sender_organization_id, created_at desc);

create index if not exists org_transfers_dest_org_idx
  on public.organization_transfers (destination_organization_id, created_at desc);

create index if not exists org_transfers_dest_wallet_idx
  on public.organization_transfers (destination_wallet_address, created_at desc);

create index if not exists org_transfers_tx_hash_idx
  on public.organization_transfers (transaction_hash)
  where transaction_hash is not null;

-- Enable Row Level Security
alter table public.organization_transfers enable row level security;

-- Policy: Members of the sender organization can read transfers they initiated or sent
drop policy if exists "Sender organization members can view transfers" on public.organization_transfers;
create policy "Sender organization members can view transfers"
  on public.organization_transfers
  for select
  using (
    sender_organization_id in (
      select m.organization_id from public.organization_memberships m
      where m.user_id = auth.uid() and m.is_active = true
    )
    or
    destination_organization_id in (
      select m.organization_id from public.organization_memberships m
      where m.user_id = auth.uid() and m.is_active = true
    )
  );

-- Policy: Service role has full CRUD
drop policy if exists "Service role has full access to organization transfers" on public.organization_transfers;
create policy "Service role has full access to organization transfers"
  on public.organization_transfers
  for all
  using (true)
  with check (true);

-- Grant permissions
grant select on public.organization_transfers to authenticated;
grant all on public.organization_transfers to service_role;

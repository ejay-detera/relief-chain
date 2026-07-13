-- Migration 1
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  role         text not null check (role in ('lgu', 'beneficiary', 'merchant')),
  full_name    text,
  gov_id       text,
  location     text,
  stellar_pubkey text,
  created_at   timestamptz default now()
);
alter table public.profiles enable row level security;
drop policy if exists "Own profile" on public.profiles;
create policy "Own profile" on public.profiles
  using (auth.uid() = id) with check (auth.uid() = id);

-- Migration 2
create table if not exists public.programs (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  disaster_event  text,
  total_budget    numeric not null default 0,
  amount_per_beneficiary numeric not null default 0,
  purpose         text,
  expires_at      date,
  status          text default 'active' check (status in ('active', 'closed')),
  created_by      uuid references public.profiles(id),
  created_at      timestamptz default now()
);
alter table public.programs enable row level security;
drop policy if exists "Anyone can read active programs" on public.programs;
create policy "Anyone can read active programs" on public.programs
  for select using (status = 'active');

-- Migration 3
create table if not exists public.enrollments (
  id              uuid primary key default gen_random_uuid(),
  beneficiary_id  uuid not null references public.profiles(id) on delete cascade,
  program_id      uuid not null references public.programs(id) on delete cascade,
  approval_status text default 'Pending' check (approval_status in ('Approved','Pending','Rejected')),
  voucher_balance numeric not null default 0,
  category        text not null check (category in ('Food','Medicine','School Supplies','Cash')),
  expires_at      date,
  created_at      timestamptz default now(),
  unique (beneficiary_id, program_id)
);
alter table public.enrollments enable row level security;
drop policy if exists "Beneficiary sees own enrollments" on public.enrollments;
create policy "Beneficiary sees own enrollments" on public.enrollments
  for select using (auth.uid() = beneficiary_id);

-- Migration 4
create table if not exists public.redemptions (
  id                uuid primary key default gen_random_uuid(),
  enrollment_id     uuid not null references public.enrollments(id),
  beneficiary_id    uuid not null references public.profiles(id),
  merchant_name     text,
  amount            numeric not null,
  category          text,
  tx_hash           text,
  remaining_balance numeric,
  status            text default 'Completed' check (status in ('Completed','Pending','Failed')),
  redeemed_at       timestamptz default now()
);
alter table public.redemptions enable row level security;
drop policy if exists "Beneficiary sees own redemptions" on public.redemptions;
create policy "Beneficiary sees own redemptions" on public.redemptions
  for select using (auth.uid() = beneficiary_id);

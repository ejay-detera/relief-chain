-- Create disbursements table if not exists
create table if not exists public.disbursements (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references public.programs(id) on delete set null,
  program_name text not null,
  disaster_event text,
  amount numeric not null,
  recipients_count integer not null,
  tx_hash text,
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.disbursements enable row level security;

-- Policies for LGU access on disbursements
drop policy if exists "LGU can view all disbursements" on public.disbursements;
create policy "LGU can view all disbursements"
on public.disbursements for select
using (
  public.is_lgu(auth.uid())
);

drop policy if exists "LGU can insert disbursements" on public.disbursements;
create policy "LGU can insert disbursements"
on public.disbursements for insert
with check (
  public.is_lgu(auth.uid())
);

-- Programs Table Delete Policy
drop policy if exists "LGU can delete own drafts" on public.programs;
drop policy if exists "LGU can delete programs" on public.programs;
create policy "LGU can delete own programs"
on public.programs for delete
using (
  (created_by = auth.uid()) 
  and public.is_lgu(auth.uid())
);

-- Program Barangays Table Policies
drop policy if exists "Anyone can read program_barangays" on public.program_barangays;
drop policy if exists "Allow read/write access to authenticated users on program_barangays" on public.program_barangays;
create policy "Allow read/write access to authenticated users on program_barangays"
on public.program_barangays for all
using (true)
with check (true);

-- Enrollments Table Policies
drop policy if exists "LGU can select all enrollments" on public.enrollments;
create policy "LGU can select all enrollments"
on public.enrollments for select
using (
  public.is_lgu(auth.uid())
);

drop policy if exists "LGU can insert enrollments" on public.enrollments;
create policy "LGU can insert enrollments"
on public.enrollments for insert
with check (
  public.is_lgu(auth.uid())
);

drop policy if exists "LGU can update enrollments" on public.enrollments;
create policy "LGU can update enrollments"
on public.enrollments for update
using (
  public.is_lgu(auth.uid())
)
with check (
  public.is_lgu(auth.uid())
);

drop policy if exists "LGU can delete enrollments" on public.enrollments;
create policy "LGU can delete enrollments"
on public.enrollments for delete
using (
  public.is_lgu(auth.uid())
);

-- Redemptions Table Policies
drop policy if exists "LGU can select all redemptions" on public.redemptions;
create policy "LGU can select all redemptions"
on public.redemptions for select
using (
  public.is_lgu(auth.uid())
);

drop policy if exists "LGU can delete redemptions" on public.redemptions;
create policy "LGU can delete redemptions"
on public.redemptions for delete
using (
  public.is_lgu(auth.uid())
);

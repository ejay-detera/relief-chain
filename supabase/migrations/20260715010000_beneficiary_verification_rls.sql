-- Allow a Beneficiary to insert their own enrollments row (Application submission)
drop policy if exists "Beneficiary can insert own enrollments" on public.enrollments;
create policy "Beneficiary can insert own enrollments"
on public.enrollments for insert
with check (
  auth.uid() = beneficiary_id
);

-- Allow any authenticated user to read Organization (LGU) profiles so Beneficiaries
-- can see organization names on the Find Organization screen.
drop policy if exists "Authenticated users can view LGU profiles" on public.profiles;
create policy "Authenticated users can view LGU profiles"
on public.profiles for select
using (
  role = 'lgu'
);

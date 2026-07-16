-- Reconcile hosted-only baseline objects that predate the immutable local history.
-- Hosted catalog definitions and seed rows were verified read-only on 2026-07-14.
-- This migration is intentionally additive and guarded for clean replay and hosted compatibility.

create table if not exists public.disaster_types (
  id serial primary key,
  name text not null unique
);

create table if not exists public.cities (
  id serial primary key,
  name text not null unique
);

create table if not exists public.areas (
  id serial primary key,
  city_id integer references public.cities(id) on delete cascade,
  name text not null,
  unique (city_id, name)
);

create table if not exists public.implementing_agencies (
  id serial primary key,
  name text not null unique
);

create table if not exists public.funding_sources (
  id serial primary key,
  name text not null unique
);

create table if not exists public.barangays (
  id serial primary key,
  area_id integer references public.areas(id) on delete cascade,
  name text not null
);

insert into public.disaster_types (id, name) values
  (1, 'Typhoon'),
  (2, 'Flood'),
  (3, 'Earthquake'),
  (4, 'Landslide'),
  (5, 'Volcanic Eruption'),
  (6, 'Fire')
on conflict do nothing;
insert into public.cities (id, name) values
  (1, 'Manila'),
  (2, 'Quezon City'),
  (3, 'Pasig'),
  (4, 'Makati'),
  (5, 'Taguig'),
  (6, 'Mandaluyong'),
  (7, 'San Juan'),
  (8, 'Valenzuela'),
  (9, 'Caloocan'),
  (10, 'Marikina')
on conflict do nothing;

insert into public.implementing_agencies (id, name) values
  (1, 'City Social Welfare Dept'),
  (2, 'DSWD'),
  (3, 'Philippine Red Cross'),
  (4, 'LGU Health Office'),
  (5, 'NGO partner')
on conflict do nothing;

insert into public.funding_sources (id, name) values
  (1, 'Calamity Fund'),
  (2, 'Special Grant'),
  (3, 'NGO Donation'),
  (4, 'General Fund')
on conflict do nothing;

insert into public.areas (id, city_id, name) values
  (1, 1, 'Tondo'),
  (2, 1, 'Sampaloc'),
  (3, 1, 'Ermita'),
  (4, 1, 'Malate'),
  (5, 1, 'Paco'),
  (6, 1, 'Santa Cruz'),
  (7, 1, 'Binondo'),
  (8, 2, 'Diliman'),
  (9, 2, 'Cubao'),
  (10, 2, 'Commonwealth'),
  (11, 2, 'Payatas'),
  (12, 2, 'Fairview'),
  (13, 3, 'Kapasigan'),
  (14, 3, 'Manggahan'),
  (15, 3, 'Ugong'),
  (16, 3, 'San Joaquin'),
  (17, 4, 'Poblacion'),
  (18, 4, 'Guadalupe Nuevo'),
  (19, 4, 'Guadalupe Viejo'),
  (20, 5, 'Fort Bonifacio'),
  (21, 5, 'Ususan'),
  (22, 5, 'Wawa'),
  (23, 6, 'Wack-Wack'),
  (24, 6, 'Plainview'),
  (25, 6, 'Barangka'),
  (26, 7, 'Greenhills'),
  (27, 7, 'Little Baguio'),
  (28, 8, 'Karuhatan'),
  (29, 8, 'Gen. T. de Leon'),
  (30, 8, 'Marulas'),
  (31, 9, 'Bagong Barrio'),
  (32, 9, 'Grace Park'),
  (33, 9, 'Camarin'),
  (34, 10, 'Concepcion Uno'),
  (35, 10, 'Concepcion Dos'),
  (36, 10, 'Nangka')
on conflict do nothing;

insert into public.barangays (id, area_id, name) values
  (1, 1, 'Barangay 1'),
  (2, 1, 'Barangay 20'),
  (3, 1, 'Barangay 50'),
  (4, 1, 'Barangay 100'),
  (5, 2, 'Barangay 400'),
  (6, 2, 'Barangay 500'),
  (7, 2, 'Barangay 581'),
  (8, 2, 'Barangay 600'),
  (9, 3, 'Barangay 659'),
  (10, 3, 'Barangay 660'),
  (11, 3, 'Barangay 661'),
  (12, 4, 'Barangay 688'),
  (13, 4, 'Barangay 689'),
  (14, 4, 'Barangay 690'),
  (15, 5, 'Barangay 807'),
  (16, 5, 'Barangay 808'),
  (17, 5, 'Barangay 809'),
  (18, 6, 'Barangay 310'),
  (19, 6, 'Barangay 311'),
  (20, 6, 'Barangay 312'),
  (21, 7, 'Barangay 287'),
  (22, 7, 'Barangay 288'),
  (23, 7, 'Barangay 289'),
  (24, 8, 'Krus na Ligas'),
  (25, 8, 'Teachers Village East'),
  (26, 8, 'Teachers Village West'),
  (27, 8, 'UP Campus'),
  (28, 9, 'Socorro'),
  (29, 9, 'Kaunlaran'),
  (30, 9, 'San Martin de Porres'),
  (31, 9, 'E. Rodriguez'),
  (32, 10, 'Commonwealth'),
  (33, 10, 'Batasan Hills'),
  (34, 10, 'Holy Spirit'),
  (35, 10, 'Bagong Silangan'),
  (36, 11, 'Payatas A'),
  (37, 11, 'Payatas B'),
  (38, 11, 'Lupang Pangako'),
  (39, 12, 'Fairview'),
  (40, 12, 'Greater Lagro'),
  (41, 12, 'Santa Monica'),
  (42, 13, 'Kapasigan'),
  (43, 13, 'San Nicolas'),
  (44, 13, 'Santa Cruz'),
  (45, 14, 'Manggahan'),
  (46, 14, 'Santolan'),
  (47, 14, 'Dela Paz'),
  (48, 15, 'Ugong'),
  (49, 15, 'Maybunga'),
  (50, 15, 'Rosario'),
  (51, 16, 'San Joaquin'),
  (52, 16, 'Kalawaan'),
  (53, 16, 'Bambang'),
  (54, 17, 'Poblacion Barangay 1'),
  (55, 17, 'Poblacion Barangay 2'),
  (56, 18, 'Guadalupe Nuevo Brgy A'),
  (57, 18, 'Guadalupe Nuevo Brgy B'),
  (58, 19, 'Guadalupe Viejo Brgy A'),
  (59, 19, 'Guadalupe Viejo Brgy B'),
  (60, 20, 'Central Signal'),
  (61, 20, 'Western Bicutan'),
  (62, 21, 'Ususan East'),
  (63, 21, 'Ususan West'),
  (64, 22, 'Wawa Brgy A'),
  (65, 22, 'Wawa Brgy B'),
  (66, 23, 'Wack-Wack Greenhills'),
  (67, 23, 'Addition Hills'),
  (68, 24, 'Plainview Brgy A'),
  (69, 24, 'Plainview Brgy B'),
  (70, 25, 'Barangka Ilaya'),
  (71, 25, 'Barangka Itaas'),
  (72, 26, 'Greenhills East'),
  (73, 26, 'Greenhills West'),
  (74, 27, 'Little Baguio Brgy A'),
  (75, 27, 'Little Baguio Brgy B'),
  (76, 28, 'Karuhatan North'),
  (77, 28, 'Karuhatan South'),
  (78, 29, 'Gen T. Brgy A'),
  (79, 29, 'Gen T. Brgy B'),
  (80, 30, 'Marulas East'),
  (81, 30, 'Marulas West'),
  (82, 31, 'Bagong Barrio East'),
  (83, 31, 'Bagong Barrio West'),
  (84, 32, 'Grace Park East'),
  (85, 32, 'Grace Park West'),
  (86, 33, 'Camarin Brgy A'),
  (87, 33, 'Camarin Brgy B'),
  (88, 34, 'Concepcion Uno East'),
  (89, 34, 'Concepcion Uno West'),
  (90, 35, 'Concepcion Dos East'),
  (91, 35, 'Concepcion Dos West'),
  (92, 36, 'Nangka Brgy A'),
  (93, 36, 'Nangka Brgy B')
on conflict do nothing;
-- Explicit IDs keep the verified hosted seed keys stable. Move serial sequences
-- forward monotonically so a clean replay cannot reuse a seeded identifier.
select setval('public.disaster_types_id_seq', greatest((select max(id) from public.disaster_types), (select last_value from public.disaster_types_id_seq)), true);
select setval('public.cities_id_seq', greatest((select max(id) from public.cities), (select last_value from public.cities_id_seq)), true);
select setval('public.areas_id_seq', greatest((select max(id) from public.areas), (select last_value from public.areas_id_seq)), true);
select setval('public.implementing_agencies_id_seq', greatest((select max(id) from public.implementing_agencies), (select last_value from public.implementing_agencies_id_seq)), true);
select setval('public.funding_sources_id_seq', greatest((select max(id) from public.funding_sources), (select last_value from public.funding_sources_id_seq)), true);
select setval('public.barangays_id_seq', greatest((select max(id) from public.barangays), (select last_value from public.barangays_id_seq)), true);

alter table public.profiles
  add column if not exists verification_status text default 'Pending';

alter table public.programs
  add column if not exists disaster_type_id integer,
  add column if not exists implementing_agency_id integer,
  add column if not exists funding_source_id integer,
  add column if not exists voucher_type text default 'cash',
  add column if not exists voucher_value numeric default 0,
  add column if not exists voucher_quantity integer default 1,
  add column if not exists voucher_expiration date,
  add column if not exists redemption_type text default 'cash',
  add column if not exists selected_merchants jsonb default '[]'::jsonb,
  add column if not exists distribution_method text default 'automatic',
  add column if not exists wallet_type_toggle boolean default false,
  add column if not exists auto_distribute_toggle boolean default true,
  add column if not exists start_date date,
  add column if not exists eligibility_criteria text[] default '{}'::text[],
  add column if not exists supporting_documents jsonb default '[]'::jsonb,
  add column if not exists voucher_types text[] default '{}'::text[],
  add column if not exists registration_open date,
  add column if not exists registration_close date,
  add column if not exists distribution_start date,
  add column if not exists distribution_end date;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_verification_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_verification_status_check
      check (verification_status = any (array['Pending'::text, 'Verified'::text, 'Rejected'::text]));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.programs'::regclass
      and conname = 'programs_disaster_type_id_fkey'
  ) then
    alter table public.programs
      add constraint programs_disaster_type_id_fkey
      foreign key (disaster_type_id) references public.disaster_types(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.programs'::regclass
      and conname = 'programs_implementing_agency_id_fkey'
  ) then
    alter table public.programs
      add constraint programs_implementing_agency_id_fkey
      foreign key (implementing_agency_id) references public.implementing_agencies(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.programs'::regclass
      and conname = 'programs_funding_source_id_fkey'
  ) then
    alter table public.programs
      add constraint programs_funding_source_id_fkey
      foreign key (funding_source_id) references public.funding_sources(id) on delete set null;
  end if;

  -- The immutable initial migration already owns programs_status_check. Its
  -- active/closed set cannot be broadened without replacing that constraint.
  -- This additive hosted-values check records the recovered target safely;
  -- a later hardening migration must replace the legacy check after review.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.programs'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%scheduled%'
  ) then
    alter table public.programs
      add constraint programs_status_hosted_values_check
      check (status = any (array['draft'::text, 'active'::text, 'scheduled'::text, 'completed'::text, 'closed'::text]));
  end if;
end
$$;

create table if not exists public.program_areas (
  program_id uuid not null references public.programs(id) on delete cascade,
  area_id integer not null references public.areas(id) on delete cascade,
  primary key (program_id, area_id)
);

create table if not exists public.program_barangays (
  program_id uuid not null references public.programs(id) on delete cascade,
  barangay_id integer not null references public.barangays(id) on delete cascade,
  primary key (program_id, barangay_id)
);
alter table public.disaster_types enable row level security;
alter table public.cities enable row level security;
alter table public.areas enable row level security;
alter table public.implementing_agencies enable row level security;
alter table public.funding_sources enable row level security;
alter table public.barangays enable row level security;
alter table public.program_areas enable row level security;
alter table public.program_barangays enable row level security;

-- Match the verified historical API grants. RLS remains the effective access
-- boundary; Task 3 narrows these broad baseline grants and policies.
grant all privileges on table public.disaster_types to anon, authenticated, service_role;
grant all privileges on table public.cities to anon, authenticated, service_role;
grant all privileges on table public.areas to anon, authenticated, service_role;
grant all privileges on table public.implementing_agencies to anon, authenticated, service_role;
grant all privileges on table public.funding_sources to anon, authenticated, service_role;
grant all privileges on table public.barangays to anon, authenticated, service_role;
grant all privileges on table public.program_areas to anon, authenticated, service_role;
grant all privileges on table public.program_barangays to anon, authenticated, service_role;

grant all privileges on sequence public.disaster_types_id_seq to anon, authenticated, service_role;
grant all privileges on sequence public.cities_id_seq to anon, authenticated, service_role;
grant all privileges on sequence public.areas_id_seq to anon, authenticated, service_role;
grant all privileges on sequence public.implementing_agencies_id_seq to anon, authenticated, service_role;
grant all privileges on sequence public.funding_sources_id_seq to anon, authenticated, service_role;
grant all privileges on sequence public.barangays_id_seq to anon, authenticated, service_role;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'cities'
      and policyname = 'Anyone can read cities'
  ) then
    create policy "Anyone can read cities"
      on public.cities for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'areas'
      and policyname = 'Anyone can read areas'
  ) then
    create policy "Anyone can read areas"
      on public.areas for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'barangays'
      and policyname = 'Anyone can read barangays'
  ) then
    create policy "Anyone can read barangays"
      on public.barangays for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'disaster_types'
      and policyname = 'Allow read access to authenticated users on disaster_types'
  ) then
    create policy "Allow read access to authenticated users on disaster_types"
      on public.disaster_types for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'implementing_agencies'
      and policyname = 'Allow read access to authenticated users on implementing_agenci'
  ) then
    create policy "Allow read access to authenticated users on implementing_agencies"
      on public.implementing_agencies for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'funding_sources'
      and policyname = 'Allow read access to authenticated users on funding_sources'
  ) then
    create policy "Allow read access to authenticated users on funding_sources"
      on public.funding_sources for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'program_areas'
      and policyname = 'Allow read/write access to authenticated users on program_areas'
  ) then
    create policy "Allow read/write access to authenticated users on program_areas"
      on public.program_areas for all to authenticated
      using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'programs'
      and policyname = 'LGU can create programs'
  ) then
    create policy "LGU can create programs"
      on public.programs for insert to authenticated
      with check (
        exists (
          select 1 from public.profiles
          where profiles.id = auth.uid() and profiles.role = 'lgu'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'programs'
      and policyname = 'LGU can read all programs'
  ) then
    create policy "LGU can read all programs"
      on public.programs for select to authenticated
      using (
        exists (
          select 1 from public.profiles
          where profiles.id = auth.uid() and profiles.role = 'lgu'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'programs'
      and policyname = 'LGU can update own programs'
  ) then
    create policy "LGU can update own programs"
      on public.programs for update to authenticated
      using (
        created_by = auth.uid()
        and exists (
          select 1 from public.profiles
          where profiles.id = auth.uid() and profiles.role = 'lgu'
        )
      )
      with check (
        created_by = auth.uid()
        and exists (
          select 1 from public.profiles
          where profiles.id = auth.uid() and profiles.role = 'lgu'
        )
      );
  end if;
end
$$;

-- 20260715000000 creates the verified historical program_barangays policy.
-- It is intentionally not duplicated here; Task 3 removes its unrestricted
-- authenticated read/write behavior together with the program_areas policy.

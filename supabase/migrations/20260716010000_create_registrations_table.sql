-- Store one organization registration for each LGU profile.
create table if not exists public.registrations (
  id                            uuid primary key default gen_random_uuid(),
  lgu_id                        uuid not null unique references public.profiles(id) on delete cascade,
  organization_name             text not null,
  organization_type             text not null,
  contact_info                  text not null,
  representative_first_name     text not null,
  representative_last_name      text not null,
  representative_middle_initial text,
  representative_position       text not null,
  document_reference            text not null,
  status                        text not null default 'Pending'
                                  check (status in ('Pending', 'Approved', 'Rejected')),
  rejection_reason              text,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  constraint rejection_reason_only_when_rejected
    check (status = 'Rejected' or rejection_reason is null)
);

alter table public.registrations enable row level security;

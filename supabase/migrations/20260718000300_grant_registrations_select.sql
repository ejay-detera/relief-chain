-- Grant SELECT on registrations to authenticated users (needed for LGU profile loading)

grant select on public.registrations to authenticated;

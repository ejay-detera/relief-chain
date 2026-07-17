-- Restore Data API SELECT access to programs and enrollments.
--
-- Both tables carry organization-scoped RLS policies (e.g. "Organization
-- members can view programs"), but the recovered local baseline created the
-- tables without granting the underlying SELECT privilege to the Data API
-- roles. Without the grant the policies are unreachable and every read fails
-- with "permission denied for table ...", which blocks the Edge Functions (and
-- the app) from resolving a program or enrollment.
--
-- Row-level security remains the authoritative row filter; this migration only
-- makes those existing policies effective. anon is intentionally NOT granted.
grant select on public.programs to authenticated, service_role;
grant select on public.enrollments to authenticated, service_role;

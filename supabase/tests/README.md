# Supabase migration tests

## Super Admin seed idempotency

Run `npm run test:seed-idempotency` from the `relief-chain` repository. The test uses Node's built-in test runner and `fast-check` to generate 100 values of `N` in `[1, 20]`. For each value it starts from empty `auth.users`, `auth.identities`, and `public.profiles` tables, applies the real `20260716000000_super_admin_role_and_seed.sql` migration `N` times to a disposable PostgreSQL 16 container, and asserts exactly one matching user, email identity, and `super_admin` profile.

Docker Desktop must be running with its Linux engine enabled. The test creates and removes a temporary container named `relief-chain-seed-test-<pid>`. If Docker is unavailable, Node reports the test as skipped rather than exercising an in-memory imitation of PostgreSQL.

## Registration RLS access property

Run `npm run test:registration-rls` from the `relief-chain` repository. The test applies the real Super Admin role, `registrations`, denial-log, and registration-RLS migrations to a disposable PostgreSQL 16 container. `fast-check` generates 100 actor/registration cases across `super_admin`, `lgu`, `beneficiary`, and `merchant` roles and `Pending`/`Rejected` rows, then asserts that reads are visible only to Super_Admin or the owning LGU and updates are visible only to Super_Admin or an owning LGU resubmitting a rejected row to `Pending` with a cleared reason. The test uses the application-layer denial logging contract as a separate concern; PostgreSQL RLS itself returns no rows for denied reads/updates, as covered by this property.

Docker Desktop must be running with its Linux engine enabled. The test creates and removes a temporary container named `relief-chain-registration-rls-test-<pid>`. If Docker is unavailable, Node reports the test as skipped.

## Registration creation invariants property

Run `npm run test:registration-creation` from the `relief-chain` repository. The test applies the real Super Admin role, `registrations`, and LGU signup-trigger migrations to a disposable PostgreSQL 16 container. `fast-check` generates 100 valid LGU payloads, attempted initial statuses, and two creation paths: profile creation from signup metadata and direct `registrations` insertion. It asserts that each resulting row is Pending, preserves organization/representative/contact/document fields, and that no attempted Approved insert succeeds.

Docker Desktop must be running with its Linux engine enabled. The test creates and removes a temporary container named `relief-chain-registration-creation-test-<pid>`. If Docker is unavailable, Node reports the test as skipped rather than using an in-memory database.

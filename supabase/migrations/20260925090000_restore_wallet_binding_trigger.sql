-- Restores the wallet-binding protection that 20260717130000_dev_disable_wallet_binding_trigger.sql
-- dropped for local development.
--
-- Context: 20260716020000_add_wallets_and_proof_of_possession.sql created
--   create trigger wallets_protect_verified_binding
--     before update or delete on public.wallets
--     for each row execute function private.protect_verified_wallet_binding();
--
-- 20260717130000 then dropped it so a developer could repoint a verified wallet
-- by hand. Applying that migration to any shared or hosted project leaves a
-- verified wallet silently repointable, which defeats the proof-of-possession
-- binding described in sad-reliefchain.md §Wallet ↔ identity.
--
-- This migration re-creates the trigger so `supabase db push` against a hosted
-- project ends with the protection ON. It is idempotent and safe to re-run.
--
-- If you need the dev behaviour again locally, drop the trigger in a session
-- rather than adding another migration:
--   drop trigger if exists wallets_protect_verified_binding on public.wallets;

drop trigger if exists wallets_protect_verified_binding on public.wallets;

create trigger wallets_protect_verified_binding
before update or delete on public.wallets
for each row execute function private.protect_verified_wallet_binding();

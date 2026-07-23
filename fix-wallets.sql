-- Fix wallet addresses to match bootstrap accounts
-- First, deactivate all current wallets for these owners
UPDATE wallets SET is_active = false 
WHERE owner_id IN ('778a0613-f383-4fb4-9063-7811ed4466c5', '22777e80-c30e-45ce-a0d9-50ae3e0bedd2');

-- Delete the old wallets
DELETE FROM wallets 
WHERE owner_id IN ('778a0613-f383-4fb4-9063-7811ed4466c5', '22777e80-c30e-45ce-a0d9-50ae3e0bedd2');

-- Insert new wallets with bootstrap addresses
INSERT INTO wallets (id, owner_type, owner_id, address, purpose, verification_status, is_active, network, created_at, updated_at)
VALUES 
  (gen_random_uuid(), 'beneficiary_identity', '778a0613-f383-4fb4-9063-7811ed4466c5', 'GBUPDPZIADTBOAVZ73U76WSOOTSQYGBBLVPDD2R5TIRMBZHUMU7Z6MJT', 'beneficiary', 'verified', true, 'stellar_testnet', now(), now()),
  (gen_random_uuid(), 'merchant_entity', '22777e80-c30e-45ce-a0d9-50ae3e0bedd2', 'GB3424ZG7VVPTUBOXIJPNYF2CSOWBHXYG7SAN2FMFRZKPIKJAFNSQI62', 'merchant_settlement', 'verified', true, 'stellar_testnet', now(), now());

SELECT 'Wallets fixed!' as status;

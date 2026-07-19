-- Fix: Grant anon role SELECT access to profiles table for merchant activities query
-- This allows the merchant app to query beneficiary profiles when viewing activities

grant select on public.profiles to anon;

-- Ensure RLS is still enforced - anon users can only see what policies allow
-- Existing policies will continue to restrict access appropriately

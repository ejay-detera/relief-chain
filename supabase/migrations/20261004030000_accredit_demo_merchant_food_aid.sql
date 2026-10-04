-- Migration: 20261004030000_accredit_demo_merchant_food_aid.sql
-- Purpose: Authorize demo merchant in program_merchants for Food Aid program

insert into public.program_merchants (
  id,
  program_id,
  merchant_id,
  category,
  status,
  correlation_id,
  authorized_by,
  authorized_at
) values (
  'd1000000-0000-0000-0000-000000000001',
  'cb361c77-c4cd-4bb5-9a1e-e530c1b38b3c',
  'e84c2f64-b89f-493a-ac1f-6fa9ed6ce89d',
  'Grocery',
  'authorized',
  gen_random_uuid(),
  '8cd38a6d-59ce-4e50-b12d-84819f02e820',
  now()
)
on conflict (id) do update set
  status = 'authorized',
  category = 'Grocery',
  updated_at = now();

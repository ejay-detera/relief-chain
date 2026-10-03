-- Migration: 20261003221000_accredit_merchant_in_food_aid.sql
-- Purpose: Accredit merchant@example.com in Food aid program directly in the database

update public.programs
set selected_merchants = jsonb_build_array(
  'SM Supermarket',
  'Puregold',
  '7-Eleven',
  'Robinsons Supermarket',
  'Metro Gaisano',
  'merchant@example.com',
  'Merchant Owner',
  'Merchant Demo User'
)
where lower(name) = 'food aid';

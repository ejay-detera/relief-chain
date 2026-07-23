CREATE OR REPLACE FUNCTION public.get_or_create_merchant_metrics()
RETURNS public.merchant_metrics
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  result public.merchant_metrics;
  real_vouchers integer;
  real_sales numeric;
BEGIN
  IF current_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = current_user_id AND role = 'merchant'
  ) THEN
    RAISE EXCEPTION 'Only authenticated merchants can access merchant metrics.' USING errcode = '42501';
  END IF;

  SELECT coalesce(sum(confirmed_settlement_count), 0), coalesce(sum(gross_settled_stroops), 0) / 10000000.0
  INTO real_vouchers, real_sales
  FROM public.merchant_balance_projection
  WHERE merchant_id = current_user_id;

  INSERT INTO public.merchant_metrics (merchant_id, vouchers_processed, total_sales, updated_at)
  VALUES (current_user_id, real_vouchers, real_sales, now())
  ON CONFLICT (merchant_id) DO UPDATE SET
    vouchers_processed = EXCLUDED.vouchers_processed,
    total_sales = EXCLUDED.total_sales,
    updated_at = now();

  SELECT * INTO result FROM public.merchant_metrics WHERE merchant_id = current_user_id;
  RETURN result;
END;
$$;

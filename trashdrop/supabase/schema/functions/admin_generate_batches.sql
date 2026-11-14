-- Function public.admin_generate_batches
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- admin_generate_batches(p_type text, p_size text, p_bags_per_batch integer, p_batches integer, p_price_per_batch numeric, p_qr_prefix text, p_max_total integer): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.admin_generate_batches(p_type text, p_size text, p_bags_per_batch integer, p_batches integer, p_price_per_batch numeric DEFAULT NULL::numeric, p_qr_prefix text DEFAULT NULL::text, p_max_total integer DEFAULT 5000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  max_total integer := least(greatest(coalesce(p_max_total, 5000), 1), 5000); -- the client can lower the cap, never raise it
  v_type text := initcap(btrim(coalesce(p_type, '')));
  v_size text := initcap(btrim(coalesce(p_size, '')));
  v_prefix text := upper(btrim(coalesce(p_qr_prefix, '')));
  v_price numeric(12, 2);
  v_unit numeric(12, 2);
  v_stamp text := to_char(now() AT TIME ZONE 'Africa/Accra', 'YYMMDDHH24MI');
  v_num text;
  v_bag_status text := 'generated';
  v_batch record;
  v_ids uuid[] := '{}';
  v_numbers text[] := '{}';
  v_has_scanned boolean := EXISTS (SELECT 1 FROM information_schema.columns
                                   WHERE table_schema = 'public' AND table_name = 'bags' AND column_name = 'scanned');
  i integer;
BEGIN
  IF NOT public.can_do('bags.manage') THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = 'insufficient_privilege'; END IF;

  IF v_type NOT IN ('Organic', 'Recyclable', 'General', 'Hazardous', 'Electronic', 'Other') THEN
    RAISE EXCEPTION 'Unknown trash type "%"', p_type USING ERRCODE = 'check_violation';
  END IF;
  IF v_size NOT IN ('Small', 'Medium', 'Large') THEN
    RAISE EXCEPTION 'Unknown bag size "%"', p_size USING ERRCODE = 'check_violation';
  END IF;
  IF p_bags_per_batch IS NULL OR p_bags_per_batch < 1 OR p_bags_per_batch > 1000 THEN
    RAISE EXCEPTION 'Bags per batch must be a whole number from 1 to 1000' USING ERRCODE = 'check_violation';
  END IF;
  IF p_batches IS NULL OR p_batches < 1 OR p_batches > 1000 THEN
    RAISE EXCEPTION 'Number of batches must be a whole number from 1 to 1000' USING ERRCODE = 'check_violation';
  END IF;
  IF p_bags_per_batch::bigint * p_batches > max_total THEN
    RAISE EXCEPTION 'That is % bags; the limit per submission is %', p_bags_per_batch::bigint * p_batches, max_total USING ERRCODE = 'check_violation';
  END IF;
  -- Every batch needs a price: the price of each bag pays the collector for its pickup
  IF p_price_per_batch IS NULL OR p_price_per_batch <= 0 OR p_price_per_batch > 1000000 THEN
    RAISE EXCEPTION 'Enter the price per batch: more than 0 and up to 1,000,000' USING ERRCODE = 'check_violation';
  END IF;
  v_price := round(p_price_per_batch, 2);
  v_unit := round(p_price_per_batch / p_bags_per_batch, 2);
  IF v_unit < 0.01 THEN
    RAISE EXCEPTION 'Price per batch is too low: each bag must cost at least 0.01' USING ERRCODE = 'check_violation';
  END IF;
  IF v_prefix = '' THEN
    v_prefix := public.td_bag_type_code(v_type) || '-' || to_char(now() AT TIME ZONE 'Africa/Accra', 'YYYYMMDD');
  END IF;
  IF v_prefix !~ '^[A-Z0-9]+(-[A-Z0-9]+)*$' OR length(v_prefix) > 30 THEN
    RAISE EXCEPTION 'QR prefix may only use letters, numbers and single dashes (max 30 characters)' USING ERRCODE = 'check_violation';
  END IF;

  -- Older bags tables may only allow some status values
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.bags'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) ILIKE '%status%' AND pg_get_constraintdef(oid) NOT ILIKE '%generated%') THEN
    v_bag_status := 'active';
  END IF;

  FOR i IN 1..p_batches LOOP
    v_num := v_stamp || lpad(i::text, 3, '0');
    WHILE EXISTS (SELECT 1 FROM public.batches b WHERE to_jsonb(b) ->> 'batch_number' = v_num) LOOP
      v_num := v_stamp || lpad(i::text, 3, '0') || '-' || lpad((floor(random() * 1000))::int::text, 3, '0');
    END LOOP;

    INSERT INTO public.batches (batch_number, batch_name, bag_count, status, notes, type, size, qr_prefix,
                                generated_by, created_by, total_batch_price, unit_price)
    VALUES (v_num, v_type || ' - ' || v_size, p_bags_per_batch, 'active',
            format('Type: %s, Size: %s', v_type, v_size), v_type, v_size, v_prefix,
            auth.uid(), auth.uid(), v_price, v_unit)
    RETURNING id, batch_number INTO v_batch;

    -- Bag codes: <prefix>-<batch number>-0001 … (the printed QR still holds the batch link)
    IF EXISTS (SELECT 1 FROM public.bags WHERE qr_code LIKE v_prefix || '-' || v_num || '-%') THEN
      RAISE EXCEPTION 'Bag codes for % already exist', v_prefix || '-' || v_num USING ERRCODE = 'unique_violation';
    END IF;
    IF v_has_scanned THEN
      INSERT INTO public.bags (batch_id, qr_code, status, scanned, unit_price)
      SELECT v_batch.id, v_prefix || '-' || v_num || '-' || lpad(g::text, 4, '0'), v_bag_status, false, v_unit
      FROM generate_series(1, p_bags_per_batch) g;
    ELSE
      INSERT INTO public.bags (batch_id, qr_code, status, unit_price)
      SELECT v_batch.id, v_prefix || '-' || v_num || '-' || lpad(g::text, 4, '0'), v_bag_status, v_unit
      FROM generate_series(1, p_bags_per_batch) g;
    END IF;

    v_ids := v_ids || v_batch.id;
    v_numbers := v_numbers || v_batch.batch_number::text;
  END LOOP;

  RETURN jsonb_build_object(
    'batch_ids', to_jsonb(v_ids), 'batch_numbers', to_jsonb(v_numbers),
    'batches', p_batches, 'bags_per_batch', p_bags_per_batch, 'total_bags', p_bags_per_batch * p_batches,
    'qr_prefix', v_prefix, 'price_per_batch', v_price, 'unit_price', v_unit, 'bag_status', v_bag_status);
END $function$;

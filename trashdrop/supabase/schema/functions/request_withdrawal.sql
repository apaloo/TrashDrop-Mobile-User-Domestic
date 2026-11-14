-- Function public.request_withdrawal
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- request_withdrawal(p_amount numeric, p_phone text, p_network text, p_account_name text): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.request_withdrawal(p_amount numeric, p_phone text, p_network text, p_account_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_requested numeric := round(coalesce(p_amount, 0), 2);
  v_network text := upper(btrim(coalesce(p_network, '')));
  v_available numeric;
  v_smallest numeric;
  v_total numeric := 0;
  v_count integer := 0;
  v_withdrawal_id uuid;
  r record;
BEGIN
  IF v_uid IS NULL OR NOT public.is_active_collector(v_uid) THEN
    RAISE EXCEPTION 'Only registered, active collectors can cash out' USING ERRCODE = '42501';
  END IF;
  IF v_requested <= 0 THEN
    RAISE EXCEPTION 'Enter an amount to cash out' USING ERRCODE = 'P0001';
  END IF;
  IF nullif(btrim(coalesce(p_phone, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Enter your mobile money number' USING ERRCODE = 'P0001';
  END IF;
  v_network := CASE
    WHEN v_network IN ('MTN') THEN 'MTN'
    WHEN v_network IN ('VODAFONE', 'TELECEL', 'VOD') THEN 'VODAFONE'
    WHEN v_network IN ('AIRTELTIGO', 'AIRTEL TIGO', 'AIRTEL', 'TIGO', 'AT', 'ATL') THEN 'AIRTELTIGO'
    ELSE NULL
  END;
  IF v_network IS NULL THEN
    RAISE EXCEPTION 'Choose MTN, Telecel or AirtelTigo' USING ERRCODE = 'P0001';
  END IF;

  -- One cash-out at a time per collector, so two requests can't claim the same items
  PERFORM pg_advisory_xact_lock(hashtext('withdrawal:' || v_uid::text));

  -- A cash-out that was created but never sent to the gateway frees its items
  UPDATE public.withdrawals
  SET status = 'cancelled', gateway_error = 'Not sent within 15 minutes', updated_at = now()
  WHERE collector_id = v_uid AND status = 'pending' AND created_at < now() - interval '15 minutes';

  SELECT coalesce(sum(amount), 0), min(amount) INTO v_available, v_smallest
  FROM public.td_withdrawable_items(v_uid);

  IF v_available <= 0 THEN
    RAISE EXCEPTION 'You have no earnings to cash out yet. Dispose your collected waste first.' USING ERRCODE = 'P0001';
  END IF;

  -- Whole items only, up to the requested amount: everything if the amount
  -- covers the balance, otherwise largest first (a close-to-best fit without
  -- an expensive exact search)
  CREATE TEMP TABLE IF NOT EXISTS td_withdrawal_pick (item_type text, item_id text, amount numeric) ON COMMIT DROP;
  TRUNCATE td_withdrawal_pick;
  FOR r IN
    SELECT * FROM public.td_withdrawable_items(v_uid) ORDER BY amount DESC, earned_at NULLS LAST, item_id
  LOOP
    IF v_total + r.amount <= v_requested THEN
      INSERT INTO td_withdrawal_pick VALUES (r.item_type, r.item_id, r.amount);
      v_total := v_total + r.amount;
      v_count := v_count + 1;
    END IF;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'The smallest amount you can cash out right now is GHS %', to_char(v_smallest, 'FM999999990.00')
      USING ERRCODE = 'P0001';
  END IF;
  IF v_total < 1 THEN
    RAISE EXCEPTION 'The minimum cash-out is GHS 1.00' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.withdrawals (collector_id, amount, status, payment_method, phone_number, network, payment_details)
  VALUES (v_uid, v_total, 'pending', 'mobile_money', btrim(p_phone), v_network,
          jsonb_build_object('accountName', coalesce(nullif(btrim(p_account_name), ''), 'Collector'),
                             'itemCount', v_count, 'requestedAmount', v_requested))
  RETURNING id INTO v_withdrawal_id;

  INSERT INTO public.withdrawal_items (withdrawal_id, item_type, item_id, amount)
  SELECT v_withdrawal_id, item_type, item_id, amount FROM td_withdrawal_pick;

  RETURN jsonb_build_object(
    'withdrawal_id', v_withdrawal_id,
    'amount', v_total,
    'requested', v_requested,
    'items', v_count,
    'available', v_available
  );
END;
$function$;

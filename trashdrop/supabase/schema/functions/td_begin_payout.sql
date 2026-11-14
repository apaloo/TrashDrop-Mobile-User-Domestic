-- Function public.td_begin_payout
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_begin_payout(p_withdrawal_id uuid, p_user_id uuid, p_amount_pesewas bigint): execute: service_role
CREATE OR REPLACE FUNCTION public.td_begin_payout(p_withdrawal_id uuid, p_user_id uuid, p_amount_pesewas bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  w public.withdrawals;
  v_items numeric;
BEGIN
  SELECT * INTO w FROM public.withdrawals WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT FOUND OR w.collector_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Cash-out not found' USING ERRCODE = 'P0002';
  END IF;
  IF w.status <> 'pending' THEN
    RAISE EXCEPTION 'This cash-out has already been sent (it is %)', w.status USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.is_active_collector(p_user_id) THEN
    RAISE EXCEPTION 'Only registered, active collectors can cash out' USING ERRCODE = '42501';
  END IF;
  IF round(w.amount * 100) <> p_amount_pesewas THEN
    RAISE EXCEPTION 'Amount does not match the cash-out (GHS %)', to_char(w.amount, 'FM999999990.00') USING ERRCODE = 'P0001';
  END IF;
  SELECT coalesce(sum(amount), 0) INTO v_items FROM public.withdrawal_items WHERE withdrawal_id = w.id;
  IF round(v_items, 2) <> round(w.amount, 2) THEN
    RAISE EXCEPTION 'Cash-out items do not add up to the amount' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.withdrawals SET status = 'processing', processed_at = now(), updated_at = now()
  WHERE id = w.id;

  RETURN jsonb_build_object('withdrawal_id', w.id, 'amount', w.amount,
                            'phone_number', w.phone_number, 'network', w.network);
END;
$function$;

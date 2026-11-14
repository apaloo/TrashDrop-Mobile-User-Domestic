-- Function public.td_finish_payout
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_finish_payout(p_withdrawal_id uuid, p_ok boolean, p_transaction_id text, p_response jsonb, p_error text): execute: service_role
CREATE OR REPLACE FUNCTION public.td_finish_payout(p_withdrawal_id uuid, p_ok boolean, p_transaction_id text DEFAULT NULL::text, p_response jsonb DEFAULT NULL::jsonb, p_error text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE public.withdrawals
  SET status = CASE WHEN p_ok THEN status ELSE 'failed' END,   -- stays processing until confirmed
      gateway_transaction_id = coalesce(p_transaction_id, gateway_transaction_id),
      gateway_response = coalesce(p_response, gateway_response),
      gateway_error = CASE WHEN p_ok THEN NULL ELSE p_error END,
      updated_at = now()
  WHERE id = p_withdrawal_id AND status = 'processing';
$function$;

-- Function public.td_complete_payout
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_complete_payout(p_withdrawal_id uuid, p_ok boolean, p_transaction_id text, p_response jsonb, p_error text): execute: service_role
CREATE OR REPLACE FUNCTION public.td_complete_payout(p_withdrawal_id uuid, p_ok boolean, p_transaction_id text DEFAULT NULL::text, p_response jsonb DEFAULT NULL::jsonb, p_error text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
BEGIN
  UPDATE public.withdrawals
  SET status = CASE WHEN p_ok THEN 'completed' ELSE 'failed' END,
      completed_at = CASE WHEN p_ok THEN now() ELSE completed_at END,
      gateway_transaction_id = coalesce(p_transaction_id, gateway_transaction_id),
      gateway_response = coalesce(p_response, gateway_response),
      gateway_error = CASE WHEN p_ok THEN NULL ELSE coalesce(p_error, 'Payout failed') END,
      updated_at = now()
  WHERE id = p_withdrawal_id AND status = 'processing'
  RETURNING status INTO v_status;

  IF v_status IS NULL THEN
    -- Not processing (already completed/failed, or unknown): report what it is
    SELECT status INTO v_status FROM public.withdrawals WHERE id = p_withdrawal_id;
    RETURN coalesce('unchanged:' || v_status, 'not_found');
  END IF;
  RETURN v_status;
END;
$function$;

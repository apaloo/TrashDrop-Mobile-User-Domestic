-- Function public.validate_cashout
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- validate_cashout(p_collector_id uuid, p_amount numeric): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.validate_cashout(p_collector_id uuid, p_amount numeric)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_available numeric;
BEGIN
  IF auth.uid() IS NOT NULL
     AND (p_collector_id IS DISTINCT FROM auth.uid() OR NOT public.is_active_collector(auth.uid())) THEN
    RETURN json_build_object(
      'valid', false,
      'error', 'Only registered, active collectors can cash out',
      'available', 0
    );
  END IF;

  v_available := get_collector_available_earnings(p_collector_id);

  IF p_amount <= 0 THEN
    RETURN json_build_object(
      'valid', false,
      'error', 'Amount must be greater than zero',
      'available', v_available
    );
  END IF;

  IF p_amount > v_available THEN
    RETURN json_build_object(
      'valid', false,
      'error', 'Insufficient balance',
      'available', v_available,
      'requested', p_amount
    );
  END IF;

  RETURN json_build_object(
    'valid', true,
    'available', v_available,
    'requested', p_amount,
    'remaining', v_available - p_amount
  );
END;
$function$;

-- Function public.calculate_correct_collector_payout
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- calculate_correct_collector_payout(p_fee numeric, p_is_urgent boolean, p_deadhead_km numeric, p_collector_tips numeric, p_collector_recyclables_payout numeric, p_collector_loyalty_cashback numeric): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.calculate_correct_collector_payout(p_fee numeric, p_is_urgent boolean, p_deadhead_km numeric, p_collector_tips numeric, p_collector_recyclables_payout numeric, p_collector_loyalty_cashback numeric)
 RETURNS TABLE(collector_core_payout numeric, collector_urgent_payout numeric, collector_total_payout numeric, shareable_amount numeric, base_portion numeric, urgent_portion numeric)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_platform_fee DECIMAL := 1.00;
  v_shareable DECIMAL;
  v_base DECIMAL;
  v_urgent DECIMAL;
  v_deadhead_share DECIMAL;
  v_collector_core DECIMAL;
  v_collector_urgent DECIMAL;
  v_collector_tips DECIMAL;
  v_collector_recyclables DECIMAL;
  v_collector_loyalty DECIMAL;
  v_collector_total DECIMAL;
BEGIN
  v_shareable := GREATEST(COALESCE(p_fee, 0) - v_platform_fee, 0);
  
  IF COALESCE(p_is_urgent, FALSE) THEN
    v_base := v_shareable / 1.30;
    v_urgent := v_shareable - v_base;
  ELSE
    v_base := v_shareable;
    v_urgent := 0;
  END IF;
  
  v_deadhead_share := get_deadhead_share(p_deadhead_km);
  v_collector_core := v_base * v_deadhead_share;
  v_collector_urgent := v_urgent * 0.75;
  
  v_collector_tips := COALESCE(p_collector_tips, 0);
  v_collector_recyclables := COALESCE(p_collector_recyclables_payout, 0);
  v_collector_loyalty := COALESCE(p_collector_loyalty_cashback, 0);
  
  v_collector_total := v_collector_core + v_collector_urgent + 
                       v_collector_tips + v_collector_recyclables + v_collector_loyalty;
  
  RETURN QUERY SELECT 
    ROUND(v_collector_core, 2),
    ROUND(v_collector_urgent, 2),
    ROUND(v_collector_total, 2),
    ROUND(v_shareable, 2),
    ROUND(v_base, 2),
    ROUND(v_urgent, 2);
END;
$function$;

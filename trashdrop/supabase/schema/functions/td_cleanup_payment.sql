-- Function public.td_cleanup_payment
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_cleanup_payment(p_cleanup_fee numeric, p_size text, p_severity text, p_collector_type text): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_cleanup_payment(p_cleanup_fee numeric, p_size text, p_severity text, p_collector_type text)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN coalesce(p_collector_type, 'collector') = 'volunteer' THEN 0::numeric
    WHEN p_cleanup_fee > 0 THEN round(p_cleanup_fee, 2)
    ELSE round(
      CASE p_size WHEN 'small' THEN 5.00 WHEN 'medium' THEN 10.00 WHEN 'large' THEN 20.00 ELSE 10.00 END
      * CASE p_severity WHEN 'high' THEN 1.5 ELSE 1.0 END, 2)
  END
$function$;

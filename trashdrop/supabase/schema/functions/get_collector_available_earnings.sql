-- Function public.get_collector_available_earnings
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- get_collector_available_earnings(p_collector_id uuid): execute: service_role
CREATE OR REPLACE FUNCTION public.get_collector_available_earnings(p_collector_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(sum(amount), 0) FROM public.td_withdrawable_items(p_collector_id);
$function$;

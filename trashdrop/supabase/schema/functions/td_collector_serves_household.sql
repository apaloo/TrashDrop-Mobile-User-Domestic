-- Function public.td_collector_serves_household
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_collector_serves_household(p_household_id uuid): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_collector_serves_household(p_household_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND p_household_id IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.digital_bins b
       WHERE b.user_id = p_household_id
         AND b.collector_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.pickup_requests r
       WHERE r.user_id = p_household_id
         AND r.collector_id = auth.uid()
    )
  );
$function$;

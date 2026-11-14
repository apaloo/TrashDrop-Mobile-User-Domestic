-- Function public.td_household_can_follow
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_household_can_follow(p_collector_id uuid): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_household_can_follow(p_collector_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND p_collector_id IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.digital_bins b
       WHERE b.user_id = auth.uid()
         AND b.collector_id = p_collector_id
         AND b.status IN ('accepted', 'active', 'en_route', 'in_transit', 'arrived')
    )
    OR EXISTS (
      SELECT 1 FROM public.pickup_requests r
       WHERE r.user_id = auth.uid()
         AND r.collector_id = p_collector_id
         AND r.status IN ('accepted', 'active', 'en_route', 'in_transit', 'arrived')
    )
  );
$function$;

-- Function public.td_collector_can_see_bin_location
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_collector_can_see_bin_location(p_location_id uuid): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_collector_can_see_bin_location(p_location_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND p_location_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.digital_bins b
     WHERE b.location_id = p_location_id
       AND (
         b.collector_id = auth.uid()
         OR (b.status = 'pending' AND b.collector_id IS NULL
             AND public.td_is_active_collector(auth.uid()))
       )
  );
$function$;

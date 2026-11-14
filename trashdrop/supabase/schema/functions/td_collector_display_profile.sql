-- Function public.td_collector_display_profile
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_collector_display_profile(p_collector_id uuid): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_collector_display_profile(p_collector_id uuid)
 RETURNS TABLE(user_id uuid, first_name text, last_name text, phone text, rating numeric, vehicle_type text, vehicle_plate text, vehicle_color text, profile_image_url text, status text, region text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.user_id, c.first_name, c.last_name, c.phone, c.rating,
         c.vehicle_type, c.vehicle_plate, c.vehicle_color,
         c.profile_image_url, c.status, c.region
    FROM public.collector_profiles c
   WHERE c.user_id = p_collector_id
     AND auth.uid() IS NOT NULL
     AND (
       c.user_id = auth.uid()
       OR public.td_is_staff()
       OR EXISTS (SELECT 1 FROM public.digital_bins b
                   WHERE b.user_id = auth.uid() AND b.collector_id = p_collector_id)
       OR EXISTS (SELECT 1 FROM public.pickup_requests r
                   WHERE r.user_id = auth.uid() AND r.collector_id = p_collector_id)
     );
$function$;

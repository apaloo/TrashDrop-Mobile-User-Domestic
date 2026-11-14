-- Function public.get_my_coverage_arrivals
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- get_my_coverage_arrivals(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.get_my_coverage_arrivals()
 RETURNS TABLE(waitlist_id uuid, address text, latitude double precision, longitude double precision, suburb character varying, district character varying)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT w.id, w.address, w.latitude, w.longitude, c.suburb, c.district
  FROM public.coverage_waitlist w
  CROSS JOIN LATERAL public.check_service_coverage(w.latitude, w.longitude) c
  WHERE w.user_id = auth.uid()
    AND w.wants_notification
    AND w.closed_at IS NULL
    AND c.is_covered
  ORDER BY w.created_at;
$function$;

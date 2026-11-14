-- Function public.join_coverage_waitlist
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- join_coverage_waitlist(p_latitude double precision, p_longitude double precision, p_address text): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.join_coverage_waitlist(p_latitude double precision, p_longitude double precision, p_address text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to join the waitlist' USING ERRCODE = '42501';
  END IF;

  RETURN public.record_coverage_demand(
    p_latitude, p_longitude, 'app', auth.uid(), NULL, p_address, true
  );
END;
$function$;

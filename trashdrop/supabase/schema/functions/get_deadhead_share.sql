-- Function public.get_deadhead_share
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- get_deadhead_share(deadhead_km numeric): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.get_deadhead_share(deadhead_km numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  IF deadhead_km IS NULL OR deadhead_km <= 2 THEN
    RETURN 0.85;
  ELSIF deadhead_km <= 5 THEN
    RETURN 0.87;
  ELSIF deadhead_km <= 10 THEN
    RETURN 0.89;
  ELSE
    RETURN 0.92;
  END IF;
END;
$function$;

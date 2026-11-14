-- Function public.set_illegal_dumping_completed_at
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- set_illegal_dumping_completed_at(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.set_illegal_dumping_completed_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  IF lower(trim(coalesce(NEW.status, ''))) IN ('completed', 'disposed') THEN
    IF TG_OP = 'INSERT' OR lower(trim(coalesce(OLD.status, ''))) NOT IN ('completed', 'disposed') THEN
      NEW.completed_at := coalesce(NEW.completed_at, now());
    END IF;
  ELSE
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

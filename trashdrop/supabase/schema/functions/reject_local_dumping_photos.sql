-- Function public.reject_local_dumping_photos
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- reject_local_dumping_photos(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.reject_local_dumping_photos()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM unnest(coalesce(NEW.photos, '{}'::text[])) AS p
    WHERE p ~* '^\s*(blob|data):'
  ) THEN
    RAISE EXCEPTION 'Photos must be uploaded to storage first (blob:/data: URLs are not allowed)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

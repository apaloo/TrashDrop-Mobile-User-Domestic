-- Function public.set_digital_bin_qr_code_url
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- set_digital_bin_qr_code_url(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.set_digital_bin_qr_code_url()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  NEW.qr_code_url := 'https://app.trashdrops.com/bin/' || NEW.id::text;
  RETURN NEW;
END;
$function$;

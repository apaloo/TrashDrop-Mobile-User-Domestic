-- Function public.td_pickup_email_secret_ok
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_pickup_email_secret_ok(p_secret text): execute: service_role
CREATE OR REPLACE FUNCTION public.td_pickup_email_secret_ok(p_secret text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets s
     WHERE s.name = 'td_pickup_email_cron_secret' AND s.decrypted_secret = p_secret
  );
$function$;

-- Function public.td_today_accra
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_today_accra(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_today_accra()
 RETURNS date
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select (now() at time zone 'Africa/Accra')::date; $function$;

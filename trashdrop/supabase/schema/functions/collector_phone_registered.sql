-- Function public.collector_phone_registered
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- collector_phone_registered(p_phone text): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.collector_phone_registered(p_phone text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  WITH target AS (
    SELECT regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') AS digits
  )
  SELECT length((SELECT digits FROM target)) >= 9 AND EXISTS (
    SELECT 1
    FROM public.collector_profiles cp
    JOIN auth.users u ON u.id = cp.user_id
    WHERE regexp_replace(coalesce(u.phone, ''), '\D', '', 'g') = (SELECT digits FROM target)
       OR regexp_replace(coalesce(cp.phone, ''), '\D', '', 'g') = (SELECT digits FROM target)
  );
$function$;

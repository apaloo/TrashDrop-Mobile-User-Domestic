-- Function public.is_active_collector
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- is_active_collector(p_user_id uuid): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.is_active_collector(p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.collector_profiles cp
    WHERE cp.user_id = p_user_id
      AND cp.status <> 'suspended'
      AND cp.deactivated_at IS NULL
      AND nullif(btrim(cp.first_name), '') IS NOT NULL
      AND nullif(btrim(cp.last_name), '') IS NOT NULL
      AND nullif(btrim(cp.phone), '') IS NOT NULL
      AND nullif(btrim(cp.region), '') IS NOT NULL
      AND nullif(btrim(cp.vehicle_type), '') IS NOT NULL
      AND coalesce(nullif(btrim(cp.license_plate), ''), nullif(btrim(cp.vehicle_plate), '')) IS NOT NULL
  );
$function$;

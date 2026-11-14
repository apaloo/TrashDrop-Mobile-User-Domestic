-- Function public.update_collector_location
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- update_collector_location(p_user_id uuid, p_longitude double precision, p_latitude double precision): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.update_collector_location(p_user_id uuid, p_longitude double precision, p_latitude double precision)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL
     AND (p_user_id IS DISTINCT FROM auth.uid() OR NOT public.is_active_collector(auth.uid())) THEN
    RAISE EXCEPTION 'Only registered, active collectors can go On-Duty'
      USING ERRCODE = '42501';
  END IF;

  UPDATE collector_profiles
  SET
    current_latitude = p_latitude,
    current_longitude = p_longitude,
    current_location = ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326),
    location_updated_at = NOW(),
    last_active = NOW(),
    updated_at = NOW()
  WHERE user_id = p_user_id;
END;
$function$;

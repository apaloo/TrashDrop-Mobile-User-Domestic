-- Function public.add_user_location
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- add_user_location(user_uuid uuid, name text, address text, lat numeric, lng numeric): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.add_user_location(user_uuid uuid, name text, address text, lat numeric, lng numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE loc_id UUID;
BEGIN
  PERFORM public.td_assert_self_or_staff(user_uuid);
  INSERT INTO locations (
    user_id, location_name, address, latitude, longitude, is_default
  )
  VALUES (
    user_uuid,
    name,
    address,
    lat,
    lng,
    true
  )
  RETURNING id INTO loc_id;

  INSERT INTO user_activity (user_id, activity_type, description)
  VALUES (user_uuid, 'location_added', 'User added location during onboarding');

  RETURN loc_id;
END;
$function$;

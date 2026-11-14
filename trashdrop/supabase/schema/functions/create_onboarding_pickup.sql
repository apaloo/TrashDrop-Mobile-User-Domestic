-- Function public.create_onboarding_pickup
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- create_onboarding_pickup(user_uuid uuid, location_id uuid, bag_count integer): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.create_onboarding_pickup(user_uuid uuid, location_id uuid, bag_count integer DEFAULT 1)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  loc RECORD;
  pickup_id TEXT;
BEGIN
  PERFORM public.td_assert_self_or_staff(user_uuid);
  -- Get location from "locations" table
  SELECT * INTO loc
  FROM locations
  WHERE id = location_id AND user_id = user_uuid;

  IF loc IS NULL THEN
    RETURN JSON_BUILD_OBJECT('error', 'Location not found');
  END IF;

  -- Build pickup request with correct column types
  INSERT INTO pickup_requests (
    id,
    user_id,
    status,
    waste_type,
    special_instructions,
    location,
    coordinates,
    fee,
    estimated_volume,
    address,
    created_at
  )
  VALUES (
    gen_random_uuid()::TEXT,
    user_uuid,
    'pending',
    'general',
    'Onboarding pickup request',
    -- location must match CHECK: POINT(lng lat)
    'POINT(' || COALESCE(loc.longitude, 0) || ' ' || COALESCE(loc.latitude, 0) || ')',
    -- coordinates is PostGIS geometry
    ST_SetSRID(ST_MakePoint(
      COALESCE(loc.longitude, 0),
      COALESCE(loc.latitude, 0)
    ), 4326),
    0,
    bag_count,
    COALESCE(loc.address, loc.location_name),
    NOW()
  )
  RETURNING id INTO pickup_id;

  INSERT INTO user_activity (user_id, activity_type, description)
  VALUES (user_uuid, 'pickup_requested', 'Onboarding pickup created');

  RETURN JSON_BUILD_OBJECT('status', 'success', 'pickup_id', pickup_id);
END;
$function$;

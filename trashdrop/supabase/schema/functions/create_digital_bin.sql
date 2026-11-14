-- Function public.create_digital_bin
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- create_digital_bin(user_uuid uuid, location_id uuid): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.create_digital_bin(user_uuid uuid, location_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  bin_id UUID;
  resolved_location_id UUID;
  user_location RECORD;
BEGIN
  PERFORM public.td_assert_self_or_staff(user_uuid);
  resolved_location_id := location_id;

  -- If no location_id provided, create one in bin_locations
  -- from the user's default location in "locations" table
  IF resolved_location_id IS NULL THEN
    -- Try to find user's default or most recent location
    SELECT id, location_name, address, latitude, longitude
    INTO user_location
    FROM locations
    WHERE user_id = user_uuid
    ORDER BY is_default DESC, created_at DESC
    LIMIT 1;

    IF user_location IS NOT NULL THEN
      INSERT INTO bin_locations (
        user_id, location_name, address,
        coordinates, is_default
      )
      VALUES (
        user_uuid,
        user_location.location_name,
        user_location.address,
        ST_SetSRID(ST_MakePoint(
          COALESCE(user_location.longitude, 0),
          COALESCE(user_location.latitude, 0)
        ), 4326),
        true
      )
      RETURNING id INTO resolved_location_id;
    ELSE
      -- No location at all — create a placeholder bin_location
      INSERT INTO bin_locations (
        user_id, location_name, address,
        coordinates, is_default
      )
      VALUES (
        user_uuid,
        'Default',
        'Set during onboarding',
        ST_SetSRID(ST_MakePoint(0, 0), 4326),
        true
      )
      RETURNING id INTO resolved_location_id;
    END IF;
  END IF;

  -- Create the digital bin
  INSERT INTO digital_bins (
    user_id, location_id, qr_code_url, status, expires_at
  )
  VALUES (
    user_uuid,
    resolved_location_id,
    'https://app.trashdrops.com/bin/' || gen_random_uuid(),
    'pending',
    NOW() + INTERVAL '7 days'
  )
  RETURNING id INTO bin_id;

  INSERT INTO user_activity (user_id, activity_type, description)
  VALUES (user_uuid, 'digital_bin_requested', 'Digital bin created during onboarding');

  RETURN bin_id;
END;
$function$;

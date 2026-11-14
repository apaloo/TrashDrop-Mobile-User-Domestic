-- Function public.get_user_onboarding_state
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- get_user_onboarding_state(user_uuid uuid): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.get_user_onboarding_state(user_uuid uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  location_count INTEGER;
  state TEXT;
  available_bags INTEGER;
  total_bags_scanned INTEGER;
  has_bags_selection BOOLEAN;
BEGIN
  PERFORM public.td_assert_self_or_staff(user_uuid);
  -- Count locations
  SELECT COUNT(*) INTO location_count
  FROM locations
  WHERE user_id = user_uuid;

  -- Calculate available bags from batches
  SELECT COALESCE(SUM(bag_count), 0) INTO available_bags
  FROM batches
  WHERE created_by = user_uuid;

  -- Calculate total bags scanned from bag_inventory
  SELECT COUNT(*) INTO total_bags_scanned
  FROM bag_inventory
  WHERE user_id = user_uuid;

  -- Check if user has made a "has bags" selection
  SELECT EXISTS(
    SELECT 1 FROM user_activity
    WHERE user_id = user_uuid
    AND activity_type IN ('has_bags_true', 'has_bags_false')
  ) INTO has_bags_selection;

  -- Determine state
  IF available_bags > 0 THEN
    state := 'READY_FOR_PICKUP';
  ELSIF location_count > 0 THEN
    state := 'LOCATION_SET';
  ELSE
    state := 'NEW_USER';
  END IF;

  RETURN JSON_BUILD_OBJECT(
    'state', state,
    'available_bags', available_bags,
    'total_bags_scanned', total_bags_scanned,
    'location_count', location_count,
    'has_bags_selection', has_bags_selection
  );
END;
$function$;

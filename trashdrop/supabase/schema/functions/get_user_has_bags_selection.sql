-- Function public.get_user_has_bags_selection
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- get_user_has_bags_selection(user_uuid uuid): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.get_user_has_bags_selection(user_uuid uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  has_bags_selection BOOLEAN := FALSE;
  selection_made BOOLEAN := FALSE;
  has_bags BOOLEAN := FALSE;
BEGIN
  PERFORM public.td_assert_self_or_staff(user_uuid);
  -- Check if user has made a bags selection
  SELECT EXISTS(
    SELECT 1 FROM user_activity 
    WHERE user_id = user_uuid AND activity_type IN ('has_bags_true', 'has_bags_false')
  ) INTO selection_made;
  
  -- If selection made, determine what they selected
  IF selection_made THEN
    has_bags_selection := TRUE;
    
    -- Check if they selected "has bags"
    SELECT EXISTS(
      SELECT 1 FROM user_activity 
      WHERE user_id = user_uuid AND activity_type = 'has_bags_true'
    ) INTO has_bags;
  END IF;
  
  RETURN JSON_BUILD_OBJECT(
    'selection_made', has_bags_selection,
    'has_bags', has_bags,
    'next_step', CASE 
      WHEN NOT selection_made THEN 'has_bags'
      WHEN has_bags THEN 'location'
      ELSE 'choose_service'
    END
  );
END;
$function$;

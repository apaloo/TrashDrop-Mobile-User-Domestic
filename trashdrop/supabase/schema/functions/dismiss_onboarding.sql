-- Function public.dismiss_onboarding
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- dismiss_onboarding(user_uuid uuid): execute: service_role
CREATE OR REPLACE FUNCTION public.dismiss_onboarding(user_uuid uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  -- Mark onboarding as completed/dismissed
  INSERT INTO user_activity (user_id, activity_type, description)
  VALUES (user_uuid, 'onboarding_completed', 'User dismissed onboarding')
  ON CONFLICT (user_id, activity_type) DO NOTHING;
  
  RETURN JSON_BUILD_OBJECT('success', TRUE, 'message', 'Onboarding dismissed');
END;
$function$;

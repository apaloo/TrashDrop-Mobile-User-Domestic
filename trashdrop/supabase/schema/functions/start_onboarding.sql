-- Function public.start_onboarding
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- start_onboarding(user_uuid uuid): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.start_onboarding(user_uuid uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.td_assert_self_or_staff(user_uuid);
  -- Record onboarding start
  INSERT INTO user_activity (user_id, activity_type, description)
  VALUES (user_uuid, 'onboarding_started', 'User started onboarding')
  ON CONFLICT (user_id, activity_type) DO NOTHING;
  
  RETURN JSON_BUILD_OBJECT('success', TRUE, 'message', 'Onboarding started');
END;
$function$;

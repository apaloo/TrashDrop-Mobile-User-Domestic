-- Function public.create_promotional_usage_on_signup
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- create_promotional_usage_on_signup(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.create_promotional_usage_on_signup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.promotional_usage (user_id, used_count)
  VALUES (NEW.id, 0)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

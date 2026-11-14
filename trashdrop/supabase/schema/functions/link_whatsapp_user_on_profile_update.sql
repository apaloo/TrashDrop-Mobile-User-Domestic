-- Function public.link_whatsapp_user_on_profile_update
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- link_whatsapp_user_on_profile_update(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.link_whatsapp_user_on_profile_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  IF NEW.phone IS NOT NULL AND NEW.phone != '' THEN
    UPDATE public.whatsapp_users
    SET user_id = NEW.id, updated_at = now()
    WHERE phone = NEW.phone AND user_id IS NULL;
  END IF;
  RETURN NEW;
END;
$function$;

-- Function public.upsert_whatsapp_user
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- upsert_whatsapp_user(p_phone text, p_display_name text): execute: service_role
CREATE OR REPLACE FUNCTION public.upsert_whatsapp_user(p_phone text, p_display_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  -- Try to find existing
  SELECT id INTO v_id FROM public.whatsapp_users WHERE phone = p_phone;
  
  IF v_id IS NULL THEN
    INSERT INTO public.whatsapp_users (phone, display_name)
    VALUES (p_phone, p_display_name)
    RETURNING id INTO v_id;
  ELSE
    -- Update display name and last seen
    UPDATE public.whatsapp_users 
    SET display_name = COALESCE(p_display_name, display_name),
        updated_at = now()
    WHERE id = v_id;
  END IF;
  
  RETURN v_id;
END;
$function$;

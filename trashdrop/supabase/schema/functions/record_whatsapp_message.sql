-- Function public.record_whatsapp_message
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- record_whatsapp_message(p_message_id text, p_phone text): execute: service_role
CREATE OR REPLACE FUNCTION public.record_whatsapp_message(p_message_id text, p_phone text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.whatsapp_messages (message_id, phone)
  VALUES (p_message_id, p_phone)
  ON CONFLICT (message_id) DO NOTHING;
  RETURN FOUND;
END;
$function$;

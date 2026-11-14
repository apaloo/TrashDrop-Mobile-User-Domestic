-- Function public.update_whatsapp_session
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- update_whatsapp_session(p_session_id uuid, p_state text, p_collected_data jsonb): execute: service_role
CREATE OR REPLACE FUNCTION public.update_whatsapp_session(p_session_id uuid, p_state text, p_collected_data jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.whatsapp_sessions
  SET state = p_state,
      collected_data = COALESCE(p_collected_data, collected_data),
      last_message_at = now(),
      expires_at = now() + interval '30 minutes',
      updated_at = now()
  WHERE id = p_session_id;
END;
$function$;

-- Function public.cleanup_whatsapp_messages
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- cleanup_whatsapp_messages(): execute: service_role
CREATE OR REPLACE FUNCTION public.cleanup_whatsapp_messages()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_deleted INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM public.whatsapp_messages
    WHERE received_at < NOW() - INTERVAL '7 days'
    RETURNING message_id
  )
  SELECT COUNT(*) INTO v_deleted FROM deleted;
  RETURN v_deleted;
END;
$function$;

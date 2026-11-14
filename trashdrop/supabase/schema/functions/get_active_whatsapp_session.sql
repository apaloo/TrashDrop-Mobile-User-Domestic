-- Function public.get_active_whatsapp_session
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- get_active_whatsapp_session(p_phone text): execute: service_role
CREATE OR REPLACE FUNCTION public.get_active_whatsapp_session(p_phone text)
 RETURNS TABLE(session_id uuid, whatsapp_user_id uuid, state text, collected_data jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_wa_user_id uuid;
  v_session_id uuid;
  v_state text;
  v_data jsonb;
BEGIN
  -- Ensure user exists
  SELECT id INTO v_wa_user_id FROM public.whatsapp_users WHERE phone = p_phone;
  
  IF v_wa_user_id IS NULL THEN
    INSERT INTO public.whatsapp_users (phone)
    VALUES (p_phone)
    RETURNING id INTO v_wa_user_id;
  END IF;
  
  -- Find active (non-expired, non-idle) session
  SELECT ws.id, ws.state, ws.collected_data 
  INTO v_session_id, v_state, v_data
  FROM public.whatsapp_sessions ws
  WHERE ws.phone = p_phone 
    AND ws.state != 'idle'
    AND ws.expires_at > now()
  ORDER BY ws.created_at DESC
  LIMIT 1;
  
  -- If no active session, create one in idle state
  IF v_session_id IS NULL THEN
    INSERT INTO public.whatsapp_sessions (whatsapp_user_id, phone, state)
    VALUES (v_wa_user_id, p_phone, 'idle')
    RETURNING id, 'idle'::text, '{}'::jsonb INTO v_session_id, v_state, v_data;
  END IF;
  
  RETURN QUERY SELECT v_session_id, v_wa_user_id, v_state, v_data;
END;
$function$;

-- Function public.record_coverage_demand
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- record_coverage_demand(p_latitude double precision, p_longitude double precision, p_channel text, p_user_id uuid, p_whatsapp_user_id uuid, p_address text, p_wants_notification boolean): execute: service_role
CREATE OR REPLACE FUNCTION public.record_coverage_demand(p_latitude double precision, p_longitude double precision, p_channel text, p_user_id uuid DEFAULT NULL::uuid, p_whatsapp_user_id uuid DEFAULT NULL::uuid, p_address text DEFAULT NULL::text, p_wants_notification boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id UUID;
  v_nearest RECORD;
BEGIN
  IF p_user_id IS NULL AND p_whatsapp_user_id IS NULL THEN
    RAISE EXCEPTION 'A user or WhatsApp user is required';
  END IF;

  SELECT w.id INTO v_id
  FROM public.coverage_waitlist w
  WHERE w.closed_at IS NULL
    AND ((p_user_id IS NOT NULL AND w.user_id = p_user_id)
      OR (p_user_id IS NULL AND w.whatsapp_user_id = p_whatsapp_user_id))
    AND ST_DWithin(
      ST_SetSRID(ST_MakePoint(w.longitude, w.latitude), 4326)::geography,
      ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography,
      500
    )
  ORDER BY w.created_at DESC
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.coverage_waitlist
    SET request_count = request_count + 1,
        last_requested_at = now(),
        wants_notification = wants_notification OR p_wants_notification,
        address = COALESCE(p_address, address)
    WHERE id = v_id;
    RETURN v_id;
  END IF;

  SELECT c.zone_id, c.distance_km INTO v_nearest
  FROM public.check_service_coverage(p_latitude, p_longitude) c;

  INSERT INTO public.coverage_waitlist (
    user_id, whatsapp_user_id, channel, latitude, longitude, address,
    wants_notification, nearest_zone_id, nearest_zone_km
  ) VALUES (
    p_user_id, p_whatsapp_user_id, p_channel, p_latitude, p_longitude, p_address,
    p_wants_notification, v_nearest.zone_id, v_nearest.distance_km
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

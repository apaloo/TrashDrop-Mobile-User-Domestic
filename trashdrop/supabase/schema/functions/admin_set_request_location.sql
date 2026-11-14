-- Function public.admin_set_request_location
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- admin_set_request_location(p_source text, p_id text, p_lat double precision, p_lng double precision): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.admin_set_request_location(p_source text, p_id text, p_lat double precision, p_lng double precision)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  tbl text; key_id text; col record; n int := 0; pt text;
BEGIN
  IF NOT public.can_do('requests.locate') THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF public.td_supported_country(p_lat, p_lng) IS NULL THEN RAISE EXCEPTION 'Location must be in Ghana or Liberia'; END IF;
  pt := format('SRID=4326;POINT(%s %s)', p_lng, p_lat);
  -- digital bins and scheduled pickups keep the point on a linked location row
  IF p_source = 'digital_bins' AND to_regclass('public.bin_locations') IS NOT NULL THEN
    EXECUTE 'SELECT to_jsonb(b) ->> ''location_id'' FROM public.digital_bins b WHERE b.id::text = $1' INTO key_id USING p_id;
    tbl := CASE WHEN key_id IS NOT NULL THEN 'bin_locations' END;
  ELSIF p_source = 'scheduled_pickups' AND to_regclass('public.locations') IS NOT NULL THEN
    EXECUTE 'SELECT to_jsonb(s) ->> ''location_id'' FROM public.scheduled_pickups s WHERE s.id::text = $1' INTO key_id USING p_id;
    tbl := CASE WHEN key_id IS NOT NULL THEN 'locations' END;
  END IF;
  IF tbl IS NULL THEN
    IF p_source NOT IN ('pickup_requests', 'digital_bins', 'scheduled_pickups') THEN RAISE EXCEPTION 'Unknown source %', p_source; END IF;
    tbl := p_source; key_id := p_id;
  END IF;
  FOR col IN
    SELECT column_name, udt_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = tbl
      AND column_name IN ('coordinates', 'location', 'latitude', 'longitude')
  LOOP
    IF col.column_name = 'latitude' THEN
      EXECUTE format('UPDATE public.%I SET latitude = $1 WHERE id::text = $2', tbl) USING p_lat, key_id;
    ELSIF col.column_name = 'longitude' THEN
      EXECUTE format('UPDATE public.%I SET longitude = $1 WHERE id::text = $2', tbl) USING p_lng, key_id;
    ELSIF col.udt_name IN ('geometry', 'geography') THEN
      EXECUTE format('UPDATE public.%I SET %I = $1::%s WHERE id::text = $2', tbl, col.column_name, col.udt_name) USING pt, key_id;
    ELSIF col.udt_name IN ('jsonb', 'json') THEN
      EXECUTE format('UPDATE public.%I SET %I = $1::%s WHERE id::text = $2', tbl, col.column_name, col.udt_name)
        USING json_build_object('type', 'Point', 'coordinates', json_build_array(p_lng, p_lat))::text, key_id;
    ELSE
      EXECUTE format('UPDATE public.%I SET %I = $1 WHERE id::text = $2', tbl, col.column_name) USING pt, key_id;
    END IF;
    GET DIAGNOSTICS n = ROW_COUNT;
  END LOOP;
  IF n = 0 THEN RAISE EXCEPTION 'Request not found or it has no location field'; END IF;
END $function$;

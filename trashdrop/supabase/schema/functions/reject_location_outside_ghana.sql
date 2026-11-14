-- Function public.reject_location_outside_ghana
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- reject_location_outside_ghana(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.reject_location_outside_ghana()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  kind text := TG_ARGV[0];   -- 'point' (geometry/geography/WKT column) or 'latlng'
  lat double precision;
  lng double precision;
BEGIN
  BEGIN
    IF kind = 'point' THEN
      EXECUTE format('SELECT ST_Y(($1).%1$I::geometry), ST_X(($1).%1$I::geometry)', TG_ARGV[1])
        INTO lat, lng USING NEW;
    ELSE
      EXECUTE format('SELECT ($1).%I::double precision, ($1).%I::double precision', TG_ARGV[1], TG_ARGV[2])
        INTO lat, lng USING NEW;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW; -- unreadable value: don't block
  END;

  IF lat IS NULL OR lng IS NULL THEN
    RETURN NEW;
  END IF;

  IF abs(lat) < 0.01 AND abs(lng) < 0.01 THEN
    RAISE EXCEPTION 'Location is 0,0. Pick the pickup point on the map.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF public.td_supported_country(lat, lng) IS NULL THEN
    RAISE EXCEPTION 'Location (%, %) is outside Ghana and Liberia%.', round(lat::numeric, 5), round(lng::numeric, 5),
      CASE WHEN public.td_supported_country(lng, lat) IS NOT NULL
           THEN '; latitude and longitude look swapped' ELSE '' END
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

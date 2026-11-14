-- Function public.td_tag_area
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_tag_area(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_tag_area()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  n jsonb := to_jsonb(NEW);
  o jsonb;
  g geometry;
  a record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    o := to_jsonb(OLD);
    IF (o -> 'latitude', o -> 'longitude', o -> 'coordinates', o -> 'location')
       IS NOT DISTINCT FROM (n -> 'latitude', n -> 'longitude', n -> 'coordinates', n -> 'location') THEN
      NEW.region := OLD.region;
      NEW.district := OLD.district;
      RETURN NEW;
    END IF;
  END IF;
  NEW.region := NULL;
  NEW.district := NULL;
  BEGIN
    g := public.td_report_point(n);
    IF g IS NOT NULL THEN
      SELECT * INTO a FROM public.td_area_at(ST_Y(g), ST_X(g));
      NEW.region := a.region;
      NEW.district := a.district;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- never block a report or a request over its area
  END;
  RETURN NEW;
END $function$;

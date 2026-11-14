-- Function public.td_user_home_district
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_user_home_district(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_user_home_district()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  g geometry;
  d record;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  IF to_regclass('public.locations') IS NOT NULL THEN
    EXECUTE $q$
      SELECT public.td_report_point(to_jsonb(l)) FROM public.locations l
      WHERE l.user_id::text = $1
      ORDER BY coalesce((to_jsonb(l) ->> 'is_default')::boolean, false) DESC,
               (to_jsonb(l) ->> 'updated_at') DESC NULLS LAST, (to_jsonb(l) ->> 'created_at') DESC NULLS LAST
      LIMIT 1 $q$ INTO g USING auth.uid()::text;
  END IF;
  IF g IS NOT NULL THEN
    SELECT a.region, a.district INTO d FROM public.td_area_at(ST_Y(g), ST_X(g)) a;
    IF d.district IS NOT NULL THEN RETURN jsonb_build_object('region', d.region, 'district', d.district); END IF;
  END IF;
  SELECT pr.region, pr.district INTO d FROM public.pickup_requests pr
  WHERE pr.user_id = auth.uid() AND pr.district IS NOT NULL
  ORDER BY pr.created_at DESC LIMIT 1;
  IF d.district IS NOT NULL THEN RETURN jsonb_build_object('region', d.region, 'district', d.district); END IF;
  RETURN NULL;
END $function$;

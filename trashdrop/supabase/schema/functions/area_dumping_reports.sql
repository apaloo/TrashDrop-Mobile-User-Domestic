-- Function public.area_dumping_reports
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- area_dumping_reports(p_status text, p_region text, p_district text): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.area_dumping_reports(p_status text DEFAULT NULL::text, p_region text DEFAULT NULL::text, p_district text DEFAULT NULL::text)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  sc jsonb := public.td_report_scope();
BEGIN
  IF sc ->> 'level' = 'none' THEN RETURN; END IF;
  RETURN QUERY
  SELECT jsonb_build_object(
    'id', r.id,
    'reported_at', r.created_at,
    'updated_at', r.updated_at,
    'status', lower(coalesce(r.status, 'pending')),
    'severity', lower(coalesce(j ->> 'severity', 'medium')),
    'waste_type', lower(coalesce(j ->> 'waste_type', 'mixed')),
    'size', j ->> 'size',
    'region', r.region,
    'district', r.district,
    'area_name', nullif(btrim(j ->> 'area_name'), ''),
    'latitude', ST_Y(p.g),
    'longitude', ST_X(p.g),
    'completed_at', CASE WHEN r.status IN ('completed', 'disposed')
                      THEN coalesce((j ->> 'completed_at')::timestamptz, r.updated_at) END,
    'disposed_at', (j ->> 'disposed_at')::timestamptz,
    'disposal_site_name', j ->> 'disposal_site_name',
    'assigned_to', j ->> 'assigned_to',
    'assigned_via', j ->> 'assigned_via',
    'team_name', (SELECT nullif(btrim(concat_ws(' ', cp.first_name, cp.last_name)), '')
                  FROM public.collector_profiles cp WHERE cp.id::text = j ->> 'assigned_to'),
    'photos', public.td_https_links(j -> 'photos'),
    'cleanup_photos', public.td_https_links(j -> 'cleanup_photos'))
  FROM public.illegal_dumping_mobile r
  CROSS JOIN LATERAL (SELECT to_jsonb(r) AS j) jr
  CROSS JOIN LATERAL (SELECT public.td_report_point(jr.j) AS g) p
  WHERE public.td_in_scope(sc, r.region, r.district)
    AND (p_status IS NULL OR lower(r.status) = lower(p_status))
    AND (p_region IS NULL OR r.region = p_region)
    AND (p_district IS NULL OR r.district = p_district)
  ORDER BY r.created_at DESC
  LIMIT 5000;
END $function$;
